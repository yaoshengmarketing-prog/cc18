import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceOnlyGroundingIssues} from '../scripts/editorial/lib/qa-rules.mjs';

test('source-only QA allows creative audiovisual commentary but still requires a source-specific title concept', () => {
  const issues = sourceOnlyGroundingIssues({
    body: '文章宣稱近距離鏡位與呼吸節奏帶來沉浸感。',
    titleSignals: ['測試演員', '高畫質'],
    actresses: ['測試演員'],
  });
  assert.deepEqual(issues, ['missing_source_specific_title_concept']);
});

test('source-only QA accepts creative audiovisual commentary with a traceable topic concept', () => {
  const issues = sourceOnlyGroundingIssues({
    body: '公開簡介把課程設計成一日挑戰，近距離鏡位與停頓被寫成情緒推進。',
    titleSignals: ['要結愛', '弓道少女', '一日特訓'],
    actresses: ['要結愛'],
  });
  assert.deepEqual(issues, []);
});
