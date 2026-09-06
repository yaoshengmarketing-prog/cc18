import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join, resolve, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {discoverBatch, classifyRecord} from '../scripts/discovery/discover.mjs';
import {D1RestQueueStore, FileQueueStore} from '../scripts/queue/store.mjs';

const workHtml = ({id, date, title = '測試情境', actress = '測試演員', description = `${title}的公開測試簡介。`}) => `<!doctype html><html><body>
  <h1>${title} ${id}</h1>
  <p class="movie_player_up_pic"><img src="/preview/${id}.jpg"></p>
  <div class="date">${date}</div>
  <div class="content"><a href="/search.php?s_type=fac&s_tid=1">測試片商</a>${description === null ? '' : `<div class="intro"><p>簡介：${description}</p></div>`}</div>
  <div class="tag-info"><a href="/search.php?s_type=actor&s_tid=2">${actress}</a><a href="/search.php?s_type=tag&s_tid=3">劇情</a></div>
</body></html>`;

const config = {
  lookback_days: 7,
  scan_window_days: 14,
  upcoming_window_days: 30,
  minimum_candidates: 1,
  request_delay_ms: 0,
  maximum_error_ratio: 0.2,
  user_agent: 'CC18DiscoveryTest/1.0',
};

test('classifies from the actual work-page release date', () => {
  const now = new Date('2026-08-26T04:00:00Z');
  assert.equal(classifyRecord({release_date: '2026-08-25'}, now, config).classification, 'eligible');
  assert.equal(classifyRecord({release_date: '2026-08-15'}, now, config).classification, 'late_arrival');
  assert.equal(classifyRecord({release_date: '2026-07-01'}, now, config).classification, 'prelaunch_history');
  assert.equal(classifyRecord({release_date: '2026-09-03'}, now, config).classification, 'upcoming');
  assert.equal(classifyRecord({release_date: '2026-10-10'}, now, config).classification, 'invalid_date');
});

test('formats D1 REST single and transactional batch query bodies', async () => {
  const bodies = [];
  const fetchImpl = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return {
      ok: true,
      status: 200,
      json: async () => ({success: true, errors: [], result: [{success: true, results: [], meta: {changes: 0}}]}),
    };
  };
  const store = new D1RestQueueStore({accountId: 'account', databaseId: 'database', apiToken: 'token', fetchImpl});
  const first = {sql: 'SELECT 1', params: []};
  const second = {sql: 'SELECT 2', params: []};

  await store.query(first);
  await store.query([first, second]);

  assert.deepEqual(bodies[0], first);
  assert.deepEqual(bodies[1], {batch: [first, second]});
});

test('renews an owned D1 lease with one guarded update', async () => {
  let statement;
  const fetchImpl = async (_url, options) => {
    statement = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({success: true, errors: [], result: [{success: true, results: [{id: 'job-1', status: 'leased'}], meta: {changes: 1}}]}),
    };
  };
  const store = new D1RestQueueStore({accountId: 'account', databaseId: 'database', apiToken: 'token', fetchImpl});
  const renewed = await store.renewLease({jobId: 'job-1', workerId: 'bridge-a', leaseSeconds: 60, now: new Date('2026-08-26T05:00:00Z')});
  assert.equal(renewed.id, 'job-1');
  assert.match(statement.sql, /status='leased' AND claimed_by=\?/);
  assert.deepEqual(statement.params, ['2026-08-26T05:01:00.000Z', '2026-08-26T05:00:00.000Z', 'job-1', 'bridge-a']);
});

