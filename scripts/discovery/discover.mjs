import {randomUUID} from 'node:crypto';
import {parseListing, parseWorkPage, inspectWorkPage} from '../source/cc18-parser.mjs';

const DAY_MS = 86_400_000;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const releaseAgeDays = (date, now) => Math.floor((now.getTime() - Date.parse(`${date}T00:00:00+08:00`)) / DAY_MS);

export function classifyRecord(record, now, config) {
  const ageDays = releaseAgeDays(record.release_date, now);
  if (!Number.isFinite(ageDays) || ageDays < -config.upcoming_window_days) return {classification: 'invalid_date', ageDays};
  if (ageDays < 0) return {classification: 'upcoming', ageDays};
  if (ageDays <= config.lookback_days) return {classification: 'eligible', ageDays};
  if (ageDays <= config.scan_window_days) return {classification: 'late_arrival', ageDays};
  return {classification: 'prelaunch_history', ageDays};
}

export async function discoverBatch({
  listingUrls,
  store,
  config,
  fetchImpl = fetch,
  now = new Date(),
  wait = sleep,
  logger = console,
}) {
  const runId = randomUUID();
  const startedAt = now.toISOString();
  const summary = {run_id: runId, listing_urls: listingUrls, candidates: 0, fetched: 0, eligible: 0, upcoming: 0, late_arrival: 0, prelaunch_history: 0, invalid_date: 0, skipped_history: 0, new_movies: 0, enqueued: 0, duplicates: 0, errors: []};
  await store.startRun({runId, startedAt, listingUrls});
  try {
    const candidateSet = new Set();
    for (const listingUrl of listingUrls) {
      const response = await fetchImpl(listingUrl, {headers: {'user-agent': config.user_agent}});
      if (!response.ok) throw new Error(`Listing returned HTTP ${response.status}: ${listingUrl}`);
      for (const workUrl of parseListing(await response.text(), listingUrl)) candidateSet.add(workUrl);
    }
    if (candidateSet.size < config.minimum_candidates) throw new Error(`Discovery returned too few candidates: ${candidateSet.size} < ${config.minimum_candidates}`);
    if (candidateSet.size > config.hard_discovery_cap) throw new Error(`Discovery cap exceeded: ${candidateSet.size} > ${config.hard_discovery_cap}`);
    summary.candidates = candidateSet.size;

    let index = 0;
    for (const workUrl of candidateSet) {
      try {
        if (index > 0 && config.request_delay_ms > 0) await wait(config.request_delay_ms);
        const response = await fetchImpl(workUrl, {headers: {'user-agent': config.user_agent}});
        if (!response.ok) throw new Error(`Work page returned HTTP ${response.status}`);
        const html = await response.text();
        summary.fetched += 1;
        const inspection = inspectWorkPage(html);
        if (/^20\d{2}-\d{2}-\d{2}$/.test(inspection.release_date ?? '')) {
          const preliminary = classifyRecord({release_date: inspection.release_date}, now, config);
          if (preliminary.classification === 'prelaunch_history') {
            summary.prelaunch_history += 1;
            summary.skipped_history += 1;
            index += 1;
            continue;
          }
        }
        const record = parseWorkPage(html, workUrl);
        const {classification, ageDays} = classifyRecord(record, now, config);
        summary[classification] += 1;
        const priority = Math.max(1, 10_000 - Math.max(0, ageDays) * 100);
        const result = await store.upsertDiscovery({record, classification, runId, priority});
        summary.new_movies += result.isNew ? 1 : 0;
        summary.duplicates += result.isNew ? 0 : 1;
        summary.enqueued += result.enqueued ? 1 : 0;
      } catch (error) {
        summary.errors.push({url: workUrl, code: error?.name ?? 'Error', message: String(error?.message ?? error).slice(0, 300)});
        logger.warn?.(`Discovery item failed: ${workUrl}`);
      }
      index += 1;
    }
    const errorRatio = summary.candidates ? summary.errors.length / summary.candidates : 0;
    const status = errorRatio > config.maximum_error_ratio ? 'failed' : summary.errors.length ? 'partial' : 'success';
    if (status === 'failed') throw new Error(`Discovery error ratio ${errorRatio.toFixed(3)} exceeded ${config.maximum_error_ratio}`);
    await store.finishRun({runId, finishedAt: new Date().toISOString(), status, summary});
    return {...summary, status};
  } catch (error) {
    summary.errors.push({url: null, code: error?.name ?? 'Error', message: String(error?.message ?? error).slice(0, 300)});
    await store.finishRun({runId, finishedAt: new Date().toISOString(), status: 'failed', summary});
    throw error;
  }
}
