import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {queueStoreFromEnvironment} from '../queue/store.mjs';

const movieId = process.argv[2]?.trim().toUpperCase();
if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId ?? '')) {
  throw new Error('Usage: node scripts/media/repair-published-one.mjs MOVIE-ID');
}
const root = resolve(import.meta.dirname, '..', '..');
const store = queueStoreFromEnvironment({mode: 'd1'});
const movie = await store.getMovie(movieId);
if (!movie || JSON.parse(movie.source_json).id !== movieId) throw new Error(`${movieId}: D1 source identity mismatch`);
const [editorial, publish] = await Promise.all([
  store.findJob({movieId, stage: 'editorial'}),
  store.findJob({movieId, stage: 'publish'}),
]);
if (editorial?.status !== 'completed' || publish?.status !== 'completed') {
  throw new Error(`${movieId}: media repair requires completed Editorial and publication`);
}
const review = await readFile(resolve(root, `content/reviews/${movieId}.md`), 'utf8');
if (!/^status: published$/m.test(review)) throw new Error(`${movieId}: local review is not published`);

const job = (stage) => store.findJob({movieId, stage});
const manifest = async () => JSON.parse(await readFile(resolve(root, `data/media-manifests/${movieId}.json`), 'utf8'));
const run = (script) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(process.execPath, [resolve(root, script), movieId], {cwd: root, stdio: 'inherit'});
  child.once('error', rejectRun);
  child.once('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`${script} exited with ${code}`)));
});
const ensureNotLeased = async (stage) => {
  const current = await job(stage);
  if (current?.status === 'leased') throw new Error(`${movieId}: ${stage} is already leased`);
  return current;
};

await Promise.all(['image', 'video', 'publish'].map(ensureNotLeased));
let image = await job('image');
if (image?.status !== 'completed') await run('scripts/image/process-d1-one.mjs');
image = await job('image');
if (image?.status !== 'completed') throw new Error(`${movieId}: image repair did not complete; see image_failure_non_blocking diagnostic`);
const imageManifest = await manifest();
if (!['article_hero', 'vertical_scene'].every((role) => imageManifest.assets?.some((asset) => asset.role === role))) {
  throw new Error(`${movieId}: completed image job has an incomplete media manifest`);
}

let video = await job('video');
let videoFailure = null;
if (video?.status !== 'completed') {
  try { await run('scripts/video/process-d1-one.mjs'); }
  catch (error) { videoFailure = error; }
}
video = await job('video');
if (video?.status === 'completed') {
  const videoManifest = await manifest();
  if (videoManifest.video?.status !== 'rendered_and_uploaded' || !videoManifest.video?.public_path) {
    throw new Error(`${movieId}: completed video job has an incomplete media manifest`);
  }
}

// A verified image can be published even when optional video rendering fails.
await run('scripts/publish/process-d1-one.mjs');
console.log(JSON.stringify({event: 'published_media_repair', movie_id: movieId,
  image_status: image.status, video_status: video?.status ?? null,
  publish_status: (await job('publish'))?.status ?? null}));
if (videoFailure) throw videoFailure;
if (video?.status !== 'completed') throw new Error(`${movieId}: video repair did not complete`);
