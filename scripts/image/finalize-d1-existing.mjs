import {hostname} from 'node:os';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {queueStoreFromEnvironment} from '../queue/store.mjs';

const movieId = process.argv[2]?.trim().toUpperCase();
if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId ?? '')) throw new Error('Usage: npm run image:d1:finalize-existing -- MOVIE-ID');
const root = resolve(import.meta.dirname, '..', '..');
const manifest = JSON.parse(await readFile(resolve(root, `data/media-manifests/${movieId}.json`), 'utf8'));
const review = await readFile(resolve(root, `content/reviews/${movieId}.md`), 'utf8');
const hero = manifest.assets?.find(({role}) => role === 'article_hero');
const vertical = manifest.assets?.find(({role}) => role === 'vertical_scene');
if (!hero || !vertical || !review.includes(`heroUrl: ${hero.path}`) || !review.includes('imageStatus: rendered')) {
  throw new Error(`${movieId}: local artwork finalization is incomplete`);
}
const store = queueStoreFromEnvironment({mode: 'd1'});
const editorial = await store.findJob({movieId, stage: 'editorial', status: 'completed'});
if (!editorial) throw new Error(`${movieId}: completed editorial job not found`);
let imageJob = await store.findJob({movieId, stage: 'image'});
if (!imageJob) imageJob = await store.enqueueJob({movieId, stage: 'image', priority: editorial.priority, discoveryRunId: editorial.discovery_run_id});
if (imageJob.status !== 'completed') {
  const workerId = `image-import-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const claimed = await store.claim({stage: 'image', jobId: imageJob.id, workerId});
  if (!claimed) throw new Error(`${movieId}: image job is not claimable (${imageJob.status})`);
  imageJob = await store.finishJob({jobId: claimed.id, workerId, outcome: 'completed'});
}
const videoJob = await store.enqueueJob({movieId, stage: 'video', priority: imageJob.priority, discoveryRunId: imageJob.discovery_run_id});
console.log(JSON.stringify({movie_id: movieId, image_job_id: imageJob.id, image_status: imageJob.status, video_job_id: videoJob.id, video_status: videoJob.status}, null, 2));
