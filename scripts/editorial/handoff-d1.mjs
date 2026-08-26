import {hostname} from 'node:os';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {queueStoreFromEnvironment} from '../queue/store.mjs';
import {assertEditorialProviderReady} from './lib/openai-writer.mjs';

const movieId = process.argv[2]?.trim().toUpperCase();
const qaOnly = process.argv.includes('--qa-only');
if (!movieId || !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId)) {
  throw new Error('Usage: npm run editorial:d1:handoff -- <MOVIE-ID>');
}

const root = resolve(import.meta.dirname, '..', '..');
const pipeline = JSON.parse(await readFile(resolve(root, 'config/pipeline.json'), 'utf8'));
const editorialModel = JSON.parse(await readFile(resolve(root, 'config/editorial-model.json'), 'utf8'));
assertEditorialProviderReady(editorialModel);
const store = queueStoreFromEnvironment({mode: 'd1'});
const mediaJob = await store.findJob({movieId, stage: 'media_analysis', status: 'completed'});
if (!mediaJob) throw new Error(`${movieId}: no completed D1 media_analysis job`);
const movie = await store.getMovie(movieId);
if (!movie) throw new Error(`${movieId}: D1 movie record not found`);

const analysisPath = resolve(root, '.cc18-bridge', 'runtime', 'jobs', mediaJob.id, 'analysis.json');
const analysis = JSON.parse(await readFile(analysisPath, 'utf8'));
if (analysis.movie_id !== movieId || analysis.job_id !== mediaJob.id) throw new Error(`${movieId}: local analysis identity mismatch`);

const source = JSON.parse(movie.source_json);
await mkdir(resolve(root, 'data', 'source-records'), {recursive: true});
await writeFile(resolve(root, 'data', 'source-records', `${movieId}.json`), `${JSON.stringify(source, null, 2)}\n`);

let editorialJob = await store.enqueueJob({
  movieId,
  stage: 'editorial',
  priority: mediaJob.priority,
  discoveryRunId: mediaJob.discovery_run_id,
});
if (editorialJob.status === 'blocked' && ['EDITORIAL_QA_FAILED', 'EDITORIAL_GENERATION_FAILED'].includes(editorialJob.last_error_code)) {
  editorialJob = await store.requeueBlocked({
    jobId: editorialJob.id,
    allowedErrorCodes: ['EDITORIAL_QA_FAILED', 'EDITORIAL_GENERATION_FAILED'],
  });
}
const workerId = `editorial-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
const claimed = await store.claim({stage: 'editorial', jobId: editorialJob.id, workerId, leaseSeconds: pipeline.queue.lease_seconds});
if (!claimed) throw new Error(`${movieId}: editorial job is not claimable (current status: ${editorialJob.status})`);

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
      const buildArguments = [movieId, `--analysis=${analysisPath}`, `--rewrite-attempt=${rewriteAttempt}`];
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
  await stopLease();
  await store.finishJob({jobId: claimed.id, workerId, outcome: 'completed'});
  console.log(JSON.stringify({movie_id: movieId, editorial_job_id: claimed.id, status: 'completed', publication_status: 'draft'}, null, 2));
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
