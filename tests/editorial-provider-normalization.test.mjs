import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEditorialResult, parseFirstJsonObject} from '../scripts/editorial/lib/provider-normalization.mjs';

test('extracts the first complete JSON object and ignores gateway trailing prose', () => {
  assert.deepEqual(parseFirstJsonObject('```json\n{"ok":true}\n``` trailing'), {ok: true});
});

test('maps the alternate gateway editorial shape into the CC18 contract', () => {
  const safePublicSource = {safe_title_signals: [
    {type: 'theme', value: '角色扮演', source_field: 'safe_signals'},
    {type: 'presentation', value: '高畫質', source_field: 'safe_signals'},
  ]};
  const safeVideoAnalysis = {observations: Array.from({length: 5}, (_, i) => ({i, setting: '一般室內場景', tone: i % 2 ? '輕鬆互動' : '中性互動', camera: ['近距離鏡位']}))};
  const normalized = normalizeEditorialResult({
    title: 'TEST-001 角色扮演與高畫質', seoTitle: 'TEST-001 影評', socialTitle: 'TEST-001 選片', titleSignals: ['角色扮演', '高畫質'],
    editorialBrief: {positioning: '定位', angle: '角度', what_to_highlight: ['一', '二', '三'], risk_notes: ['甲', '乙', '丙']},
    review: {intro: '短評', sections: Array.from({length: 6}, (_, i) => ({heading: `段落${i}`, content: '內容'.repeat(100)})), conclusion: '總評'},
  }, {movieId: 'TEST-001', safePublicSource, safeVideoAnalysis});
  assert.equal(normalized.title_signals.length, 2);
  assert.equal(normalized.sections.length, 6);
  assert.equal(normalized.evidence.length, 5);
  assert.deepEqual(normalized.canonical_tag_ids, ['story', 'close-perspective', 'contrast-charm']);
});