test('discovers every listing item, deduplicates persistently, and leases atomically', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cc18-discovery-'));
  const queuePath = join(directory, 'queue.json');
  const listingUrl = 'https://cc18.tv/';
  const newUrl = 'https://cc18.tv/player.php?uuid=new-one&cat=19';
  const oldUrl = 'https://cc18.tv/player.php?uuid=old-one&cat=19';
  const responses = new Map([
    [listingUrl, `<a href="${newUrl}">new</a><a href="${newUrl}">duplicate</a><a href="${oldUrl}">old</a>`],
    [newUrl, workHtml({id: 'NEW-001', date: '2026-08-25', title: '旅館同房'})],
    [oldUrl, workHtml({id: 'OLD-001', date: '2026-07-01', title: '舊片測試'})],
  ]);
  const fetchImpl = async (url) => ({ok: responses.has(String(url)), status: responses.has(String(url)) ? 200 : 404, text: async () => responses.get(String(url)) ?? ''});
  const store = new FileQueueStore(queuePath);
  const options = {listingUrls: [listingUrl], store, config, fetchImpl, now: new Date('2026-08-26T04:00:00Z'), logger: {warn() {}}};

  const first = await discoverBatch(options);
  assert.equal(first.candidates, 2);
  assert.equal(first.new_movies, 1);
  assert.equal(first.eligible, 1);
  assert.equal(first.prelaunch_history, 1);
  assert.equal(first.skipped_history, 1);
  assert.equal(first.enqueued, 1);

  const second = await discoverBatch(options);
  assert.equal(second.new_movies, 0);
  assert.equal(second.duplicates, 1);
  assert.equal(second.enqueued, 0);

  const state = JSON.parse(await readFile(queuePath, 'utf8'));
  assert.equal(state.movies.length, 1);
  assert.equal(state.jobs.length, 1);
  assert.equal(state.jobs[0].idempotency_key, 'NEW-001:media_analysis:v1');
  assert.equal((await store.getMovie('new-001')).id, 'NEW-001');

  const claimed = await store.claim({stage: 'media_analysis', workerId: 'worker-a', now: new Date('2026-08-26T05:00:00Z'), leaseSeconds: 60});
  assert.equal(claimed.movie_id, 'NEW-001');
  assert.equal(await store.claim({stage: 'media_analysis', workerId: 'worker-b', now: new Date('2026-08-26T05:00:30Z'), leaseSeconds: 60}), null);
  const reclaimed = await store.claim({stage: 'media_analysis', workerId: 'worker-b', now: new Date('2026-08-26T05:01:01Z'), leaseSeconds: 60});
  assert.equal(reclaimed.movie_id, 'NEW-001');
  assert.equal(reclaimed.attempt, 2);
  const renewed = await store.renewLease({jobId: reclaimed.id, workerId: 'worker-b', now: new Date('2026-08-26T05:01:20Z'), leaseSeconds: 60});
  assert.equal(renewed.lease_expires_at, '2026-08-26T05:02:20.000Z');
  const completed = await store.finishJob({jobId: reclaimed.id, workerId: 'worker-b', outcome: 'completed', now: new Date('2026-08-26T05:01:30Z')});
  assert.equal(completed.status, 'completed');
  const editorial = await store.enqueueJob({movieId: 'NEW-001', stage: 'editorial', priority: 5, now: new Date('2026-08-26T05:02:00Z')});
  const sameEditorial = await store.enqueueJob({movieId: 'new-001', stage: 'editorial', priority: 5, now: new Date('2026-08-26T05:02:01Z')});
  assert.equal(sameEditorial.id, editorial.id);
  assert.equal((await store.findJob({movieId: 'NEW-001', stage: 'editorial'})).id, editorial.id);
  const claimedEditorial = await store.claim({stage: 'editorial', jobId: editorial.id, workerId: 'editor-a', now: new Date('2026-08-26T05:03:00Z')});
  assert.equal(claimedEditorial.id, editorial.id);
  const blocked = await store.finishJob({jobId: editorial.id, workerId: 'editor-a', outcome: 'blocked', errorCode: 'EDITORIAL_QA_FAILED', now: new Date('2026-08-26T05:03:30Z')});
  assert.equal(blocked.status, 'blocked');
  assert.equal(await store.requeueBlocked({jobId: editorial.id, allowedErrorCodes: ['AUTH_REQUIRED'], now: new Date('2026-08-26T05:04:00Z')}), null);
  const requeued = await store.requeueBlocked({jobId: editorial.id, allowedErrorCodes: ['EDITORIAL_QA_FAILED'], now: new Date('2026-08-26T05:04:01Z')});
  assert.equal(requeued.status, 'queued');
  const retryClaim = await store.claim({stage: 'editorial', jobId: editorial.id, workerId: 'editor-b', now: new Date('2026-08-26T05:04:02Z')});
  await store.finishJob({jobId: retryClaim.id, workerId: 'editor-b', outcome: 'retry', errorCode: 'EDITORIAL_GENERATION_FAILED', now: new Date('2026-08-26T05:04:03Z')});
  assert.equal(await store.requeueRetry({jobId: editorial.id, allowedErrorCodes: ['AUTH_REQUIRED'], now: new Date('2026-08-26T05:04:04Z')}), null);
  const immediateRetry = await store.requeueRetry({jobId: editorial.id, allowedErrorCodes: ['EDITORIAL_GENERATION_FAILED'], now: new Date('2026-08-26T05:04:05Z')});
  assert.equal(immediateRetry.status, 'queued');
  const finalClaim = await store.claim({stage: 'editorial', jobId: editorial.id, workerId: 'editor-c', now: new Date('2026-08-26T05:04:06Z')});
  await store.finishJob({jobId: finalClaim.id, workerId: 'editor-c', outcome: 'blocked', errorCode: 'EDITORIAL_QA_FAILED', now: new Date('2026-08-26T05:04:07Z')});
  assert.equal(await store.completeBlockedAfterQa({jobId: editorial.id, allowedErrorCodes: ['AUTH_REQUIRED'], now: new Date('2026-08-26T05:04:08Z')}), null);
  const finalized = await store.completeBlockedAfterQa({jobId: editorial.id, allowedErrorCodes: ['EDITORIAL_QA_FAILED'], now: new Date('2026-08-26T05:04:09Z')});
  assert.equal(finalized.status, 'completed');
  assert.equal(finalized.completed_at, '2026-08-26T05:04:09.000Z');
  const update = await store.requeueCompletedForUpdate({jobId: editorial.id, now: new Date('2026-08-26T05:04:10Z')});
  assert.equal(update.status, 'queued');
  assert.equal(update.attempt, 0);
  assert.equal(update.completed_at, null);
  assert.equal((await store.summary()).jobs_by_status.completed, 1);

  const image = await store.enqueueJob({movieId: 'NEW-001', stage: 'image', now: new Date('2026-08-26T05:05:00Z')});
  const imageClaim = await store.claim({stage: 'image', jobId: image.id, workerId: 'image-a', now: new Date('2026-08-26T05:05:01Z')});
  await store.finishJob({jobId: imageClaim.id, workerId: 'image-a', outcome: 'failed', errorCode: 'IMAGE_GENERATION_FAILED', now: new Date('2026-08-26T05:05:02Z')});
  assert.equal(await store.requeueFailedMedia({jobId: image.id, stage: 'video', now: new Date('2026-08-26T05:05:03Z')}), null);
  const reopenedImage = await store.requeueFailedMedia({jobId: image.id, stage: 'image', now: new Date('2026-08-26T05:05:04Z')});
  assert.equal(reopenedImage.status, 'queued');
  assert.equal(reopenedImage.attempt, 0);
  assert.equal(reopenedImage.last_error_code, null);
  assert.equal((await store.claim({stage: 'image', jobId: image.id, workerId: 'image-b', now: new Date('2026-08-26T05:05:05Z')})).attempt, 1);

  const resolvedDirectory = resolve(directory);
  assert.ok(resolvedDirectory.startsWith(`${resolve(tmpdir())}${sep}`));
  await rm(resolvedDirectory, {recursive: true});
});

