import {spawn} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {queueStoreFromEnvironment} from '../queue/store.mjs';
import {approveAfterAutomatedQa, assertFreshAutomatedQa} from './lib/approval.mjs';

const movieId = process.argv[2]?.trim().toUpperCase();
if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId ?? '')) {
  throw new Error('Usage: node scripts/editorial/rehydrate-completed.mjs MOVIE-ID');
}

const root = resolve(import.meta.dirname, '..', '..');
const store = queueStoreFromEnvironment({mode: 'd1'});
const job = await store.findJob({movieId, stage: 'editorial'});
if (job?.status !== 'completed') throw new Error(`${movieId}: editorial D1 job is not completed`);

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
