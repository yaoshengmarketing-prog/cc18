import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('completed-D1 rehydration runs QA before writing local approval artifacts', async () => {
  const source = await readFile(new URL('../scripts/editorial/rehydrate-completed.mjs', import.meta.url), 'utf8');
  assert.match(source, /job\?\.status !== 'completed'/);
  assert.match(source, /qa-draft\.mjs/);
  assert.match(source, /assertFreshAutomatedQa/);
  assert.match(source, /approveAfterAutomatedQa/);
  assert.doesNotMatch(source, /enqueueJob|finishJob/);
});