test('rediscovery promotes one upcoming partial movie to one selectable eligible job', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cc18-discovery-transition-'));
  try {
    const queuePath = join(directory, 'queue.json');
    const listingUrl = 'https://cc18.tv/';
    const workUrl = 'https://cc18.tv/player.php?uuid=transition-one&cat=19';
    let observation = 0;
    const store = new FileQueueStore(queuePath);
    const fetchImpl = async (url) => {
      if (String(url) === listingUrl) return {ok: true, status: 200, text: async () => `<a href="${workUrl}">work</a>`};
      observation += 1;
      const html = observation === 1
        ? workHtml({id: 'MOVE-001', date: '2026-09-03', description: null})
        : workHtml({id: 'MOVE-001', date: '2026-08-25', description: '已補齊的公開資料。'});
      return {ok: true, status: 200, text: async () => html};
    };
    const options = {
      listingUrls: [listingUrl],
      store,
      config: {...config, initial_stages: ['editorial']},
      fetchImpl,
      now: new Date('2026-08-26T04:00:00Z'),
      wait: async () => {},
      logger: {warn() {}},
    };

    const first = await discoverBatch(options);
    assert.equal(first.upcoming, 1);
    assert.equal(first.new_movies, 1);
    assert.equal(first.enqueued, 0);

    const second = await discoverBatch(options);
    assert.equal(second.eligible, 1);
    assert.equal(second.new_movies, 0);
    assert.equal(second.duplicates, 1);
    assert.equal(second.enqueued, 1);

    const third = await discoverBatch(options);
    assert.equal(third.eligible, 1);
    assert.equal(third.enqueued, 0);

    const state = JSON.parse(await readFile(queuePath, 'utf8'));
    assert.equal(state.movies.length, 1);
    assert.equal(state.jobs.length, 1);
    assert.equal(state.movies[0].classification, 'eligible');
    assert.equal(state.movies[0].metadata_status, 'validated');
    assert.equal(state.movies[0].release_date, '2026-08-25');
    assert.equal(state.movies[0].source_record.description, '已補齊的公開資料。');
    assert.equal(state.jobs[0].idempotency_key, 'MOVE-001:editorial:v1');

    const candidates = await store.listCanaryCandidates({limit: 1, now: new Date('2026-08-26T05:00:00Z')});
    assert.deepEqual(candidates.map(({movie_id}) => movie_id), ['MOVE-001']);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('D1 rediscovery refreshes selector status fields while keeping jobs idempotent', async () => {
  let statements;
  const fetchImpl = async (_url, options) => {
    statements = JSON.parse(options.body).batch;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        errors: [],
        result: statements.map((_statement, index) => ({
          success: true,
          results: index === 0 ? [{is_new: 0}] : [],
          meta: {changes: index === 2 ? 0 : 1},
        })),
      }),
    };
  };
  const store = new D1RestQueueStore({accountId: 'account', databaseId: 'database', apiToken: 'token', fetchImpl});
  const result = await store.upsertDiscovery({
    record: {
      id: 'MOVE-001',
      release_date: '2026-08-25',
      source_url: 'https://cc18.tv/player.php?uuid=transition-one&cat=19',
      description: '已補齊的公開資料。',
    },
    classification: 'eligible',
    runId: 'run-2',
    priority: 10,
    stages: ['editorial'],
  });

  assert.equal(result.isNew, false);
  assert.equal(result.enqueued_count, 0);
  assert.match(statements[0].sql, /release_date=excluded\.release_date/u);
  assert.match(statements[0].sql, /classification=excluded\.classification/u);
  assert.match(statements[0].sql, /metadata_status=excluded\.metadata_status/u);
  assert.match(statements[2].sql, /ON CONFLICT\(idempotency_key\) DO NOTHING/u);
  assert.deepEqual(statements[0].params.slice(0, 9), [
    'MOVE-001',
    '2026-08-25',
    'https://cc18.tv/player.php?uuid=transition-one&cat=19',
    'transition-one',
    statements[0].params[4],
    statements[0].params[5],
    'eligible',
    'validated',
    JSON.stringify({
      id: 'MOVE-001',
      release_date: '2026-08-25',
      source_url: 'https://cc18.tv/player.php?uuid=transition-one&cat=19',
      description: '已補齊的公開資料。',
    }),
  ]);
});

