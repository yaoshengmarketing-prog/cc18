import test from 'node:test';
import assert from 'node:assert/strict';
import {drainIsolatedQueue, parseCanaryResult, queueDrainExitCode} from '../scripts/canary/drain.mjs';
import {runScheduledCanary, summarizePendingWorkItems} from '../scripts/canary/scheduled-run.mjs';

const quietLogger = {log() {}};

test('scheduled drain processes every queued work serially and continues after one failure', async () => {
  const calls = [];
  const results = [
    {exitCode: 1, report: {
      event: 'isolated_canary_finished',
      movie_id: 'FAILED-001',
      work_error: {phase: 'checkpoint_restore', message: 'checkpoint fixture failed'},
    }},
    {exitCode: 0, report: {event: 'isolated_canary_finished', movie_id: 'NEXT-001'}},
    {exitCode: 0, report: {event: 'isolated_canary_queue_empty'}},
  ];
  const summary = await drainIsolatedQueue({
    logger: quietLogger,
    runOne: async ({excludeMovieIds}) => {
      calls.push(excludeMovieIds);
      return results.shift();
    },
  });
  assert.deepEqual(calls, [[], ['FAILED-001'], ['FAILED-001', 'NEXT-001']]);
  assert.deepEqual(summary.processed, ['FAILED-001', 'NEXT-001']);
  assert.deepEqual(summary.completed, ['NEXT-001']);
  assert.deepEqual(summary.failed, ['FAILED-001']);
  assert.deepEqual(summary.work_errors, [{
    movie_id: 'FAILED-001',
    phase: 'checkpoint_restore',
    message: 'checkpoint fixture failed',
  }]);
  assert.equal(summary.stop_reason, 'queue_empty');
  assert.equal(summary.outcome, 'partial');
  assert.equal(queueDrainExitCode(summary), 0);
});

test('empty queue is a successful no-op', async () => {
  const summary = await drainIsolatedQueue({
    logger: quietLogger,
    runOne: async () => ({exitCode: 0, report: {event: 'isolated_canary_queue_empty'}}),
  });
  assert.deepEqual(summary, {
    event: 'scheduled_queue_drain_finished',
    processed: [],
    completed: [],
    failed: [],
    work_errors: [],
    stop_reason: 'queue_empty',
    outcome: 'success',
  });
});

test('a drain where every attempted work fails reports failure while still trying the next work', async () => {
  const results = [
    {exitCode: 1, report: {event: 'isolated_canary_finished', movie_id: 'A-001'}},
    {exitCode: 1, report: {event: 'isolated_canary_finished', movie_id: 'B-001'}},
    {exitCode: 0, report: {event: 'isolated_canary_queue_empty'}},
  ];
  const summary = await drainIsolatedQueue({
    logger: quietLogger,
    runOne: async () => results.shift(),
  });
  assert.deepEqual(summary.processed, ['A-001', 'B-001']);
  assert.deepEqual(summary.failed, ['A-001', 'B-001']);
  assert.deepEqual(summary.completed, []);
  assert.equal(summary.stop_reason, 'queue_empty');
  assert.equal(summary.outcome, 'failed');
  assert.equal(queueDrainExitCode(summary), 1);
});

test('first scheduled attempt stops after one failure and leaves the next work for a later run', async () => {
  const calls = [];
  const first = await drainIsolatedQueue({logger: quietLogger, maximumWorks: 1,
    runOne: async () => { calls.push('A-001'); return {exitCode: 1, report: {event: 'isolated_canary_finished', movie_id: 'A-001'}}; },
  });
  assert.deepEqual(calls, ['A-001']);
  assert.deepEqual(first.failed, ['A-001']);
  assert.equal(first.stop_reason, 'attempt_limit_reached');
  assert.equal(first.outcome, 'failed');
  assert.equal(queueDrainExitCode(first), 1);
});

