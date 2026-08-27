import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {queueStoreFromEnvironment} from '../queue/store.mjs';
import {approveAfterAutomatedQa} from './lib/approval.mjs';

const movieId = process.argv[2]?.trim().toUpperCase();
if (!movieId || !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId)) throw new Error('Usage: npm run editorial:d1:finalize-qa -- <MOVIE-ID>');

const root = resolve(import.meta.dirname, '..', '..');
const report = JSON.parse(await readFile(resolve(root, 'data', 'review-quality', `${movieId}-automated.json`), 'utf8'));
if (report.id !== movieId || report.passed !== true || report.issues?.length) {
  throw new Error(`${movieId}: local QA report is not approved`);
}
const reviewPath = resolve(root, 'content', 'reviews', `${movieId}.md`);
const qualityPath = resolve(root, 'data', 'review-quality', `${movieId}.json`);
const registryPath = resolve(root, 'data', 'movie-registry.json');
const [markdown, quality, registry] = await Promise.all([
  readFile(reviewPath, 'utf8'), readFile(qualityPath, 'utf8').then(JSON.parse), readFile(registryPath, 'utf8').then(JSON.parse),
]);
const approved = approveAfterAutomatedQa({movieId, markdown, quality, registry, publishedAt: new Date().toISOString().slice(0, 10)});
await Promise.all([
  writeFile(reviewPath, approved.markdown, 'utf8'),
  writeFile(qualityPath, `${JSON.stringify(approved.quality, null, 2)}\n`, 'utf8'),
  writeFile(registryPath, `${JSON.stringify(approved.registry, null, 2)}\n`, 'utf8'),
]);
const store = queueStoreFromEnvironment({mode: 'd1'});
const job = await store.findJob({movieId, stage: 'editorial'});
if (!job) throw new Error(`${movieId}: editorial D1 job not found`);
const completed = await store.completeBlockedAfterQa({jobId: job.id, allowedErrorCodes: ['EDITORIAL_QA_FAILED']});
if (!completed) throw new Error(`${movieId}: D1 job is not a QA-blocked job`);
const imageJob = await store.enqueueJob({movieId, stage: 'image', priority: completed.priority, discoveryRunId: completed.discovery_run_id});
console.log(JSON.stringify({movie_id: movieId, editorial_job_id: completed.id, status: completed.status, publication_status: 'published', image_job_id: imageJob.id}, null, 2));
