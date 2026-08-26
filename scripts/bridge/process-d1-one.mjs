import {hostname} from 'node:os';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadBridgeConfig} from './lib/config.mjs';
import {launchBridgeBrowser, captureAuthorizedManifest} from './lib/browser.mjs';
import {resolveMediaPlaylist, createLocalEvidence, cleanupExpiredRuntime, assertRuntimeBudget, purgeRawArtifacts} from './lib/media.mjs';
import {analyzeEvidenceLocally, assertLocalAnalyzerReady} from './lib/local-analysis.mjs';
import {bridgeLog} from './lib/redact.mjs';
import {queueStoreFromEnvironment} from '../queue/store.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const pipeline = JSON.parse(await readFile(resolve(root, 'config/pipeline.json'), 'utf8'));
const config = await loadBridgeConfig(resolve(root, 'config/media-bridge.json'));
const workerId = `bridge-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
const store = queueStoreFromEnvironment({mode: 'd1'});

function errorCode(error) {
  return String(error?.code || error?.name || 'BRIDGE_ERROR').toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80);
}

function outcomeFor(job, error) {
  if (['AUTH_REQUIRED', 'AGE_CONFIRMATION_REQUIRED'].includes(error?.code)) return 'blocked';
  return Number(job.attempt) >= Number(job.max_attempts) ? 'failed' : 'retry';
}

function startLeaseKeeper({jobId}) {
  const intervalMs = Math.max(30_000, Math.floor(pipeline.queue.lease_seconds * 1000 / 3));
  let pending = null;
  let failure = null;
  const renew = () => {
    if (pending) return;
    pending = store.renewLease({jobId, workerId, leaseSeconds: pipeline.queue.lease_seconds})
      .catch((error) => { failure = error; })
      .finally(() => { pending = null; });
  };
  const timer = setInterval(renew, intervalMs);
  timer.unref();
  return {
    assertHealthy() {
      if (failure) throw new Error(`D1 lease renewal failed: ${failure.message}`);
    },
    async stop() {
      clearInterval(timer);
      await pending;
      this.assertHealthy();
    },
  };
}

await cleanupExpiredRuntime(config);
await assertRuntimeBudget(config);
await assertLocalAnalyzerReady(config);

const job = await store.claim({stage: 'media_analysis', workerId, leaseSeconds: pipeline.queue.lease_seconds});
if (!job) {
  bridgeLog('d1_queue_empty', {stage: 'media_analysis'});
  process.exit(0);
}

const movie = await store.getMovie(job.movie_id);
if (!movie?.source_url) {
  await store.finishJob({jobId: job.id, workerId, outcome: 'failed', errorCode: 'MOVIE_SOURCE_MISSING'});
  throw new Error(`D1 movie source is missing for ${job.movie_id}`);
}

const lease = startLeaseKeeper({jobId: job.id});
let context;
try {
  bridgeLog('d1_job_claimed', {movie_id: job.movie_id, job_id: job.id, attempt: job.attempt});
  context = await launchBridgeBrowser(config);
  const captured = await captureAuthorizedManifest(context, config, movie.source_url);
  const playlist = await resolveMediaPlaylist(captured.manifestUrl, captured.manifestText, movie.source_url, config);
  const evidence = await createLocalEvidence({
    movieId: job.movie_id,
    jobId: job.id,
    sourceUrl: movie.source_url,
    playlist,
    player: captured.player,
    config,
  });
  lease.assertHealthy();
  const analysis = await analyzeEvidenceLocally(evidence.evidencePath, config);
  if (config.sampling.cleanup_raw_after_analysis) await purgeRawArtifacts(evidence.evidencePath);
  await context?.close().catch(() => {});
  context = null;
  await lease.stop();
  await store.finishJob({jobId: job.id, workerId, outcome: 'completed'});
  bridgeLog('d1_job_completed', {
    movie_id: job.movie_id,
    job_id: job.id,
    analysis_path: analysis.outputPath,
    observations: analysis.analysis.coverage.sample_windows,
  });
} catch (error) {
  await context?.close().catch(() => {});
  context = null;
  let leaseError = null;
  try {
    await lease.stop();
  } catch (caught) {
    leaseError = caught;
  }
  const outcome = outcomeFor(job, error);
  const code = leaseError ? 'LEASE_LOST' : errorCode(error);
  try {
    await store.finishJob({
      jobId: job.id,
      workerId,
      outcome,
      errorCode: code,
      retryAt: outcome === 'retry' ? new Date(Date.now() + 30 * 60_000).toISOString() : null,
    });
  } catch (finishError) {
    bridgeLog('d1_job_finish_failed', {movie_id: job.movie_id, job_id: job.id, error: finishError.message});
  }
  bridgeLog('d1_job_failed', {movie_id: job.movie_id, job_id: job.id, status: outcome, error_code: code, error: error.message});
  process.exitCode = 1;
}
