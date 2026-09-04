import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FileQueueStore} from '../scripts/queue/store.mjs';
import {assertSingleWorkRequest, checkpointArtifactPaths} from '../scripts/canary/isolation.mjs';
import {alreadyPublishedRequestedIds, classifyCanaryStageOutcome, isNonBlockingMediaOutcome, isNonBlockingVideoOutcome, registryDraftIds} from '../scripts/canary/selection.mjs';

test('explicit canary may promote a Registry draft but refuses a published record', () => {
  const registry = {records: [
    {id: 'SNOS-409', review_status: 'draft'},
    {id: 'SNOS-371', review_status: 'published'},
  ]};
  assert.deepEqual(alreadyPublishedRequestedIds(registry, ['SNOS-409']), []);
  assert.deepEqual(alreadyPublishedRequestedIds(registry, ['SNOS-371']), ['SNOS-371']);
  assert.deepEqual([...registryDraftIds(registry)], ['SNOS-409']);
});

test('video retry or terminal failure does not block an approved article while required stages remain blocking', () => {
  assert.equal(isNonBlockingVideoOutcome({stage: 'video', status: 'retry'}), true);
  assert.equal(isNonBlockingVideoOutcome({stage: 'video', status: 'failed'}), true);
  assert.equal(isNonBlockingVideoOutcome({stage: 'video', status: 'leased'}), false);
  assert.equal(isNonBlockingVideoOutcome({stage: 'image', status: 'retry'}), false);
  assert.equal(isNonBlockingMediaOutcome({stage: 'image', status: 'retry'}), true);
  assert.equal(isNonBlockingMediaOutcome({stage: 'image', status: 'failed'}), true);
  assert.deepEqual(classifyCanaryStageOutcome({
    stage: 'image', required: false, exitCode: 1, job: {status: 'retry'},
  }), {continuePipeline: true, reportStatus: 'retry_non_blocking'});
  assert.deepEqual(classifyCanaryStageOutcome({
    stage: 'video', required: false, exitCode: 1, job: {status: 'retry'},
  }), {continuePipeline: true, reportStatus: 'retry_non_blocking'});
  assert.deepEqual(classifyCanaryStageOutcome({
    stage: 'publish', required: true, exitCode: 1, job: {status: 'retry'},
  }), {continuePipeline: false, reportStatus: 'retry'});
});

