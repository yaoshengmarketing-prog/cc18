import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTaxonomyHelpers, candidateOccurrenceCount} from '../scripts/tags/taxonomy.mjs';

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const taxonomy = await readJson('data/taxonomy.json');
const helpers = createTaxonomyHelpers(taxonomy);

test('canonical tags are deterministic while editorial tags remain separate', () => {
  const channels = helpers.buildTagChannels({
    sourceTags: ['人妻・主婦', '巨乳', '騎乘位', '全高清 (FHD)'],
    canonicalTagIds: ['story'],
    editorialTagIds: ['slow-burn'],
  });
  assert.deepEqual(channels.canonicalTagIds, ['married-woman', 'large-breasts', 'cowgirl-position', 'fhd']);
  assert.deepEqual(channels.editorialTagIds, ['story', 'slow-burn']);
});

test('topic summaries preserve exact CC18 vocabulary and group it for scanning', () => {
  const elements = helpers.buildTopicElements(['人妻・主婦', '巨乳', '騎乘位', '美容院', '全高清 (FHD)']);
  assert.deepEqual(elements.identity, ['人妻・主婦']);
  assert.deepEqual(elements.body, ['巨乳']);
  assert.deepEqual(elements.action, ['騎乘位']);
  assert.deepEqual(elements.setting, ['美容院']);
  assert.deepEqual(elements.presentation, ['全高清 (FHD)']);
});

test('three current canary works produce useful source-derived summaries without an AI call', async () => {
  for (const id of ['MCSR-639', 'NAMH-074', 'SIRO-5722']) {
    const source = await readJson(`data/source-records/${id}.json`);
    const channels = helpers.buildTagChannels({sourceTags: source.source_tags});
    const elements = helpers.buildTopicElements(source.source_tags);
    assert.equal(channels.unmappedSourceTags.length, 0, `${id} has unmapped source terms`);
    assert.ok(channels.canonicalTagIds.length >= 3, `${id} needs at least three canonical terms`);
    assert.ok(Object.values(elements).flat().length >= 3, `${id} topic summary is too thin`);
  }
});

test('candidate occurrence is always the number of unique source works', () => {
  assert.equal(candidateOccurrenceCount({occurrences: 1, source_ids: ['A-001', 'A-001', 'B-002']}), 2);
});
