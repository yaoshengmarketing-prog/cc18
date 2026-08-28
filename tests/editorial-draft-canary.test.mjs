import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../scripts/editorial/draft-canary-d1.mjs', import.meta.url), 'utf8');
const builder = await readFile(new URL('../scripts/editorial/build-from-analysis.mjs', import.meta.url), 'utf8');

test('draft canary is explicitly authorized and reads D1 without mutating queue state', () => {
  assert.match(source, /CC18_ALLOW_EDITORIAL_TRANSMISSION !== 'YES'/);
  assert.match(source, /store\.getMovie\(requestedId\)/);
  assert.doesNotMatch(source, /store\.(claim|enqueueJob|finishJob|requeueRetry|requeueBlocked)\(/);
});

test('draft canary verifies QA and refuses publication or image enqueueing', () => {
  assert.match(source, /record\.review_status !== 'draft'/);
  assert.match(source, /assertFreshAutomatedQa/);
  assert.match(source, /queue_mutated: false/);
  assert.match(source, /image_enqueued: false/);
  assert.match(source, /published: false/);
});

test('resume mode is limited to an existing draft and accepts the actual frontmatter flag', () => {
  assert.match(source, /existingRecord && \(!resumeDraft \|\| existingRecord\.review_status !== 'draft'\)/);
  assert.ok(source.includes("if (!/^status:\\s*draft\\s*$/m.test(review))"));
  assert.match(source, /if \(finalizeOnly\)[\s\S]*qa-draft\.mjs/);
  assert.match(builder, /review_status: 'draft',[\s\S]*image_status: 'pending',[\s\S]*video_status: 'pending'/);
});

test('one malformed rewrite does not consume all remaining QA attempts', () => {
  assert.match(source, /catch \(error\) \{[\s\S]*lastBuildError = error\.message;[\s\S]*continue;/);
  assert.match(builder, /appendEditorialUsage\([\s\S]*normalizeEditorialResult/);
  assert.doesNotMatch(builder, /returned no title/);
});

test('draft canary attempts a bounded local repair before another full rewrite', () => {
  assert.match(source, /qaReport\.status === 'LOCAL_REPAIR'/);
  assert.match(source, /repair-draft\.mjs/);
});