test('requeues a completed D1 publication for a later media update', async () => {
  let statement;
  const fetchImpl = async (_url, options) => {
    statement = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({success: true, errors: [], result: [{success: true, results: [{id: 'publish-1', status: 'queued', attempt: 0}], meta: {changes: 1}}]}),
    };
  };
  const store = new D1RestQueueStore({accountId: 'account', databaseId: 'database', apiToken: 'token', fetchImpl});
  const requeued = await store.requeueCompletedForUpdate({jobId: 'publish-1', now: new Date('2026-09-03T01:00:00Z')});
  assert.equal(requeued.status, 'queued');
  assert.match(statement.sql, /status='completed'/);
  assert.match(statement.sql, /attempt=0/);
  assert.deepEqual(statement.params, ['2026-09-03T01:00:00.000Z', 'publish-1']);
});

test('reopens only an explicitly targeted failed D1 media job', async () => {
  let statement;
  const fetchImpl = async (_url, options) => {
    statement = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({success: true, errors: [], result: [{success: true, results: [{id: 'image-1', stage: 'image', status: 'queued', attempt: 0}], meta: {changes: 1}}]}),
    };
  };
  const store = new D1RestQueueStore({accountId: 'account', databaseId: 'database', apiToken: 'token', fetchImpl});
  const requeued = await store.requeueFailedMedia({jobId: 'image-1', stage: 'image', now: new Date('2026-09-03T01:10:00Z')});
  assert.equal(requeued.status, 'queued');
  assert.match(statement.sql, /stage=\? AND status='failed'/);
  assert.match(statement.sql, /attempt=0/);
  assert.deepEqual(statement.params, ['2026-09-03T01:10:00.000Z', 'image-1', 'image']);
  await assert.rejects(() => store.requeueFailedMedia({jobId: 'editorial-1', stage: 'editorial'}), /Invalid media stage/);
});

