import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSourceForPublication, restoreSourceRelations} from '../scripts/publish/source-preflight.mjs';

const source = JSON.parse(await readFile(new URL('../data/source-records/DSOD-067.json', import.meta.url), 'utf8'));
const localization = JSON.parse(await readFile(new URL('../data/localization/performers-zh-tw.json', import.meta.url), 'utf8'));
const check = (record) => validateSourceForPublication({movieId: source.id, source: record, localization});
test('known publishable source passes before paid generation without changing source names', () => {
  const before = JSON.stringify(source);
  check(source);
  assert.equal(JSON.stringify(source), before);
});
test('missing performer identities fail early instead of reaching image generation', () => {
  const invalid = structuredClone(source);
  invalid.source_relations.performers = [];
  assert.throws(() => check(invalid), /performer relation count mismatch/);
});
test('legacy missing series array fails early and cannot be guessed from a name', () => {
  const invalid = structuredClone(source);
  delete invalid.source_relations.series;
  assert.throws(() => check(invalid), /series relations must be an array/);
});
test('a source for another movie is rejected', () => {
  assert.throws(() => check({...source, id: 'OTHER-001'}), /identity mismatch/);
});
test('legacy relations can be repaired from an unchanged source without replacing prose', () => {
  const legacy = structuredClone(source);
  delete legacy.source_relations;
  const repaired = restoreSourceRelations({source: legacy, fresh: source, localization});
  check(repaired);
  assert.equal(repaired.description, legacy.description);
  assert.equal(legacy.source_relations, undefined);
});
test('a changed performer or title requires review instead of silently modifying facts', () => {
  for (const key of ['actress', 'title']) {
    const fresh = {...source, [key]: key === 'actress' ? ['另一位演員'] : '另一部作品'};
    assert.throws(() => restoreSourceRelations({source, fresh, localization}), /refreshed source changed/);
  }
});
