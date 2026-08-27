import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {performance} from 'node:perf_hooks';
import {FileQueueStore} from '../queue/store.mjs';
import {planPublishWaves} from '../publish/waves.mjs';

const MOVIE_COUNT = 250;
const WORKER_COUNT = 10;
const MAX_ITEMS_PER_WAVE = 50;
const START = new Date('2026-08-28T00:00:00.000Z');

function syntheticRecord(index) {
  const id = `LOAD-${String(index).padStart(3, '0')}`;
  return {
    id,
    release_date: '2026-08-28',
    source_url: `https://cc18.tv/player.php?uuid=synthetic-${index}&cat=19`,
    title: `合成負載作品 ${index}`,
    actress: [`合成演員 ${index % 20}`],
    series: `合成系列 ${index % 10}`,
    source_tags: ['合成測試'],
    description: `第 ${index} 部作品的完整合成 Metadata；不連線來源站。`,
  };
}

async function completeStage({store, stage, startOffsetSeconds, workerCounts, retryEvery}) {
  let completed = 0;
  let retries = 0;
  let sequence = 0;
  const retried = new Set();

  while (true) {
    const workerId = `load-worker-${(sequence % WORKER_COUNT) + 1}`;
    const now = new Date(START.getTime() + (startOffsetSeconds + sequence) * 1000);
    const job = await store.claim({stage, workerId, leaseSeconds: 60, now});
    if (!job) break;
    workerCounts[workerId] = (workerCounts[workerId] ?? 0) + 1;

    const numericId = Number(job.movie_id.split('-').at(-1));
    if (numericId % retryEvery === 0 && !retried.has(job.id)) {
      await store.finishJob({jobId: job.id, workerId, outcome: 'retry', errorCode: 'SYNTHETIC_TRANSIENT', now});
      await store.requeueRetry({jobId: job.id, allowedErrorCodes: ['SYNTHETIC_TRANSIENT'], now});
      retried.add(job.id);
      retries += 1;
    } else {
      await store.finishJob({jobId: job.id, workerId, outcome: 'completed', now});
      completed += 1;
    }
    sequence += 1;
  }
  return {completed, retries};
}

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'cc18-load-'));
  const resolvedDirectory = resolve(directory);
  assert.ok(resolvedDirectory.startsWith(`${resolve(tmpdir())}${sep}`));
  const store = new FileQueueStore(join(directory, 'pipeline-queue.json'));
  const started = performance.now();

  try {
    const runId = 'synthetic-load-250';
    await store.startRun({runId, startedAt: START.toISOString(), listingUrls: ['synthetic://cc18-load']});
    const ingestionStarted = performance.now();
    let enqueued = 0;
    let duplicateEnqueues = 0;

    for (let index = 1; index <= MOVIE_COUNT; index += 1) {
      const input = {record: syntheticRecord(index), classification: 'eligible', runId, priority: MOVIE_COUNT - index, stages: ['editorial', 'media_analysis']};
      const first = await store.upsertDiscovery(input);
      const duplicate = await store.upsertDiscovery(input);
      enqueued += first.enqueued_count;
      duplicateEnqueues += duplicate.enqueued_count;
    }
    const ingestionMs = Math.round(performance.now() - ingestionStarted);
    const afterIngestion = await store.summary();
    assert.equal(afterIngestion.movies, MOVIE_COUNT);
    assert.equal(afterIngestion.jobs, MOVIE_COUNT * 2);
    assert.equal(enqueued, MOVIE_COUNT * 2);
    assert.equal(duplicateEnqueues, 0);

    const abandoned = await store.claim({stage: 'editorial', workerId: 'abandoned-worker', leaseSeconds: 1, now: START});
    assert.ok(abandoned);
    const repaired = await store.repairExpiredLeases({now: new Date(START.getTime() + 2000)});
    assert.equal(repaired.length, 1);

    const workerCounts = {};
    const processingStarted = performance.now();
    const editorial = await completeStage({store, stage: 'editorial', startOffsetSeconds: 3, workerCounts, retryEvery: 37});
    const media = await completeStage({store, stage: 'media_analysis', startOffsetSeconds: 1000, workerCounts, retryEvery: 41});
    const processingMs = Math.round(performance.now() - processingStarted);
    const finalSummary = await store.summary();
    assert.equal(editorial.completed, MOVIE_COUNT);
    assert.equal(media.completed, MOVIE_COUNT);
    assert.equal(finalSummary.jobs_by_status.completed, MOVIE_COUNT * 2);
    assert.equal(Object.keys(workerCounts).length, WORKER_COUNT);

    const movieIds = Array.from({length: MOVIE_COUNT}, (_, index) => syntheticRecord(index + 1).id);
    const waves = planPublishWaves(movieIds, {maxItemsPerWave: MAX_ITEMS_PER_WAVE});
    assert.equal(waves.length, 5);
    assert.deepEqual(waves.map(({items}) => items.length), [50, 50, 50, 50, 50]);

    await store.finishRun({
      runId,
      finishedAt: new Date().toISOString(),
      status: 'success',
      summary: {movies: MOVIE_COUNT, jobs: MOVIE_COUNT * 2},
    });

    const totalMs = Math.round(performance.now() - started);
    const report = {
      event: 'synthetic_load_acceptance',
      network_used: false,
      external_ai_used: false,
      published: false,
      movies: MOVIE_COUNT,
      jobs: MOVIE_COUNT * 2,
      duplicate_jobs_created: duplicateEnqueues,
      recovered_expired_leases: repaired.length,
      synthetic_retries: editorial.retries + media.retries,
      workers: WORKER_COUNT,
      worker_distribution: workerCounts,
      publish_waves: waves.map(({wave, items}) => ({wave, items: items.length})),
      ingestion_ms: ingestionMs,
      processing_ms: processingMs,
      total_ms: totalMs,
      result: 'passed',
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await rm(resolvedDirectory, {recursive: true});
  }
}

await main();
