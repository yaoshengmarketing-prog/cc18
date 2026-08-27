import test from 'node:test';
import assert from 'node:assert/strict';
import {planPublishWaves} from '../scripts/publish/waves.mjs';

test('plans 250 unique works into five bounded publish waves', () => {
  const items = Array.from({length: 250}, (_, index) => `load-${index + 1}`);
  const waves = planPublishWaves(items, {maxItemsPerWave: 50});
  assert.equal(waves.length, 5);
  assert.deepEqual(waves.map(({items: waveItems}) => waveItems.length), [50, 50, 50, 50, 50]);
  assert.equal(waves[0].items[0], 'LOAD-1');
  assert.equal(waves[4].items.at(-1), 'LOAD-250');
});

test('publish waves fail closed for duplicates or unsafe limits', () => {
  assert.throws(() => planPublishWaves(['ONE-001', 'one-001']), /unique/);
  assert.throws(() => planPublishWaves(['ONE-001'], {maxItemsPerWave: 51}), /between 1 and 50/);
});
