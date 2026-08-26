import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {queueStoreFromEnvironment} from '../queue/store.mjs';

const movieId = process.argv[2]?.trim().toUpperCase();
if (!movieId || !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId)) throw new Error('Usage: npm run editorial:d1:finalize-qa -- <MOVIE-ID>');

const root = resolve(import.meta.dirname, '..', '..');
const report = JSON.parse(await readFile(resolve(root, 'data', 'review-quality', `${movieId}-automated.json`), 'utf8'));
if (report.id !== movieId || report.passed !== true || report.issues?.length) {
  throw new Error(`${movieId}: local QA report is not approved`);
}
const store = queueStoreFromEnvironment({mode: 'd1'});
const job = await store.findJob({movieId, stage: 'editorial'});
if (!job) throw new Error(`${movieId}: editorial D1 job not found`);
const completed = await store.completeBlockedAfterQa({jobId: job.id, allowedErrorCodes: ['EDITORIAL_QA_FAILED']});
if (!completed) throw new Error(`${movieId}: D1 job is not a QA-blocked job`);
console.log(JSON.stringify({movie_id: movieId, editorial_job_id: completed.id, status: completed.status, publication_status: 'draft'}, null, 2));
