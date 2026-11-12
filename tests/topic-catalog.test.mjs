import assert from 'node:assert/strict';
import test from 'node:test';
import {loadPublishedTopicCatalog, projectPublishedTopicCatalog} from '../src/lib/topic-catalog.mjs';

test('topic membership uses every Movie Master topic, beyond the two shown on cards', () => {
  const records = [
    {card: {catalog_code: 'TEST-001', release_date: '2026-01-01', canonical_topics: [{id: 'first'}, {id: 'second'}]}, canonical_topic_tag_ids: ['first', 'second', 'third']},
    {card: {catalog_code: 'TEST-002', release_date: '2026-02-01', canonical_topics: [{id: 'third'}]}, canonical_topic_tag_ids: ['third']},
  ];
  const topics = projectPublishedTopicCatalog(records);
  assert.deepEqual(topics.map(({id, cards}) => [id, cards.map(({catalog_code}) => catalog_code)]), [
    ['third', ['TEST-002', 'TEST-001']],
    ['first', ['TEST-001']],
    ['second', ['TEST-001']],
  ]);
});

test('published kissing collection follows current Movie Master relations', async () => {
  const topics = await loadPublishedTopicCatalog();
  const kissing = topics.find(({id}) => id === 'kissing');
  assert.ok(kissing);
  const ids = new Set(kissing.cards.map(({catalog_code}) => catalog_code));
  assert.equal(ids.size, kissing.cards.length);
  assert.equal(ids.has('SNOS-360'), true);
  assert.equal(ids.has('HUNTC-568'), false);
});
