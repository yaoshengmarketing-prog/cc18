import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTagSourceId,
  parseTagStableId,
  tagStableIdFromSourceId,
} from '../src/lib/tag-identity.mjs';
import {validateTagRelations} from '../scripts/build-movie-master.mjs';

const relation = ({id = '12', name = '口交', urlId = id, stableId = `cc18.tv:tag:${id}`, type = 'tag'} = {}) => ({
  source_type: type,
  source_id: id,
  stable_source_id: stableId,
  source_name: name,
  source_url: `https://cc18.tv/search.php?s_type=tag&s_tid=${urlId}`,
  observed_at: '2026-08-31T10:00:00.000Z',
});

const validate = ({catalogCode = 'TEST-001', sourceTags = ['口交'], relations = [relation()], names = new Map(), isPublished = true} = {}) => validateTagRelations({
  catalogCode,
  source: {source_tags: sourceTags, source_relations: {tags: relations}},
  isPublished,
  tagNamesByStableId: names,
});

test('tag identity codec accepts only canonical positive source IDs', () => {
  assert.equal(parseTagSourceId('12'), '12');
  assert.equal(tagStableIdFromSourceId('12'), 'cc18.tv:tag:12');
  assert.deepEqual(parseTagStableId('cc18.tv:tag:12'), {sourceId: '12', stableId: 'cc18.tv:tag:12'});
  for (const value of ['0', '-1', '+1', '01', ' 1', '1 ', '1.0', '%31', 'abc', '', null]) {
    assert.throws(() => parseTagSourceId(value));
  }
});

test('projects multiple tag relations in source order and preserves identity across works', () => {
  const names = new Map();
  const relations = [relation({id: '12', name: '口交'}), relation({id: '4', name: '中出'})];
  const first = validate({catalogCode: 'ONE-001', sourceTags: ['口交', '中出'], relations, names});
  const second = validate({catalogCode: 'TWO-002', sourceTags: ['口交', '中出'], relations, names});
  assert.deepEqual(first, second);
  assert.deepEqual(first.map(({stable_source_id: stableId}) => stableId), ['cc18.tv:tag:12', 'cc18.tv:tag:4']);
});

test('fails closed for conflicting names and preserves same-name different IDs', () => {
  const names = new Map();
  validate({catalogCode: 'ONE-001', names});
  assert.throws(() => validate({catalogCode: 'TWO-002', sourceTags: ['另一名稱'], relations: [relation({name: '另一名稱'})], names}), /conflicting names/u);
  const separate = new Map();
  const projected = validate({
    sourceTags: ['同名'],
    relations: [relation({id: '12', name: '同名'}), relation({id: '13', name: '同名'})],
    names: separate,
  });
  assert.equal(projected.length, 2);
  assert.equal(separate.size, 2);
});

test('fails closed for relation identity, URL, duplicate ID, name and observation contradictions', () => {
  assert.throws(() => validate({relations: [relation({stableId: 'cc18.tv:tag:999'})]}), /invalid tag relation identity/u);
  assert.throws(() => validate({relations: [relation({urlId: '999'})]}), /URL\/identity mismatch/u);
  assert.throws(() => validate({relations: [relation({type: 'series'})]}), /invalid tag relation identity/u);
  assert.throws(() => validate({relations: [relation(), relation()]}), /duplicate tag relation/u);
  assert.throws(() => validate({sourceTags: ['另一名稱']}), /typed tag\/source tag name mismatch/u);
  assert.throws(() => validate({relations: [{...relation(), observed_at: 'not-a-date'}]}), /invalid tag observed_at/u);
});

test('does not infer typed tag identity from raw strings and requires explicit arrays for published works', () => {
  const input = (isPublished) => validateTagRelations({
    catalogCode: 'TEST-001',
    source: {source_tags: ['口交'], source_relations: {}},
    isPublished,
    tagNamesByStableId: new Map(),
  });
  assert.deepEqual(input(false), []);
  assert.throws(() => input(true), /published tag relations must be an array/u);
  assert.deepEqual(validate({sourceTags: [], relations: []}), []);
});
