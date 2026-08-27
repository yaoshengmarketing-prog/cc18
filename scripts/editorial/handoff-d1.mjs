import {hostname} from 'node:os';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {queueStoreFromEnvironment} from '../queue/store.mjs';
import {assertEditorialProviderReady, loadLocalEditorialEnvironment} from './lib/openai-writer.mjs';
import {loadBridgeConfig} from '../bridge/lib/config.mjs';
import {assertLocalAnalyzerReady} from '../bridge/lib/local-analysis.mjs';
import {approveAfterAutomatedQa, assertFreshAutomatedQa} from './lib/approval.mjs';

let movieId = process.argv.slice(2).find((argument) => !argument.startsWith('--'))?.trim().toUpperCase();
const qaOnly = process.argv.includes('--qa-only');
const retryNow = process.argv.includes('--retry-now');
const sourceOnly = process.argv.includes('--source-only');
if ((!sourceOnly || movieId) && !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId ?? '')) {
  throw new Error('Usage: npm run editorial:d1:handoff -- <MOVIE-ID> [--source-only], or --source-only for the next queued work');
}

const root = resolve(import.meta.dirname, '..', '..');
loadLocalEditorialEnvironment(root);
const pipeline = JSON.parse(await readFile(resolve(root, 'config/pipeline.json'), 'utf8'));
const editorialModel = JSON.parse(await readFile(resolve(root, 'config/editorial-model.json'), 'utf8'));
assertEditorialProviderReady(editorialModel);
const bridgeConfig = await loadBridgeConfig(resolve(root, 'config/media-bridge.json'));
await assertLocalAnalyzerReady(bridgeConfig);
const store = queueStoreFromEnvironment({mode: 'd1'});
const workerId = `editorial-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
let mediaJob = null;
let editorialJob = null;
let claimed = null;
if (sourceOnly && !movieId) {
  claimed = await store.claim({stage: 'editorial', workerId, leaseSeconds: pipeline.queue.lease_seconds});
  if (!claimed) {
    console.log(JSON.stringify({event: 'editorial_queue_empty', stage: 'editorial'}));
    process.exit(0);
  }
  movieId = claimed.movie_id;
  editorialJob = claimed;
} else {
  mediaJob = sourceOnly ? null : await store.findJob({movieId, stage: 'media_analysis', status: 'completed'});
  if (!sourceOnly && !mediaJob) throw new Error(`${movieId}: no completed D1 media_analysis job`);
  editorialJob = await store.enqueueJob({movieId, stage: 'editorial', priority: mediaJob?.priority ?? 1, discoveryRunId: mediaJob?.discovery_run_id ?? null});
  if (retryNow && editorialJob.status === 'retry') {
    editorialJob = await store.requeueRetry({jobId: editorialJob.id, allowedErrorCodes: ['EDITORIAL_GENERATION_FAILED']}) ?? editorialJob;
  }
  if (editorialJob.status === 'blocked' && ['EDITORIAL_QA_FAILED', 'EDITORIAL_GENERATION_FAILED'].includes(editorialJob.last_error_code)) {
    editorialJob = await store.requeueBlocked({jobId: editorialJob.id, allowedErrorCodes: ['EDITORIAL_QA_FAILED', 'EDITORIAL_GENERATION_FAILED']});
  }
  claimed = await store.claim({stage: 'editorial', jobId: editorialJob.id, workerId, leaseSeconds: pipeline.queue.lease_seconds});
  if (!claimed) throw new Error(`${movieId}: editorial job is not claimable (current status: ${editorialJob.status})`);
}

const movie = await store.getMovie(movieId);
if (!movie) {
  await store.finishJob({jobId: claimed.id, workerId, outcome: 'failed', errorCode: 'MOVIE_SOURCE_MISSING'});
  throw new Error(`${movieId}: D1 movie record not found`);
}
const analysisPath = sourceOnly ? null : resolve(root, '.cc18-bridge', 'runtime', 'jobs', mediaJob.id, 'analysis.json');
if (!sourceOnly) {
  const analysis = JSON.parse(await readFile(analysisPath, 'utf8'));
  if (analysis.movie_id !== movieId || analysis.job_id !== mediaJob.id) throw new Error(`${movieId}: local analysis identity mismatch`);
}
const source = JSON.parse(movie.source_json);
await mkdir(resolve(root, 'data', 'source-records'), {recursive: true});
await writeFile(resolve(root, 'data', 'source-records', `${movieId}.json`), `${JSON.stringify(source, null, 2)}\n`);

const childEnvironment = {...process.env};
delete childEnvironment.CLOUDFLARE_API_TOKEN;
delete childEnvironment.CLOUDFLARE_ACCOUNT_ID;
delete childEnvironment.CLOUDFLARE_D1_DATABASE_ID;
const run = (script, args, failureCode, allowFailure = false) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(process.execPath, [resolve(root, script), ...args], {cwd: root, env: childEnvironment, stdio: 'inherit'});
  child.once('error', rejectRun);
  child.once('exit', (code) => code === 0 || allowFailure
    ? resolveRun(code)
    : rejectRun(Object.assign(new Error(`${script} exited with ${code}`), {code: failureCode})));
});

const leaseIntervalMs = Math.max(30_000, Math.floor(pipeline.queue.lease_seconds * 1000 / 3));
let leasePending = Promise.resolve();
let leaseActive = false;
let leaseFailure = null;
const leaseTimer = setInterval(() => {
  if (leaseActive) return;
  leaseActive = true;
  leasePending = store.renewLease({jobId: claimed.id, workerId, leaseSeconds: pipeline.queue.lease_seconds})
    .catch((error) => { leaseFailure = error; })
    .finally(() => { leaseActive = false; });
}, leaseIntervalMs);
leaseTimer.unref();
const stopLease = async () => {
  clearInterval(leaseTimer);
  await leasePending;
  if (leaseFailure) throw Object.assign(new Error(`Editorial lease renewal failed: ${leaseFailure.message}`), {code: 'LEASE_LOST'});
};

try {
  if (qaOnly) {
    await run('scripts/editorial/qa-draft.mjs', [movieId], 'EDITORIAL_QA_FAILED');
  } else {
    const qaReportPath = resolve(root, 'data', 'review-quality', `${movieId}-automated.json`);
    let approved = false;
    for (let rewriteAttempt = 0; rewriteAttempt <= editorialModel.qa_rewrite_limit; rewriteAttempt += 1) {
      const buildArguments = [movieId, `--rewrite-attempt=${rewriteAttempt}`];
      if (sourceOnly) buildArguments.push('--source-only');
      else buildArguments.push(`--analysis=${analysisPath}`);
      if (rewriteAttempt > 0) buildArguments.push(`--qa-feedback=${qaReportPath}`);
      await run('scripts/editorial/build-from-analysis.mjs', buildArguments, 'EDITORIAL_GENERATION_FAILED');
      const qaExitCode = await run('scripts/editorial/qa-draft.mjs', [movieId], 'EDITORIAL_QA_FAILED', true);
      if (qaExitCode === 0) {
        approved = true;
        break;
      }
    }
    if (!approved) throw Object.assign(new Error(`${movieId}: QA failed after ${editorialModel.qa_rewrite_limit} rewrites`), {code: 'EDITORIAL_QA_FAILED'});
  }
  const reviewPath = resolve(root, 'content', 'reviews', `${movieId}.md`);
  const qualityPath = resolve(root, 'data', 'review-quality', `${movieId}.json`);
  const registryPath = resolve(root, 'data', 'movie-registry.json');
  const automated = JSON.parse(await readFile(resolve(root, 'data', 'review-quality', `${movieId}-automated.json`), 'utf8'));
  const [markdown, quality, registry] = await Promise.all([
    readFile(reviewPath, 'utf8'), readFile(qualityPath, 'utf8').then(JSON.parse), readFile(registryPath, 'utf8').then(JSON.parse),
  ]);
  try {
    assertFreshAutomatedQa({movieId, markdown, report: automated});
  } catch (error) {
    throw Object.assign(error, {code: 'EDITORIAL_QA_FAILED'});
  }
  const approvedArtifacts = approveAfterAutomatedQa({movieId, markdown, quality, registry, publishedAt: new Date().toISOString().slice(0, 10)});
  await Promise.all([
    writeFile(reviewPath, approvedArtifacts.markdown, 'utf8'),
    writeFile(qualityPath, `${JSON.stringify(approvedArtifacts.quality, null, 2)}\n`, 'utf8'),
    writeFile(registryPath, `${JSON.stringify(approvedArtifacts.registry, null, 2)}\n`, 'utf8'),
  ]);
  await stopLease();
  await store.finishJob({jobId: claimed.id, workerId, outcome: 'completed'});
  const imageJob = await store.enqueueJob({movieId, stage: 'image', priority: claimed.priority, discoveryRunId: claimed.discovery_run_id});
  console.log(JSON.stringify({movie_id: movieId, editorial_job_id: claimed.id, status: 'completed', publication_status: 'published', image_job_id: imageJob.id, editorial_mode: sourceOnly ? 'creative_first_source_only' : 'creative_first_video_enhanced'}, null, 2));
} catch (error) {
  clearInterval(leaseTimer);
  await leasePending;
  const outcome = error?.code === 'EDITORIAL_QA_FAILED' ? 'blocked' : (claimed.attempt >= claimed.max_attempts ? 'failed' : 'retry');
  await store.finishJob({
    jobId: claimed.id,
    workerId,
    outcome,
    errorCode: error?.code || 'EDITORIAL_GENERATION_FAILED',
    retryAt: outcome === 'retry' ? new Date(Date.now() + 30 * 60_000).toISOString() : null,
  });
  throw error;
}
