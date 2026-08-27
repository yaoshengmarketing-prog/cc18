import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FileQueueStore} from '../scripts/queue/store.mjs';
import {alreadyPublishedRequestedIds, registryDraftIds} from '../scripts/canary/selection.mjs';

test('explicit canary may promote a Registry draft but refuses a published record', () => {
  const registry = {records: [
    {id: 'SNOS-409', review_status: 'draft'},
    {id: 'SNOS-371', review_status: 'published'},
  ]};
  assert.deepEqual(alreadyPublishedRequestedIds(registry, ['SNOS-409']), []);
  assert.deepEqual(alreadyPublishedRequestedIds(registry, ['SNOS-371']), ['SNOS-371']);
  assert.deepEqual([...registryDraftIds(registry)], ['SNOS-409']);
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
