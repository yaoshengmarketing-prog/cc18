import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceOnlyGroundingIssues} from '../scripts/editorial/lib/qa-rules.mjs';

test('source-only QA rejects invented audiovisual observation language', () => {
  const issues = sourceOnlyGroundingIssues({
    body: '文章宣稱近距離鏡位與呼吸節奏帶來沉浸感。',
    titleSignals: ['測試演員', '高畫質'],
    actresses: ['測試演員'],
  });
  assert.deepEqual(issues, ['unsupported_source_only_observation', 'missing_source_specific_title_concept']);
});

test('source-only QA accepts a traceable topic concept without video claims', () => {
  const issues = sourceOnlyGroundingIssues({
    body: '公開簡介把課程設計成一日挑戰，文章只評論這項企劃設定。',
    titleSignals: ['要結愛', '弓道少女', '一日特訓'],
    actresses: ['要結愛'],
  });
  assert.deepEqual(issues, []);
});
