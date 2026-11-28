import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {knowledgeFiles, loadEditorialKnowledge} from '../scripts/editorial/lib/editorial-knowledge.mjs';

const root = resolve(import.meta.dirname, '..');

test('editorial knowledge base loads all files and stays bounded', async () => {
  const text = await loadEditorialKnowledge(root);
  for (const path of knowledgeFiles) assert.match(text, new RegExp(path.replaceAll('/', '\\/')));
  assert.ok(text.length <= 12100);
  assert.match(text, /模板句/);
});

test('editorial knowledge never instructs removal or unpublishing of pages', async () => {
  const text = await loadEditorialKnowledge(root, {maxChars: 1e6});
  assert.doesNotMatch(text, /下架作品|刪除作品頁|回 410|noindex 這些|unpublish/i);
});

test('missing knowledge directory yields empty text', async () => {
  assert.equal(await loadEditorialKnowledge(resolve(root, 'nonexistent-root')), '');
});