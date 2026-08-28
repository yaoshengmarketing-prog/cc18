import {spawn} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {queueStoreFromEnvironment} from '../queue/store.mjs';
import {assertEditorialProviderReady, loadLocalEditorialEnvironment} from './lib/openai-writer.mjs';
import {assertFreshAutomatedQa} from './lib/approval.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const requestedId = process.argv.slice(2).find((argument) => !argument.startsWith('--'))?.trim().toUpperCase();
const resumeDraft = process.argv.includes('--resume-draft');
const finalizeOnly = process.argv.includes('--finalize-only');
if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(requestedId ?? '')) {
  throw new Error('Usage: npm run editorial:draft-canary -- <MOVIE-ID>');
}
if (process.env.CC18_ALLOW_EDITORIAL_TRANSMISSION !== 'YES') {
  throw new Error('Draft canary requires CC18_ALLOW_EDITORIAL_TRANSMISSION=YES');
}

loadLocalEditorialEnvironment(root);
const [pipeline, editorialModel, registry] = await Promise.all([
  readFile(resolve(root, 'config/pipeline.json'), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'config/editorial-model.json'), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'data/movie-registry.json'), 'utf8').then(JSON.parse),
]);
assertEditorialProviderReady(editorialModel);

const existingRecord = registry.records.find(({id}) => id === requestedId);
if (existingRecord && (!resumeDraft || existingRecord.review_status !== 'draft')) {
  throw new Error(`${requestedId}: Registry already contains this work; use --resume-draft only for an existing draft`);
}

const store = queueStoreFromEnvironment({mode: 'd1'});
const movie = await store.getMovie(requestedId);
if (!movie || movie.classification !== 'eligible' || movie.metadata_status !== 'validated') {
  throw new Error(`${requestedId}: not an eligible validated D1 work`);
}

const source = JSON.parse(movie.source_json);
if (source.id !== requestedId) throw new Error(`${requestedId}: D1 source identity mismatch`);
await mkdir(resolve(root, 'data', 'source-records'), {recursive: true});
await writeFile(resolve(root, 'data', 'source-records', `${requestedId}.json`), `${JSON.stringify(source, null, 2)}\n`, 'utf8');

const run = (script, args, allowFailure = false) => new Promise((resolveRun, rejectRun) => {
  const childEnvironment = {...process.env};
  delete childEnvironment.CLOUDFLARE_API_TOKEN;
  delete childEnvironment.CLOUDFLARE_ACCOUNT_ID;
  delete childEnvironment.CLOUDFLARE_D1_DATABASE_ID;
  const child = spawn(process.execPath, [resolve(root, script), ...args], {
    cwd: root,
    env: childEnvironment,
    windowsHide: true,
    stdio: 'inherit',
  });
  child.once('error', rejectRun);
  child.once('exit', (code) => code === 0 || allowFailure ? resolveRun(code ?? 1) : rejectRun(new Error(`${script} exited with ${code}`)));
});

let approved = false;
let rewriteAttempt = 0;
let lastBuildError = null;
if (finalizeOnly) {
  const qaExitCode = await run('scripts/editorial/qa-draft.mjs', [requestedId], true);
  approved = qaExitCode === 0;
} else {
  for (; rewriteAttempt <= editorialModel.qa_rewrite_limit; rewriteAttempt += 1) {
    const buildArguments = [requestedId, '--source-only', `--rewrite-attempt=${rewriteAttempt}`];
    if (rewriteAttempt > 0) buildArguments.push(`--qa-feedback=${resolve(root, 'data', 'review-quality', `${requestedId}-automated.json`)}`);
    try {
      await run('scripts/editorial/build-from-analysis.mjs', buildArguments);
      lastBuildError = null;
    } catch (error) {
      lastBuildError = error.message;
      continue;
    }
    const qaExitCode = await run('scripts/editorial/qa-draft.mjs', [requestedId], true);
    if (qaExitCode === 0) {
      approved = true;
      break;
    }
    const qaReport = JSON.parse(await readFile(resolve(root, 'data', 'review-quality', `${requestedId}-automated.json`), 'utf8'));
    if (qaReport.status === 'LOCAL_REPAIR') {
      const repairExitCode = await run('scripts/editorial/repair-draft.mjs', [requestedId], true);
      if (repairExitCode === 0) {
        approved = true;
        break;
      }
    }
  }
}
if (!approved) throw new Error(`${requestedId}: QA failed after ${editorialModel.qa_rewrite_limit} rewrites${lastBuildError ? `; last build error: ${lastBuildError}` : ''}`);

const [finalRegistry, automatedQuality, review] = await Promise.all([
  readFile(resolve(root, 'data/movie-registry.json'), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'data/review-quality', `${requestedId}-automated.json`), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'content/reviews', `${requestedId}.md`), 'utf8'),
]);
const record = finalRegistry.records.find(({id}) => id === requestedId);
if (!record || record.review_status !== 'draft') throw new Error(`${requestedId}: draft canary must leave Registry status as draft`);
assertFreshAutomatedQa({movieId: requestedId, markdown: review, report: automatedQuality});
if (!/^status:\s*draft\s*$/m.test(review)) throw new Error(`${requestedId}: generated review is not marked draft`);

const report = {
  schema_version: 1,
  movie_id: requestedId,
  finished_at: new Date().toISOString(),
  mode: 'draft_only',
  resumed_existing_draft: resumeDraft,
  finalize_only: finalizeOnly,
  source: 'cloudflare_d1_read_only',
  rewrite_attempts: rewriteAttempt,
  qa_passed: true,
  registry_status: record.review_status,
  queue_mutated: false,
  image_enqueued: false,
  published: false,
  daily_enabled: pipeline.publishing.daily_enabled,
};
await mkdir(resolve(root, '.cc18-canary'), {recursive: true});
const reportPath = resolve(root, '.cc18-canary', `draft-${requestedId}-${Date.now()}.json`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({...report, report_path: reportPath}, null, 2));