test('reopens only an explicitly targeted failed D1 publish job', async () => {
  let statement;
  const fetchImpl = async (_url, options) => {
    statement = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({success: true, errors: [], result: [{success: true, results: [{id: 'publish-1', stage: 'publish', status: 'queued', attempt: 0}], meta: {changes: 1}}]}),
    };
  };
  const store = new D1RestQueueStore({accountId: 'account', databaseId: 'database', apiToken: 'token', fetchImpl});
  const requeued = await store.requeueFailedPublish({jobId: 'publish-1', now: new Date('2026-09-03T01:20:00Z')});
  assert.equal(requeued.status, 'queued');
  assert.match(statement.sql, /stage='publish' AND status='failed'/u);
  assert.match(statement.sql, /attempt=0/u);
  assert.deepEqual(statement.params, ['2026-09-03T01:20:00.000Z', 'publish-1']);
});

test('fails closed when the listing selector returns no candidates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cc18-discovery-empty-'));
  const store = new FileQueueStore(join(directory, 'queue.json'));
  const fetchImpl = async () => ({ok: true, status: 200, text: async () => '<html><body>No matching works</body></html>'});
  await assert.rejects(
    discoverBatch({listingUrls: ['https://cc18.tv/'], store, config, fetchImpl, now: new Date('2026-08-26T04:00:00Z'), logger: {warn() {}}}),
    /too few candidates/,
  );
  const summary = await store.summary();
  assert.equal(summary.last_run.status, 'failed');
  const resolvedDirectory = resolve(directory);
  assert.ok(resolvedDirectory.startsWith(`${resolve(tmpdir())}${sep}`));
  await rm(resolvedDirectory, {recursive: true});
});

