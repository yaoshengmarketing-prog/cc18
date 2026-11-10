import {hostname, tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {queueStoreFromEnvironment} from '../queue/store.mjs';
import {loadLocalEditorialEnvironment} from '../editorial/lib/openai-writer.mjs';
import {awaitImageTask, createImageTask, downloadGeneratedImage, imageApiKey, imageFailureDiagnostic, listImageModels, selectImageSpec} from './lib/aitokenking-image.mjs';
import {buildArtworkPrompts} from './lib/artwork-prompt.mjs';
import {assertApprovedReviewForMedia} from './lib/approval-gate.mjs';
import {listR2Objects} from '../r2/object-store.mjs';
import {continuePublicationAfterImageFailure, publicationCoverAfterImageFailure} from './lib/fail-soft.mjs';

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
const store = queueStoreFromEnvironment({mode: 'd1'});
let job = requestedMovieId ? await store.findJob({movieId: requestedMovieId, stage: 'image'}) : null;
if (requestedMovieId && !job) job = await store.enqueueJob({movieId: requestedMovieId, stage: 'image'});
if (requestedMovieId && job?.status === 'retry') {
  job = await store.requeueRetry({jobId: job.id, allowedErrorCodes: ['IMAGE_GENERATION_FAILED']}) ?? job;
}
if (requestedMovieId && job?.status === 'failed') {
  job = await store.requeueFailedMedia({jobId: job.id, stage: 'image'}) ?? job;
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

const run = (script, args, errorCode = 'IMAGE_GENERATION_FAILED') => new Promise((resolveRun, rejectRun) => {
  const child = spawn(process.execPath, [resolve(root, script), ...args], {cwd: root, stdio: 'inherit'});
  child.once('error', rejectRun);
  child.once('exit', (code) => code === 0
    ? resolveRun()
    : rejectRun(Object.assign(new Error(`${script} exited with ${code}`), {code: errorCode})));
});

let publicationCover = null;
let currentTaskId = null;
let currentRole = null;
const recordImageFailure = async (error) => {
  const diagnostic = {
    event: 'image_provider_failure', movie_id: movieId, image_job_id: claimed.id,
    attempt: claimed.attempt, image_error_code: error?.code ?? 'IMAGE_GENERATION_FAILED',
    ...imageFailureDiagnostic(error, {taskId: currentTaskId, role: currentRole}),
  };
  console.error(JSON.stringify(diagnostic));
  try {
    const directory = resolve(process.env.RUNNER_TEMP ?? tmpdir(), 'cc18-image-failures');
    await mkdir(directory, {recursive: true});
    await writeFile(resolve(directory, `${movieId}-${claimed.attempt}.json`), `${JSON.stringify(diagnostic, null, 2)}\n`);
  } catch (recordError) {
    console.error(JSON.stringify({event: 'image_failure_record_unavailable', movie_id: movieId, code: recordError?.code ?? 'UNKNOWN'}));
  }
  return diagnostic;
};
try {
  await assertLocalApproval(movieId);
  const movie = await store.getMovie(movieId);
  if (!movie) throw Object.assign(new Error(`${movieId}: D1 movie record missing`), {code: 'MOVIE_SOURCE_MISSING'});
  const source = JSON.parse(movie.source_json);
  if (source.id !== movieId) throw Object.assign(new Error(`${movieId}: D1 source identity mismatch`), {code: 'MOVIE_SOURCE_MISMATCH'});
  const review = await readFile(resolve(root, 'content', 'reviews', `${movieId}.md`), 'utf8');
  publicationCover = publicationCoverAfterImageFailure({reviewMarkdown: review, source});
  try {
    await listR2Objects({bucket: config.r2_bucket, prefix: '.cc18-upload-preflight/'});
  } catch (error) {
    throw Object.assign(new Error(`Image upload preflight failed: ${error.message}`), {code: 'IMAGE_UPLOAD_UNAVAILABLE'});
  }
  const apiKey = imageApiKey(config);
  if (!apiKey) throw Object.assign(new Error(`${config.api_key_env} is not configured`), {code: 'IMAGE_PROVIDER_NOT_CONFIGURED'});
  let models;
  try {
    models = await listImageModels({config, apiKey});
    for (const role of Object.keys(config.roles)) selectImageSpec(config, models, role);
  } catch (error) {
    if (error?.code) throw error;
    throw Object.assign(new Error(`Image provider discovery failed: ${error.message}`), {
      code: 'IMAGE_PROVIDER_UNAVAILABLE', status: error?.status,
      providerCode: error?.providerCode, providerSummary: error?.providerSummary,
      taskId: error?.taskId,
    });
  }
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
    currentRole = role;
    currentTaskId = null;
    const spec = selectImageSpec(config, models, role);
    const taskId = await createImageTask({config, apiKey, prompt: prompts[role], spec});
    currentTaskId = taskId;
    console.log(JSON.stringify({event: 'image_provider_task_started', movie_id: movieId, role, provider_task_id: taskId}));
    const result = await awaitImageTask({config, apiKey, taskId});
    const image = await downloadGeneratedImage({url: result.url, maximumBytes: config.download_max_bytes});
    const path = resolve(runtime, `${role}.${image.extension}`);
    await writeFile(path, image.bytes);
    files[role] = path;
    taskIds.push(taskId);
  }
  await run('scripts/image/finalize-assets.mjs', [movieId, `--hero=${files.article_hero}`, `--vertical=${files.vertical_scene}`, `--provider=${config.provider}`, `--model=${config.model}`, `--task-ids=${taskIds.join(',')}`, `--version=${claimed.attempt}`], 'IMAGE_UPLOAD_FAILED');
  await store.finishJob({jobId: claimed.id, workerId, outcome: 'completed'});
  const [videoJob, existingPublishJob] = await Promise.all([
    store.enqueueJob({movieId, stage: 'video', priority: claimed.priority, discoveryRunId: claimed.discovery_run_id}),
    store.enqueueJob({movieId, stage: 'publish', priority: claimed.priority, discoveryRunId: claimed.discovery_run_id}),
  ]);
  const publishJob = existingPublishJob.status === 'completed'
    ? await store.requeueCompletedForUpdate({jobId: existingPublishJob.id}) ?? existingPublishJob
    : existingPublishJob;
  console.log(JSON.stringify({
    movie_id: movieId,
    image_job_id: claimed.id,
    status: 'completed',
    video_job_id: videoJob.id,
    publish_job_id: publishJob.id,
    publication_ready_without_video: true,
  }, null, 2));
} catch (error) {
  const diagnostic = await recordImageFailure(error);
  if (publicationCover) {
    const fallback = await continuePublicationAfterImageFailure({
      store,
      claimed,
      workerId,
      error,
      retryAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    console.warn(JSON.stringify({
      event: 'image_failure_non_blocking',
      movie_id: movieId,
      image_job_id: claimed.id,
      image_status: fallback.outcome,
      image_error_code: diagnostic.image_error_code,
      provider_http_status: diagnostic.provider_http_status,
      provider_task_id: diagnostic.provider_task_id,
      provider_error_code: diagnostic.provider_error_code,
      provider_response_summary: diagnostic.provider_response_summary,
      image_role: diagnostic.image_role,
      publication_cover: publicationCover,
      publish_job_id: fallback.publishJob.id,
      publish_status: fallback.publishJob.status,
    }, null, 2));
    process.exitCode = 0;
  } else {
    const outcome = claimed.attempt >= claimed.max_attempts ? 'failed' : 'retry';
    await store.finishJob({
      jobId: claimed.id, workerId, outcome, errorCode: error?.code ?? 'IMAGE_GENERATION_FAILED',
      retryAt: outcome === 'retry' ? new Date(Date.now() + 30 * 60_000).toISOString() : null,
    });
    throw error;
  }
} finally {
  if (runtime.startsWith(resolve(root, '.cc18-image', 'runtime'))) await rm(runtime, {recursive: true, force: true});
}
