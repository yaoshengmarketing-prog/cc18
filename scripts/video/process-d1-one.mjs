import {hostname} from 'node:os';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {queueStoreFromEnvironment} from '../queue/store.mjs';

const requestedMovieId = process.argv[2]?.trim().toUpperCase() ?? null;
if (requestedMovieId && !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(requestedMovieId)) throw new Error('Usage: npm run video:d1:process-one -- [MOVIE-ID]');
const root = resolve(import.meta.dirname, '..', '..');
const pipeline = JSON.parse(await readFile(resolve(root, 'config/pipeline.json'), 'utf8'));
const store = queueStoreFromEnvironment({mode: 'd1'});
let job = requestedMovieId ? await store.findJob({movieId: requestedMovieId, stage: 'video'}) : null;
if (requestedMovieId && !job) job = await store.enqueueJob({movieId: requestedMovieId, stage: 'video'});
if (requestedMovieId && job?.status === 'retry') {
  job = await store.requeueRetry({jobId: job.id, allowedErrorCodes: ['VIDEO_RENDER_FAILED']}) ?? job;
}
const workerId = `video-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
const claimed = await store.claim({stage: 'video', jobId: job?.id ?? null, workerId, leaseSeconds: pipeline.queue.lease_seconds});
if (!claimed) {
  console.log(JSON.stringify({event: 'video_queue_empty', stage: 'video'}));
  process.exit(0);
}
const movieId = claimed.movie_id;
const slug = movieId.toLowerCase();
const runtime = resolve(root, '.cc18-video', 'runtime', claimed.id);
const output = resolve(runtime, `${slug}.mp4`);
await mkdir(runtime, {recursive: true});
const run = (command, args) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(command, args, {cwd: root, stdio: 'inherit'});
  child.once('error', rejectRun);
  child.once('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`${command} exited with ${code}`)));
});

try {
  const imageJob = await store.findJob({movieId, stage: 'image', status: 'completed'});
  if (!imageJob) throw Object.assign(new Error(`${movieId}: completed image job not found`), {code: 'VIDEO_IMAGES_NOT_READY'});
  await run(process.execPath, [resolve(root, 'scripts/video/build-props.mjs'), movieId]);
  await readFile(resolve(root, `video/examples/${slug}.json`), 'utf8');
  const remotion = resolve(root, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
  await run(process.execPath, [remotion, 'render', 'video/src/index.ts', 'CC18Vertical', output, `--props=video/examples/${slug}.json`, '--codec=h264', '--crf=18', '--pixel-format=yuv420p']);
  await run(process.execPath, [resolve(root, 'scripts/video/finalize-video.mjs'), movieId, `--input=${output}`]);
  await store.finishJob({jobId: claimed.id, workerId, outcome: 'completed'});
  const publishJob = await store.enqueueJob({movieId, stage: 'publish', priority: claimed.priority, discoveryRunId: claimed.discovery_run_id});
  console.log(JSON.stringify({movie_id: movieId, video_job_id: claimed.id, status: 'completed', publish_job_id: publishJob.id, publish_status: publishJob.status}, null, 2));
} catch (error) {
  const outcome = claimed.attempt >= claimed.max_attempts ? 'failed' : 'retry';
  await store.finishJob({jobId: claimed.id, workerId, outcome, errorCode: error?.code ?? 'VIDEO_RENDER_FAILED', retryAt: outcome === 'retry' ? new Date(Date.now() + 30 * 60_000).toISOString() : null});
  throw error;
} finally {
  if (runtime.startsWith(resolve(root, '.cc18-video', 'runtime'))) await rm(runtime, {recursive: true, force: true});
}
