import {spawn} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {queueStoreFromEnvironment} from '../queue/store.mjs';
import {approveAfterAutomatedQa, assertFreshAutomatedQa} from './lib/approval.mjs';
import {RECOVERY_MOVIE_IDS, recoverReviewedSourceBinding} from './lib/recover23-source-binding.mjs';
import {isMissingEditorialRecoveryMovie, recoverMissingEditorial} from './lib/recover-missing-editorial.mjs';

const movieId = process.argv[2]?.trim().toUpperCase();
if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId ?? '')) {
  throw new Error('Usage: node scripts/editorial/rehydrate-completed.mjs MOVIE-ID');
}

const root = resolve(import.meta.dirname, '..', '..');
const store = queueStoreFromEnvironment({mode: 'd1'});
const job = await store.findJob({movieId, stage: 'editorial'});
if (job?.status !== 'completed') throw new Error(`${movieId}: editorial D1 job is not completed`);

if (isMissingEditorialRecoveryMovie(movieId)) {
  let currentSourceText;
  try {
    await readFile(resolve(root, 'content/reviews', `${movieId}.md`), 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const movie = await store.getMovie(movieId);
    if (typeof movie?.source_json !== 'string') throw new Error(`${movieId}: no D1 source snapshot for reviewed recovery`);
    currentSourceText = `${JSON.stringify(JSON.parse(movie.source_json), null, 2)}\n`;
  }
  const recovery = await recoverMissingEditorial({root, movieId, currentSourceText});
  if (recovery.restored) console.log(JSON.stringify({event: 'preserved_editorial_restored', ...recovery}));
}
if (RECOVERY_MOVIE_IDS.includes(movieId)) {
  const manifest = JSON.parse(await readFile(resolve(root, 'config/recover23-source-bindings.json'), 'utf8'));
  const recovery = await recoverReviewedSourceBinding({root, movieId, manifest});
  if (recovery.changed) console.log(JSON.stringify({event: 'reviewed_source_binding_recovered', ...recovery}));
}

const run = (script, args) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(process.execPath, [resolve(root, script), ...args], {cwd: root, env: process.env, stdio: 'inherit'});
  child.once('error', rejectRun);
  child.once('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`${script} exited with ${code}`)));
});
await run('scripts/editorial/qa-draft.mjs', [movieId]);

const reviewPath = resolve(root, 'content', 'reviews', `${movieId}.md`);
const qualityPath = resolve(root, 'data', 'review-quality', `${movieId}.json`);
const registryPath = resolve(root, 'data', 'movie-registry.json');
const automatedPath = resolve(root, 'data', 'review-quality', `${movieId}-automated.json`);
const [markdown, quality, registry, automated] = await Promise.all([
  readFile(reviewPath, 'utf8'),
  readFile(qualityPath, 'utf8').then(JSON.parse),
  readFile(registryPath, 'utf8').then(JSON.parse),
  readFile(automatedPath, 'utf8').then(JSON.parse),
]);
assertFreshAutomatedQa({movieId, markdown, report: automated});
const approved = approveAfterAutomatedQa({
  movieId, markdown, quality, registry, publishedAt: new Date().toISOString().slice(0, 10),
});
await Promise.all([
  writeFile(reviewPath, approved.markdown, 'utf8'),
  writeFile(qualityPath, `${JSON.stringify(approved.quality, null, 2)}\n`, 'utf8'),
  writeFile(registryPath, `${JSON.stringify(approved.registry, null, 2)}\n`, 'utf8'),
]);
console.log(JSON.stringify({movie_id: movieId, editorial_job_id: job.id, status: 'rehydrated_from_completed_d1', publication_status: 'published'}, null, 2));
