import {hostname} from 'node:os';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {queueStoreFromEnvironment} from '../queue/store.mjs';
import {loadLocalEditorialEnvironment} from '../editorial/lib/openai-writer.mjs';
import {awaitImageTask, createImageTask, downloadGeneratedImage, imageApiKey, listImageModels, selectImageSpec} from './lib/aitokenking-image.mjs';
import {buildArtworkPrompts} from './lib/artwork-prompt.mjs';
import {assertApprovedReviewForMedia} from './lib/approval-gate.mjs';

const requestedMovieId = process.argv[2]?.trim().toUpperCase() ?? null;
if (requestedMovieId && !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(requestedMovieId)) throw new Error('Usage: npm run image:d1:process-one -- [MOVIE-ID]');
const root = resolve(import.meta.dirname, '..', '..');
loadLocalEditorialEnvironment(root);
const config = JSON.parse(await readFile(resolve(root, 'config/image-model.json'), 'utf8'));
const pipeline = JSON.parse(await readFile(resolve(root, 'config/pipeline.json'), 'utf8'));
const assertLocalApproval = async (movieId) => {
  const [markdown, quality, registry] = await Promise.all([
    readFile(resolve(root, 'content', 'reviews', `${movieId}.md`), 'utf8'),
    readFile(resolve(root, 'data', 'review-quality', `${movieId}.json`), 'utf8').then(JSON.parse),
    readFile(resolve(root, 'data', 'movie-registry.json'), 'utf8').then(JSON.parse),
  ]);
  return assertApprovedReviewForMedia({movieId, markdown, quality, registry});
};
if (requestedMovieId) await assertLocalApproval(requestedMovieId);
const apiKey = imageApiKey(config);
if (!apiKey) throw Object.assign(new Error(`${config.api_key_env} is not configured; image job was not claimed`), {code: 'IMAGE_PROVIDER_NOT_CONFIGURED'});
const models = await listImageModels({config, apiKey});
for (const role of Object.keys(config.roles)) selectImageSpec(config, models, role);

const store = queueStoreFromEnvironment({mode: 'd1'});
let job = requestedMovieId ? await store.findJob({movieId: requestedMovieId, stage: 'image'}) : null;
if (requestedMovieId && !job) job = await store.enqueueJob({movieId: requestedMovieId, stage: 'image'});
if (requestedMovieId && job?.status === 'retry') {
  job = await store.requeueRetry({jobId: job.id, allowedErrorCodes: ['IMAGE_GENERATION_FAILED']}) ?? job;
}
const workerId = `image-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
const claimed = await store.claim({stage: 'image', jobId: job?.id ?? null, workerId, leaseSeconds: pipeline.queue.lease_seconds});
if (!claimed) {
  console.log(JSON.stringify({event: 'image_queue_empty', stage: 'image'}));
  process.exit(0);
}
const movieId = claimed.movie_id;
const runtime = resolve(root, '.cc18-image', 'runtime', claimed.id);
await mkdir(runtime, {recursive: true});

const run = (script, args) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(process.execPath, [resolve(root, script), ...args], {cwd: root, stdio: 'inherit'});
  child.once('error', rejectRun);
  child.once('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`${script} exited with ${code}`)));
});

try {
  await assertLocalApproval(movieId);
  const movie = await store.getMovie(movieId);
  if (!movie) throw Object.assign(new Error(`${movieId}: D1 movie record missing`), {code: 'MOVIE_SOURCE_MISSING'});
  const source = JSON.parse(movie.source_json);
  const brief = JSON.parse(await readFile(resolve(root, `data/editorial-briefs/${movieId}.json`), 'utf8'));
  const prompts = buildArtworkPrompts({source, localCreativeBrief: brief.local_creative_brief});
  await mkdir(resolve(root, 'data', 'image-briefs'), {recursive: true});
  await writeFile(resolve(root, `data/image-briefs/${movieId}.json`), `${JSON.stringify({
    schema_version: 1,
    movie_id: movieId,
    created_at: new Date().toISOString(),
    provider: config.provider,
    model: config.model,
    artwork_policy: 'original_non_explicit_no_real_person_likeness',
    prompts,
  }, null, 2)}\n`);
  const files = {};
  const taskIds = [];
  for (const role of ['article_hero', 'vertical_scene']) {
    const spec = selectImageSpec(config, models, role);
    const taskId = await createImageTask({config, apiKey, prompt: prompts[role], spec});
    const result = await awaitImageTask({config, apiKey, taskId});
    const image = await downloadGeneratedImage({url: result.url, maximumBytes: config.download_max_bytes});
    const path = resolve(runtime, `${role}.${image.extension}`);
    await writeFile(path, image.bytes);
    files[role] = path;
    taskIds.push(taskId);
  }
  await run('scripts/image/finalize-assets.mjs', [movieId, `--hero=${files.article_hero}`, `--vertical=${files.vertical_scene}`, `--provider=${config.provider}`, `--model=${config.model}`, `--task-ids=${taskIds.join(',')}`, `--version=${claimed.attempt}`]);
  await store.finishJob({jobId: claimed.id, workerId, outcome: 'completed'});
  const videoJob = await store.enqueueJob({movieId, stage: 'video', priority: claimed.priority, discoveryRunId: claimed.discovery_run_id});
  console.log(JSON.stringify({movie_id: movieId, image_job_id: claimed.id, status: 'completed', video_job_id: videoJob.id}, null, 2));
} catch (error) {
  const outcome = claimed.attempt >= claimed.max_attempts ? 'failed' : 'retry';
  await store.finishJob({
    jobId: claimed.id, workerId, outcome, errorCode: error?.code ?? 'IMAGE_GENERATION_FAILED',
    retryAt: outcome === 'retry' ? new Date(Date.now() + 30 * 60_000).toISOString() : null,
  });
  throw error;
} finally {
  if (runtime.startsWith(resolve(root, '.cc18-image', 'runtime'))) await rm(runtime, {recursive: true, force: true});
}
