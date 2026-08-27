import test from 'node:test';
import assert from 'node:assert/strict';
import {editorialContentIssues, sourceOnlyGroundingIssues} from '../scripts/editorial/lib/qa-rules.mjs';

test('source-only QA allows creative audiovisual commentary but still requires a source-specific title concept', () => {
  const issues = sourceOnlyGroundingIssues({
    body: '文章宣稱近距離鏡位與呼吸節奏帶來沉浸感。',
    titleSignals: ['測試演員', '高畫質'],
    actresses: ['測試演員'],
  });
  assert.deepEqual(issues, ['missing_source_specific_title_concept']);
});

test('content QA requires source adult vocabulary in both title strategy and prose', () => {
  assert.deepEqual(editorialContentIssues({
    body: '文章只有節奏、反差與氣氛，沒有回答實際題材。',
    titleSignals: ['測試演員', '高畫質'],
    topicElements: {identity: ['人妻'], action: ['中出']},
  }), ['body_lacks_source_adult_vocabulary', 'title_lacks_primary_source_adult_topic']);
  assert.deepEqual(editorialContentIssues({
    body: '人妻設定與中出題材在這部作品裡互相支撐，適合重視關係設定的觀眾。',
    titleSignals: ['測試演員', '人妻'],
    topicElements: {identity: ['人妻'], action: ['中出']},
  }), []);
  assert.deepEqual(editorialContentIssues({
    titles: ['TEST-001 露出慾望的學生設定'],
    body: '露出慾望決定被觀看的場景；露出慾望也讓學生妹與中出題材產生因果。',
    titleSignals: ['露出慾望', '學生設定'],
    topicElements: {identity: ['學生妹'], action: ['中出']},
    coreSourceConcept: '露出慾望',
  }), []);
});

test('content QA rejects repeated generic arcs instead of banning the vocabulary entirely', () => {
  assert.deepEqual(editorialContentIssues({
    body: '主導權轉移是第一段的結論；後面又把主導權轉移當作唯一結論。',
    titleSignals: [], topicElements: {},
  }), ['overused_generic_editorial_arc']);
});

test('content QA requires the source-title core in a title and develops it beyond one mention', () => {
  assert.deepEqual(editorialContentIssues({
    titles: ['TEST-001 學生妹中出'],
    body: '本文只在這裡提到一次露出慾望，後面全部改談角色覺醒。',
    titleSignals: [], topicElements: {}, coreSourceConcept: '露出慾望',
  }), ['title_lacks_source_core_concept', 'source_core_concept_not_developed']);
  assert.deepEqual(editorialContentIssues({
    titles: ['TEST-001 露出慾望如何改變場景設計'],
    body: '露出慾望先決定場景風險；後段再分析露出慾望如何改變人物選擇。',
    titleSignals: [], topicElements: {}, coreSourceConcept: '露出慾望',
  }), []);
});

test('source-only QA accepts creative audiovisual commentary with a traceable topic concept', () => {
  const issues = sourceOnlyGroundingIssues({
    body: '公開簡介把課程設計成一日挑戰，近距離鏡位與停頓被寫成情緒推進。',
    titleSignals: ['要結愛', '弓道少女', '一日特訓'],
    actresses: ['要結愛'],
  });
  assert.deepEqual(issues, []);
});
