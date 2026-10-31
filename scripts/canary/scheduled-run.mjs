import {appendFile, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {discoverBatch} from '../discovery/discover.mjs';
import {queueStoreFromEnvironment} from '../queue/store.mjs';
import {drainIsolatedQueue, queueDrainExitCode} from './drain.mjs';
import {isAdmittedCanaryWork} from './selection.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const option = (name) => process.argv.slice(2).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);

export function summarizePendingWorkItems(items, drain = null) {
  const failed = new Set(drain?.failed ?? []);
  const byReason = {data_mismatch: [], execution_failed: [], time_budget: [], awaiting_next_run: []};
  for (const item of items) {
    const id = item.movie_id;
    if (!isAdmittedCanaryWork({movie: item, editorialJob: item})) byReason.data_mismatch.push(id);
    else if (failed.has(id) || ['blocked', 'failed'].includes(item.editorial_status)
      || ['blocked', 'failed'].includes(item.publish_status)) byReason.execution_failed.push(id);
    else if (drain?.stop_reason === 'time_budget_reached') byReason.time_budget.push(id);
    else byReason.awaiting_next_run.push(id);
  }
  return {count: items.length, ids: items.map(({movie_id}) => movie_id), by_reason: byReason};
}

export async function runScheduledCanary({store, config, discover = discoverBatch, drain = drainIsolatedQueue,
  maximumWorks = null, deadlineAt, logger = console} = {}) {
  if (maximumWorks !== null && (!Number.isInteger(maximumWorks) || maximumWorks < 1)) {
    throw new Error('Scheduled maximumWorks must be a positive integer or null');
  }
  if (!Number.isFinite(deadlineAt) || deadlineAt <= 0) throw new Error('Scheduled deadlineAt must be a positive epoch millisecond value');
  const summary = {event: 'cc18_scheduled_publication_finished', discovery: null, attempted: [], published: [], failed: [],
    drain_stop_reason: null, remaining: null, error: null, outcome: null};
  try {
    summary.discovery = await discover({listingUrls: config.discovery.listing_urls, store,
      config: {...config.discovery, user_agent: config.source.user_agent, initial_stages: config.queue.initial_stages}});
    const drained = await drain({maximumWorks, deadlineAt, logger: {log() {}}});
    summary.attempted = drained.processed;
    summary.published = drained.completed;
    summary.failed = drained.failed;
    summary.drain_stop_reason = drained.stop_reason;
    summary.work_errors = drained.work_errors;
    if (drained.stop_reason === 'editorial_provider_certificate_expired') {
      summary.error = 'Editorial provider certificate expired';
    } else if (queueDrainExitCode(drained)) summary.error = 'All attempted works failed';
  } catch (error) {
    summary.error = String(error?.message ?? error);
  }
  try {
    summary.remaining = summarizePendingWorkItems(await store.pendingPublicationWorkItems(), {
      failed: summary.failed,
      stop_reason: summary.drain_stop_reason,
    });
  } catch (error) {
    summary.error = summary.error ? `${summary.error}; pending query: ${error.message}` : `pending query: ${error.message}`;
  }
  summary.outcome = summary.error ? 'failed' : summary.failed.length ? 'partial' : 'success';
  logger.log(`CC18_SCHEDULE_RESULT=${JSON.stringify(summary)}`);
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(await readFile(resolve(root, 'config/pipeline.json'), 'utf8'));
  const maximumWorksOption = option('--max-works');
  const maximumWorks = maximumWorksOption === undefined ? null : Number(maximumWorksOption);
  const budgetMinutes = Number(option('--time-budget-minutes') ?? config.production.drain_time_budget_minutes);
  if (!Number.isFinite(budgetMinutes) || budgetMinutes <= 0) throw new Error('Scheduled time budget must be positive');
  const summary = await runScheduledCanary({
    store: queueStoreFromEnvironment({mode: 'd1'}), config, maximumWorks,
    deadlineAt: Date.now() + budgetMinutes * 60_000,
  });
  if (process.env.GITHUB_STEP_SUMMARY) {
    const discovery = summary.discovery ?? {};
    const remainingReasons = summary.remaining?.by_reason ?? {};
    const lines = [
      '## CC18 scheduled publication',
      `Discovery: ${discovery.candidates ?? 0} candidates, ${discovery.fetched ?? 0} fetched, ${discovery.new_movies ?? 0} new works, ${discovery.enqueued ?? 0} queued jobs, ${discovery.errors?.length ?? 0} errors`,
      `Attempted (${summary.attempted.length}): ${summary.attempted.join(', ') || 'none'}`,
      `Published (${summary.published.length}): ${summary.published.join(', ') || 'none'}`,
      `Failed (${summary.failed.length}): ${summary.failed.join(', ') || 'none'}`,
      ...(summary.work_errors?.length ? [`Failure details: ${summary.work_errors.map(({movie_id, stage, code}) => `${movie_id} (${stage ?? 'unknown stage'}, ${code ?? 'unknown code'})`).join(', ')}`] : []),
      `Remaining (${summary.remaining?.count ?? 'unknown'}): ${summary.remaining?.ids.join(', ') || 'none'}`,
      ...Object.entries(remainingReasons).map(([reason, ids]) => `Remaining ${reason} (${ids.length}): ${ids.join(', ') || 'none'}`),
      `Stop: ${summary.drain_stop_reason ?? 'before drain'}; outcome: ${summary.outcome}`,
      ...(summary.error ? [`Error: ${summary.error}`] : []),
    ];
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n\n')}\n`);
  }
  if (summary.outcome === 'failed') process.exitCode = 1;
}
