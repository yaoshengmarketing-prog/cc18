import {loadBridgeConfig} from './lib/config.mjs';
import {launchBridgeBrowser, captureAuthorizedManifest} from './lib/browser.mjs';
import {resolveMediaPlaylist, createLocalEvidence, cleanupExpiredRuntime, assertRuntimeBudget} from './lib/media.mjs';
import {loadQueue, updateJob} from './lib/queue.mjs';
import {bridgeLog} from './lib/redact.mjs';

const config = await loadBridgeConfig();
await cleanupExpiredRuntime(config);
await assertRuntimeBudget(config);
const queue = await loadQueue(config.queue_file);
const job = queue.jobs.find((item) => ['pending', 'retry'].includes(item.status));
if (!job) {
  bridgeLog('queue_empty');
  process.exit(0);
}

await updateJob(config.queue_file, job.job_id, {status: 'capturing', attempts: job.attempts + 1, last_error: null});
let context;
try {
  context = await launchBridgeBrowser(config);
  const captured = await captureAuthorizedManifest(context, config, job.source_url);
  const playlist = await resolveMediaPlaylist(captured.manifestUrl, captured.manifestText, job.source_url, config);
  const result = await createLocalEvidence({
    movieId: job.movie_id,
    jobId: job.job_id,
    sourceUrl: job.source_url,
    playlist,
    player: captured.player,
    config,
  });
  await updateJob(config.queue_file, job.job_id, {status: 'samples_ready', evidence_path: result.evidencePath});
  bridgeLog('job_completed', {movie_id: job.movie_id, job_id: job.job_id, evidence_path: result.evidencePath});
} catch (error) {
  const status = error?.code === 'AUTH_REQUIRED'
    ? 'auth_required'
    : error?.code === 'AGE_CONFIRMATION_REQUIRED'
      ? 'age_confirmation_required'
      : 'retry';
  await updateJob(config.queue_file, job.job_id, {status, last_error: String(error?.message ?? error)});
  bridgeLog('job_failed', {movie_id: job.movie_id, job_id: job.job_id, status, error: String(error?.message ?? error)});
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
}