test('eligible discovery can enqueue creative editorial and optional media independently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cc18-dual-stage-'));
  const store = new FileQueueStore(join(directory, 'queue.json'));
  try {
    const record = {
      id: 'DUAL-001', release_date: '2026-08-27', source_url: 'https://cc18.tv/player.php?uuid=dual',
      title: '測試作品', actress: [], series: null, source_tags: [], description: '測試簡介',
    };
    const result = await store.upsertDiscovery({record, classification: 'eligible', runId: null, priority: 10, stages: ['editorial', 'media_analysis']});
    assert.equal(result.enqueued_count, 2);
    assert.equal((await store.findJob({movieId: 'DUAL-001', stage: 'editorial'})).status, 'queued');
    assert.equal((await store.findJob({movieId: 'DUAL-001', stage: 'media_analysis'})).status, 'queued');
  } finally {
    await rm(directory, {recursive: true});
  }
});

test('discovery enqueues every eligible work without a per-run or daily publication quota', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cc18-discovery-all-'));
  const store = new FileQueueStore(join(directory, 'queue.json'));
  try {
    const listingUrl = 'https://cc18.tv/';
    const works = Array.from({length: 5}, (_, index) => ({
      id: `ALL-${String(index + 1).padStart(3, '0')}`,
      url: `https://cc18.tv/player.php?uuid=all-${index + 1}&cat=19`,
    }));
    const responses = new Map([
      [listingUrl, works.map(({url}) => `<a href="${url}">work</a>`).join('')],
      ...works.map(({id, url}) => [url, workHtml({id, date: '2026-08-25'})]),
    ]);
    const fetchImpl = async (url) => ({
      ok: responses.has(String(url)),
      status: responses.has(String(url)) ? 200 : 404,
      text: async () => responses.get(String(url)) ?? '',
    });
    const result = await discoverBatch({
      listingUrls: [listingUrl],
      store,
      config: {...config, initial_stages: ['editorial']},
      fetchImpl,
      now: new Date('2026-08-26T04:00:00Z'),
      wait: async () => {},
      logger: {warn() {}},
    });
    assert.equal(result.eligible, works.length);
    assert.equal(result.new_movies, works.length);
    assert.equal(result.enqueued, works.length);
    const state = await store.read();
    assert.deepEqual(state.jobs.map(({movie_id}) => movie_id).sort(), works.map(({id}) => id).sort());
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('discovery processes more than 500 candidates without a hard batch cap', async () => {
  const listingUrl = 'https://cc18.tv/';
  const works = Array.from({length: 501}, (_, index) => ({
    id: `BULK-${String(index + 1).padStart(3, '0')}`,
    url: `https://cc18.tv/player.php?uuid=bulk-${index + 1}&cat=19`,
  }));
  const responses = new Map([
    [listingUrl, works.map(({url}) => `<a href="${url}">work</a>`).join('')],
    ...works.map(({id, url}) => [url, workHtml({id, date: '2026-08-25'})]),
  ]);
  const enqueued = [];
  const store = {
    async startRun() {},
    async finishRun() {},
    async upsertDiscovery({record}) {
      enqueued.push(record.id);
      return {isNew: true, enqueued_count: 1};
    },
  };
  const fetchImpl = async (url) => ({
    ok: responses.has(String(url)),
    status: responses.has(String(url)) ? 200 : 404,
    text: async () => responses.get(String(url)) ?? '',
  });

  const result = await discoverBatch({
    listingUrls: [listingUrl],
    store,
    config: {...config, initial_stages: ['editorial']},
    fetchImpl,
    now: new Date('2026-08-26T04:00:00Z'),
    wait: async () => {},
    logger: {warn() {}},
  });

  assert.equal(result.candidates, 501);
  assert.equal(result.eligible, 501);
  assert.equal(result.enqueued, 501);
  assert.deepEqual(enqueued, works.map(({id}) => id));
});