test('single-work canary protects but is not blocked by unrelated pre-existing untracked drafts', async () => {
  const source = await readFile(new URL('../scripts/canary/run.mjs', import.meta.url), 'utf8');
  const isolated = await readFile(new URL('../scripts/canary/run-isolated.mjs', import.meta.url), 'utf8');
  assert.match(source, /CC18_CANARY_ISOLATED_WORKSPACE/u);
  assert.match(source, /Isolated canary requires exactly one movie ID/u);
  assert.match(isolated, /listCanaryCandidates\(\{limit: 1/u);
  assert.match(isolated, /createCleanWorktree/u);
  assert.match(isolated, /restoreWorkCheckpoint/u);
  assert.match(isolated, /saveWorkCheckpoint/u);
  assert.match(source, /status', '--porcelain', '--untracked-files=no/u);
  assert.match(source, /protectedUntrackedPaths/u);
  assert.match(source, /assertProtectedUntrackedUnchanged/u);
  assert.match(source, /protected pre-existing untracked artifact/u);
  assert.match(source, /stage: 'image'[\s\S]*required: false/u);
  assert.match(source, /stage: 'video'[\s\S]*required: false/u);
  assert.match(source, /stage: 'publish'[\s\S]*required: true/u);
  assert.match(source, /imageGenerationEnabled \? \[\{stage: 'image'/u);
  assert.doesNotMatch(source, /Canary requires CC18_ALLOW_EDITORIAL_TRANSMISSION=YES and CC18_ALLOW_IMAGE_TRANSMISSION=YES/u);
  assert.match(source, /classifyCanaryStageOutcome/u);
  assert.doesNotMatch(source, /Canary requires a clean Git worktree/u);
});

test('production canary accepts one work and excludes generated shared projections from checkpoints', () => {
  assert.doesNotThrow(() => assertSingleWorkRequest({max: 1, requestedIds: []}));
  assert.doesNotThrow(() => assertSingleWorkRequest({max: 1, requestedIds: ['NEW-001']}));
  assert.throws(() => assertSingleWorkRequest({max: 2, requestedIds: []}), /requires --max=1/u);
  assert.throws(() => assertSingleWorkRequest({max: 1, requestedIds: ['A-001', 'B-001']}), /at most one/u);
  const paths = checkpointArtifactPaths('NEW-001');
  assert.deepEqual(paths.filter((path) => !path.includes('NEW-001') && !path.includes('new-001')), [
    'data/movie-registry.json',
    'data/tag-candidates.json',
  ]);
  assert.equal(paths.some((path) => /movie-master|search-index/u.test(path)), false);
});

test('repairs expired leases and selects only validated editorial candidates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cc18-canary-'));
  try {
    const store = new FileQueueStore(join(directory, 'queue.json'));
    const now = new Date('2026-08-27T00:00:00.000Z');
    await store.upsertDiscovery({record: {id: 'NEW-001', release_date: '2026-08-26', source_url: 'https://cc18.tv/player.php?uuid=1', description: '完整'}, classification: 'eligible', runId: null, priority: 10, stages: ['editorial']});
    await store.upsertDiscovery({record: {id: 'OLD-001', release_date: '2026-08-25', source_url: 'https://cc18.tv/player.php?uuid=2', description: '完整'}, classification: 'eligible', runId: null, priority: 5, stages: ['editorial']});
    const old = await store.findJob({movieId: 'OLD-001', stage: 'editorial'});
    await store.claim({stage: 'editorial', jobId: old.id, workerId: 'dead-worker', leaseSeconds: 1, now: new Date('2026-08-26T23:00:00.000Z')});
    const health = await store.queueHealth({now});
    assert.equal(health.stale_leases.length, 1);
    const repaired = await store.repairExpiredLeases({now});
    assert.equal(repaired[0].last_error_code, 'LEASE_EXPIRED');
    const candidates = await store.listCanaryCandidates({limit: 3, now});
    assert.deepEqual(candidates.map(({movie_id}) => movie_id), ['NEW-001', 'OLD-001']);
    const withoutRegistered = await store.listCanaryCandidates({limit: 3, now, excludeMovieIds: ['new-001']});
    assert.deepEqual(withoutRegistered.map(({movie_id}) => movie_id), ['OLD-001']);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('a fresh work is selected before a failed work and completed editorial remains resumable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cc18-canary-resume-'));
  try {
    const store = new FileQueueStore(join(directory, 'queue.json'));
    const now = new Date('2026-09-03T00:00:00.000Z');
    for (const [id, releaseDate] of [['FAILED-001', '2026-09-03'], ['FRESH-001', '2026-09-02']]) {
      await store.upsertDiscovery({record: {id, release_date: releaseDate, source_url: `https://cc18.tv/player.php?uuid=${id}`, description: '完整'}, classification: 'eligible', runId: null, priority: 10, stages: ['editorial']});
    }
    const failedEditorial = await store.findJob({movieId: 'FAILED-001', stage: 'editorial'});
    const claimedEditorial = await store.claim({stage: 'editorial', jobId: failedEditorial.id, workerId: 'editor', now});
    await store.finishJob({jobId: claimedEditorial.id, workerId: 'editor', outcome: 'completed', now});
    const failedPublish = await store.enqueueJob({movieId: 'FAILED-001', stage: 'publish', now});
    const claimedPublish = await store.claim({stage: 'publish', jobId: failedPublish.id, workerId: 'publisher', now});
    await store.finishJob({jobId: claimedPublish.id, workerId: 'publisher', outcome: 'failed', errorCode: 'PUBLISH_GIT_FAILED', now});

    const first = await store.listCanaryCandidates({limit: 1, now});
    assert.equal(first[0].movie_id, 'FRESH-001');
    const second = await store.listCanaryCandidates({limit: 1, now, excludeMovieIds: ['FRESH-001']});
    assert.equal(second[0].movie_id, 'FAILED-001');
    assert.equal(second[0].resume_rank, 2);
    const reopened = await store.requeueFailedPublish({jobId: failedPublish.id, now});
    assert.equal(reopened.status, 'queued');
    assert.equal(reopened.attempt, 0);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
