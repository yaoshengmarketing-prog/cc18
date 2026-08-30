import {createHash, randomUUID} from 'node:crypto';
import {hostname} from 'node:os';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {queueStoreFromEnvironment} from '../queue/store.mjs';
import {workCanonicalUrl} from '../../src/lib/work-url.mjs';
import {frontmatterValue, selectPublishChanges, verifyLiveRelease, verifyPublicMedia} from './lib/publisher.mjs';

const requestedMovieId = process.argv[2]?.trim().toUpperCase() ?? null;
if (requestedMovieId && !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(requestedMovieId)) throw new Error('Usage: npm run publish:d1:process-one -- [MOVIE-ID]');
const root = resolve(import.meta.dirname, '..', '..');
const pipeline = JSON.parse(await readFile(resolve(root, 'config/pipeline.json'), 'utf8'));
const baseUrl = pipeline.publishing.base_url;
const store = queueStoreFromEnvironment({mode: 'd1'});
let job = requestedMovieId ? await store.findJob({movieId: requestedMovieId, stage: 'publish'}) : null;
if (requestedMovieId && !job) job = await store.enqueueJob({movieId: requestedMovieId, stage: 'publish'});
if (requestedMovieId && job?.status === 'completed') {
  console.log(JSON.stringify({movie_id: requestedMovieId, publish_job_id: job.id, status: 'already_completed'}, null, 2));
  process.exit(0);
}
if (requestedMovieId && job?.status === 'retry') {
  job = await store.requeueRetry({
    jobId: job.id,
    allowedErrorCodes: ['PUBLISH_VALIDATION_FAILED', 'PUBLISH_DIRTY_WORKTREE', 'PUBLISH_GIT_FAILED', 'PUBLISH_MEDIA_UNAVAILABLE', 'PUBLISH_MEDIA_INVALID', 'PUBLISH_DEPLOY_TIMEOUT'],
  }) ?? job;
}
const workerId = `publisher-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
const claimed = await store.claim({stage: 'publish', jobId: job?.id ?? null, workerId, leaseSeconds: pipeline.queue.lease_seconds});
if (!claimed) {
  console.log(JSON.stringify({event: 'publish_queue_empty', stage: 'publish'}));
  process.exit(0);
}

const movieId = claimed.movie_id;
const slug = movieId.toLowerCase();
const run = (command, args) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(command, args, {cwd: root, stdio: 'inherit'});
  child.once('error', (error) => rejectRun(Object.assign(error, {code: 'PUBLISH_GIT_FAILED'})));
  child.once('exit', (code) => code === 0 ? resolveRun() : rejectRun(Object.assign(new Error(`${command} exited with ${code}`), {code: command === process.execPath ? 'PUBLISH_VALIDATION_FAILED' : 'PUBLISH_GIT_FAILED'})));
});
const capture = (args) => {
  const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
  if (result.status !== 0) throw Object.assign(new Error(result.stderr || `git ${args.join(' ')} failed`), {code: 'PUBLISH_GIT_FAILED'});
  return result.stdout.trim();
};
const changedPaths = () => ({
  trackedPaths: [...new Set([
    ...capture(['diff', '--name-only']).split(/\r?\n/),
    ...capture(['diff', '--cached', '--name-only']).split(/\r?\n/),
  ].filter(Boolean))],
  untrackedPaths: capture(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/).filter(Boolean),
});
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

try {
  const reviewPath = resolve(root, `content/reviews/${movieId}.md`);
  const qualityPath = resolve(root, `data/review-quality/${movieId}.json`);
  const [review, quality, registry] = await Promise.all([
    readFile(reviewPath, 'utf8'),
    readFile(qualityPath, 'utf8').then(JSON.parse),
    readFile(resolve(root, 'data/movie-registry.json'), 'utf8').then(JSON.parse),
  ]);
  const record = registry.records.find(({id}) => id === movieId);
  if (frontmatterValue(review, 'status') !== 'published' || record?.review_status !== 'published') {
    throw Object.assign(new Error(`${movieId}: review is not approved for publication`), {code: 'PUBLISH_VALIDATION_FAILED'});
  }
  if (!quality.approved_for_publish || quality.review_sha256 !== sha256(review)) {
    throw Object.assign(new Error(`${movieId}: quality approval or content hash is stale`), {code: 'PUBLISH_VALIDATION_FAILED'});
  }
  await run(process.execPath, [resolve(root, 'scripts/validate-registry.mjs')]);
  await run(process.execPath, [resolve(root, 'scripts/validate-content.mjs')]);
  await run(process.execPath, [resolve(root, 'scripts/build-movie-master.mjs'), '--write', `--include-work=${movieId}`]);
  await run(process.execPath, [resolve(root, 'scripts/astro-build.mjs')]);
  await run(process.execPath, [resolve(root, 'scripts/build-movie-master.mjs'), '--check', `--include-work=${movieId}`]);
  await run(process.execPath, [resolve(root, 'scripts/build-search-index.mjs'), '--check']);

  const heroPath = frontmatterValue(review, 'heroUrl');
  const videoPath = frontmatterValue(review, 'videoUrl');
  if (heroPath?.startsWith('/media/')) await verifyPublicMedia({baseUrl, path: heroPath, kind: 'image'});
  if (videoPath) await verifyPublicMedia({baseUrl, path: videoPath, kind: 'video'});

  let publicationChanges;
  try {
    publicationChanges = selectPublishChanges({...changedPaths(), movieId});
  } catch (error) {
    throw Object.assign(error, {code: 'PUBLISH_DIRTY_WORKTREE'});
  }
  const changes = publicationChanges.selected;
  const origin = capture(['remote', 'get-url', 'origin']);
  if (!/github\.com[/:]yaoshengmarketing-prog\/cc18(?:\.git)?$/i.test(origin)) {
    throw Object.assign(new Error(`Unexpected git origin: ${origin}`), {code: 'PUBLISH_GIT_FAILED'});
  }
  let commit = capture(['rev-parse', 'HEAD']);
  if (changes.length) {
    const existing = changes.filter((path) => existsSync(resolve(root, path)));
    await run('git', ['add', '--', ...existing]);
    await run('git', ['commit', '-m', `content: publish ${movieId}`]);
    await run('git', ['push', 'origin', 'HEAD:main']);
    commit = capture(['rev-parse', 'HEAD']);
  }

  const timeoutMs = pipeline.publishing.deployment_timeout_seconds * 1000;
  const pollMs = pipeline.publishing.deployment_poll_seconds * 1000;
  const deadline = Date.now() + timeoutMs;
  let lastReason = 'not_checked';
  while (Date.now() <= deadline) {
    const check = await verifyLiveRelease({
      pageUrl: workCanonicalUrl(baseUrl, slug),
      releaseId: quality.review_sha256,
      videoPath,
    });
    if (check.ready) {
      await store.finishJob({jobId: claimed.id, workerId, outcome: 'completed'});
      console.log(JSON.stringify({movie_id: movieId, publish_job_id: claimed.id, status: 'completed', commit, release_id: quality.review_sha256, live_url: workCanonicalUrl(baseUrl, slug)}, null, 2));
      process.exit(0);
    }
    lastReason = check.reason;
    await delay(pollMs);
  }
  throw Object.assign(new Error(`${movieId}: Cloudflare deployment timeout (${lastReason})`), {code: 'PUBLISH_DEPLOY_TIMEOUT'});
} catch (error) {
  const outcome = claimed.attempt >= claimed.max_attempts ? 'failed' : 'retry';
  await store.finishJob({
    jobId: claimed.id,
    workerId,
    outcome,
    errorCode: error?.code ?? 'PUBLISH_VALIDATION_FAILED',
    retryAt: outcome === 'retry' ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
  });
  throw error;
}
