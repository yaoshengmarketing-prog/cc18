import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {applyLocalRepair, buildLocalRepairRequest, localRepairSchemaFor, splitReviewMarkdown} from '../scripts/editorial/lib/local-repair.mjs';
import {readFile} from 'node:fs/promises';

const markdown = `---
id: TEST-001
status: draft
---

## 開頭

真正的重點不在場景，而在人物關係。

## 保留

TEST-001 與演員甲的這一段不得改動。
`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const report = {
  id: 'TEST-001',
  status: 'LOCAL_REPAIR',
  review_sha256: hash(markdown),
  findings: [{code: 'formulaic_machine_voice', scope: 'LOCAL_REPAIR', locations: [{paragraph: 2}]}],
};

test('local repair request contains only QA-targeted paragraphs', () => {
  const request = buildLocalRepairRequest({movieId: 'TEST-001', markdown, report, preservedEntities: ['TEST-001', '人物關係']});
  assert.equal(request.targets.length, 1);
  assert.equal(request.targets[0].paragraph, 2);
  assert.deepEqual(request.targets[0].preserve, ['人物關係']);
  assert.equal(request.constraints[0].code, 'formulaic_machine_voice');
  assert.doesNotMatch(JSON.stringify(request), /演員甲/);
});

test('local repair response schema locks the exact movie identity', () => {
  assert.equal(localRepairSchemaFor('TEST-001').properties.movie_id.const, 'TEST-001');
});

test('local repair changes only the approved paragraph and preserves required entities', () => {
  const request = buildLocalRepairRequest({movieId: 'TEST-001', markdown, report, preservedEntities: ['TEST-001', '人物關係']});
  const repaired = applyLocalRepair({
    movieId: 'TEST-001', markdown, request,
    response: {movie_id: 'TEST-001', patches: [{
      paragraph: 2,
      original_sha256: request.targets[0].original_sha256,
      replacement: '人物關係直接決定這個場景如何成立，也讓前後反應產生差異。',
      change_reason: '改為直接判斷',
    }]},
  });
  assert.match(repaired, /人物關係直接決定/);
  assert.match(repaired, /TEST-001 與演員甲的這一段不得改動。/);
  assert.equal(splitReviewMarkdown(repaired).paragraphs[3].text, splitReviewMarkdown(markdown).paragraphs[3].text);
});

test('local repair may bind an omitted response identity locally but rejects a conflicting identity', () => {
  const request = buildLocalRepairRequest({movieId: 'TEST-001', markdown, report, preservedEntities: ['人物關係']});
  const patch = {
    paragraph: 2,
    original_sha256: request.targets[0].original_sha256,
    replacement: '人物關係直接決定這個場景如何成立，也讓前後反應產生差異。',
    change_reason: '改為直接判斷',
  };
  assert.match(applyLocalRepair({movieId: 'TEST-001', markdown, request, response: {patches: [patch]}}), /人物關係直接決定/);
  assert.throws(() => applyLocalRepair({
    movieId: 'TEST-001', markdown, request, response: {movie_id: 'WRONG-999', patches: [patch]},
  }), /response identity mismatch/);
});

test('local repair rejects unapproved targets, stale hashes, entity loss, and excessive shrinkage', () => {
  const request = buildLocalRepairRequest({movieId: 'TEST-001', markdown, report, preservedEntities: ['人物關係']});
  const base = {movie_id: 'TEST-001', patches: [{paragraph: 2, original_sha256: request.targets[0].original_sha256, replacement: '人物關係直接決定場景如何成立。', change_reason: '直接判斷'}]};
  assert.throws(() => applyLocalRepair({movieId: 'TEST-001', markdown, request, response: {...base, patches: [{...base.patches[0], paragraph: 4}]}}), /unapproved/);
  assert.throws(() => applyLocalRepair({movieId: 'TEST-001', markdown, request, response: {...base, patches: [{...base.patches[0], original_sha256: '0'.repeat(64)}]}}), /changed after QA/);
  assert.throws(() => applyLocalRepair({movieId: 'TEST-001', markdown, request, response: {...base, patches: [{...base.patches[0], replacement: '改寫後完全遺失必要資訊而且長度仍然足夠通過基本比例檢查。'}]}}), /lost preserved entity/);
  assert.throws(() => applyLocalRepair({movieId: 'TEST-001', markdown, request, response: {...base, patches: [{...base.patches[0], replacement: '人物關係。'}]}}), /removed too much/);
});

test('repair command validates an isolated candidate before replacing the draft', async () => {
  const source = await readFile(new URL('../scripts/editorial/repair-draft.mjs', import.meta.url), 'utf8');
  assert.match(source, /--review=/);
  assert.match(source, /--report=/);
  assert.match(source, /original draft was not changed/);
  assert.match(source, /writeFile\(reviewPath, repaired/);
  assert.match(source, /repairAttempt <= 3/);
  assert.match(source, /replacement 必須是完整且非空/);
  assert.match(source, /local_repair_candidate_qa/);
  assert.match(source, /candidate QA/);
});