test('scheduled result drains without a work count limit and reports remaining work by reason', async () => {
  const logs = [];
  const store = {pendingPublicationWorkItems: async () => [
    {movie_id: 'WAIT-001', classification: 'eligible', metadata_status: 'validated', discovery_run_id: 'run', editorial_status: 'queued', publish_status: null},
    {movie_id: 'BAD-001', classification: 'late_arrival', metadata_status: 'partial', discovery_run_id: 'run', editorial_status: 'queued', publish_status: null},
    {movie_id: 'FAILED-001', classification: 'eligible', metadata_status: 'validated', discovery_run_id: 'run', editorial_status: 'failed', publish_status: null},
  ]};
  const summary = await runScheduledCanary({store, config: {discovery: {listing_urls: ['https://cc18.tv/'], initial_stages: ['editorial']}, source: {user_agent: 'test'}, queue: {initial_stages: ['editorial']}},
    deadlineAt: 1000, logger: {log: (value) => logs.push(value)},
    discover: async () => ({new_movies: 2, enqueued: 2}),
    drain: async ({maximumWorks}) => {
      assert.equal(maximumWorks, null);
      return {processed: ['PUBLISHED-001'], completed: ['PUBLISHED-001'], failed: [], work_errors: [], stop_reason: 'time_budget_reached', outcome: 'success'};
    },
  });
  assert.deepEqual(summary.attempted, ['PUBLISHED-001']);
  assert.deepEqual(summary.published, ['PUBLISHED-001']);
  assert.equal(summary.remaining.count, 3);
  assert.deepEqual(summary.remaining.by_reason.data_mismatch, ['BAD-001']);
  assert.deepEqual(summary.remaining.by_reason.execution_failed, ['FAILED-001']);
  assert.deepEqual(summary.remaining.by_reason.time_budget, ['WAIT-001']);
  assert.equal(summary.outcome, 'success');
  assert.match(logs[0], /^CC18_SCHEDULE_RESULT=/u);
  assert.deepEqual(summarizePendingWorkItems([{movie_id: 'WAIT-001', classification: 'eligible', metadata_status: 'validated'}],
    {stop_reason: 'time_budget_reached'}).by_reason.time_budget, ['WAIT-001']);
});

test('discovery failure stops before publication and is not reported as success', async () => {
  let drained = false;
  const summary = await runScheduledCanary({store: {pendingPublicationWorkItems: async () => []},
    config: {discovery: {listing_urls: []}, source: {}, queue: {}}, deadlineAt: 1000, logger: quietLogger,
    discover: async () => { throw new Error('listing unavailable'); },
    drain: async () => { drained = true; },
  });
  assert.equal(drained, false);
  assert.equal(summary.outcome, 'failed');
  assert.match(summary.error, /listing unavailable/u);
});

test('a time-budget stop leaves remaining works for the next clean drain invocation', async () => {
  const queued = ['FIRST-001', 'SECOND-001'];
  const completed = new Set();
  const runOne = async ({excludeMovieIds}) => {
    const selected = queued.find((id) => !completed.has(id) && !excludeMovieIds.includes(id));
    if (!selected) return {exitCode: 0, report: {event: 'isolated_canary_queue_empty'}};
    completed.add(selected);
    return {exitCode: 0, report: {event: 'isolated_canary_finished', movie_id: selected}};
  };
  const times = [0, 100];
  const first = await drainIsolatedQueue({
    logger: quietLogger,
    runOne,
    deadlineAt: 100,
    now: () => times.shift(),
  });
  assert.deepEqual(first.processed, ['FIRST-001']);
  assert.equal(first.stop_reason, 'time_budget_reached');
  assert.deepEqual([...completed], ['FIRST-001']);

  const second = await drainIsolatedQueue({logger: quietLogger, runOne});
  assert.deepEqual(second.processed, ['SECOND-001']);
  assert.equal(second.stop_reason, 'queue_empty');
  assert.deepEqual([...completed], ['FIRST-001', 'SECOND-001']);
});

test('machine-readable result parsing fails closed', () => {
  assert.deepEqual(parseCanaryResult('log\nCC18_CANARY_RESULT={"event":"isolated_canary_queue_empty"}\n'), {
    event: 'isolated_canary_queue_empty',
  });
  assert.throws(() => parseCanaryResult('ordinary log only'), /machine-readable result/u);
  assert.throws(() => parseCanaryResult('CC18_CANARY_RESULT={broken'), /invalid machine-readable/u);
});

test('repeated selection cannot create an endless drain loop', async () => {
  let count = 0;
  await assert.rejects(() => drainIsolatedQueue({
    logger: quietLogger,
    runOne: async () => ({exitCode: count++ ? 1 : 0, report: {event: 'isolated_canary_finished', movie_id: 'SAME-001'}}),
  }), /same movie twice/u);
});
