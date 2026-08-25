import {loadBridgeConfig} from './lib/config.mjs';
import {analyzeEvidenceLocally} from './lib/local-analysis.mjs';
import {loadQueue, updateJob} from './lib/queue.mjs';
import {bridgeLog} from './lib/redact.mjs';
import {purgeRawArtifacts} from './lib/media.mjs';

const config = await loadBridgeConfig();
const queue = await loadQueue(config.queue_file);
const job = queue.jobs.find((item) => item.status === 'samples_ready');
if (!job) {
  bridgeLog('analysis_queue_empty');
  process.exit(0);
}

await updateJob(config.queue_file, job.job_id, {status: 'analyzing', last_error: null});
try {
  const result = await analyzeEvidenceLocally(job.evidence_path, config);
  await updateJob(config.queue_file, job.job_id, {status: 'analysis_ready', analysis_path: result.outputPath});
  if (config.sampling.cleanup_raw_after_analysis) {
    await purgeRawArtifacts(job.evidence_path);
    bridgeLog('raw_artifacts_purged', {movie_id: job.movie_id, job_id: job.job_id});
  }
} catch (error) {
  await updateJob(config.queue_file, job.job_id, {status: 'samples_ready', last_error: String(error?.message ?? error)});
  bridgeLog('analysis_failed', {movie_id: job.movie_id, job_id: job.job_id, error: String(error?.message ?? error)});
  process.exitCode = 1;
}
