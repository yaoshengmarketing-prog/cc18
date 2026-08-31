import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSeriesSourceId,
  parseSeriesStableId,
  seriesStableIdFromSourceId,
} from '../src/lib/series-identity.mjs';
import {validateSeriesRelations} from '../scripts/build-movie-master.mjs';

const relation = ({id = '20710', name = '系列甲', urlId = id, stableId = `cc18.tv:series:${id}`} = {}) => ({
  source_type: 'series',
  source_id: id,
  stable_source_id: stableId,
  source_name: name,
  source_url: `https://cc18.tv/search.php?s_type=series&s_tid=${urlId}`,
  observed_at: '2026-08-31T10:00:00.000Z',
});

const validate = ({catalogCode = 'TEST-001', series = '系列甲', relations = [relation()], names = new Map(), isPublished = true} = {}) => validateSeriesRelations({
  catalogCode,
  source: {series, source_relations: {series: relations}},
  isPublished,
  seriesNamesByStableId: names,
});

test('series identity codec accepts only canonical positive source IDs', () => {
  assert.equal(parseSeriesSourceId('20710'), '20710');
  assert.equal(seriesStableIdFromSourceId('20710'), 'cc18.tv:series:20710');
  assert.deepEqual(parseSeriesStableId('cc18.tv:series:20710'), {sourceId: '20710', stableId: 'cc18.tv:series:20710'});
  for (const value of ['0', '-1', '01', ' 1', '1 ', '1.0', 'abc', '', null]) {
    assert.throws(() => parseSeriesSourceId(value));
  }
});

test('projects a valid typed series relation and preserves identity across works', () => {
  const names = new Map();
  const first = validate({catalogCode: 'ONE-001', names});
  const second = validate({catalogCode: 'TWO-002', names});
  assert.deepEqual(first, second);
  assert.equal(first[0].stable_source_id, 'cc18.tv:series:20710');
});

test('fails closed for conflicting names and preserves same-name different IDs', () => {
  const names = new Map();
  validate({catalogCode: 'ONE-001', names});
  assert.throws(() => validate({catalogCode: 'TWO-002', series: '系列乙', relations: [relation({name: '系列乙'})], names}), /conflicting names/u);
  const separate = new Map();
  validate({catalogCode: 'ONE-001', names: separate});
  validate({catalogCode: 'TWO-002', series: '系列甲', relations: [relation({id: '20711', name: '系列甲'})], names: separate});
  assert.equal(separate.size, 2);
});

test('fails closed for relation identity, URL, name and multiplicity contradictions', () => {
  assert.throws(() => validate({relations: [relation({stableId: 'cc18.tv:series:999'})]}), /invalid series relation identity/u);
  assert.throws(() => validate({relations: [relation({urlId: '999'})]}), /URL\/identity mismatch/u);
  assert.throws(() => validate({series: '系列乙'}), /typed series\/source series name mismatch/u);
  assert.throws(() => validate({relations: [relation(), relation()]}), /multiple series identities/u);
});

test('does not infer a typed relation from a legacy series string', () => {
  const input = (isPublished) => validateSeriesRelations({
    catalogCode: 'TEST-001',
    source: {series: '系列甲', source_relations: {}},
    isPublished,
    seriesNamesByStableId: new Map(),
  });
  assert.deepEqual(input(false), []);
  assert.throws(() => input(true), /published series relations must be an array/u);
});
