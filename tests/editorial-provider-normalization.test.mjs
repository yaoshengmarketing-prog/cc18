import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEditorialResult, parseFirstJsonObject} from '../scripts/editorial/lib/provider-normalization.mjs';

test('extracts the first complete JSON object and ignores gateway trailing prose', () => {
  assert.deepEqual(parseFirstJsonObject('```json\n{"ok":true}\n``` trailing'), {ok: true});
});

test('preserves nested review_draft sections returned by gateway models', () => {
  const safePublicSource = {
    safe_title_signals: [{type: 'character', value: '設定甲'}, {type: 'presentation', value: '高畫質'}],
    creative_seed_brief: {themes: ['角色成長'], creative_seeds: []},
  };
  const review_draft = {
    opening: '開場內容'.repeat(30),
    ...Object.fromEntries(Array.from({length: 5}, (_, index) => [`section_${index + 1}`, {heading: `段落 ${index + 1}`, content: `獨特內容${index + 1}`.repeat(30)}])),
    closing: '結論內容'.repeat(30),
  };
  const normalized = normalizeEditorialResult({title: 'TEST-004 設定甲 高畫質', review_draft, editorial_brief: {audience: ['觀眾甲']}, decision_guide: {audience_not_for: ['觀眾乙']}}, {
    movieId: 'TEST-004', safePublicSource, safeVideoAnalysis: {observations: []},
  });
  assert.equal(normalized.sections.length, 7);
  assert.equal(normalized.sections[1].heading, '段落 1');
  assert.match(normalized.sections[1].body, /獨特內容1/);
  assert.match(normalized.sections.at(-1).body, /未必適合/);
  assert.doesNotMatch(normalized.sections.at(-1).body, /觀眾。若偏好/);
});

test('wraps intro and conclusion around reviewDraft section arrays and fills decision tradeoffs', () => {
  const safePublicSource = {
    safe_title_signals: [{type: 'performer', value: '甲'}, {type: 'theme', value: '南國'}],
    creative_seed_brief: {themes: ['自然感'], creative_seeds: []},
  };
  const normalized = normalizeEditorialResult({
    title: 'TEST-005 甲 南國',
    reviewDraft: {
      intro: '獨特開場'.repeat(30),
      sections: Array.from({length: 5}, (_, index) => ({heading: `分析 ${index + 1}`, content: `不同分析${index + 1}`.repeat(30)})),
      conclusion: '完整結論'.repeat(30),
    },
    editorialBrief: {audience: ['偏好自然感的觀眾']},
    decision_guide: {audience_for: ['偏好自然感的觀眾'], audience_not_for: []},
  }, {movieId: 'TEST-005', safePublicSource, safeVideoAnalysis: {observations: []}});
  assert.equal(normalized.sections.length, 7);
  assert.equal(normalized.sections[0].heading, '這部作品先賣什麼');
  assert.equal(normalized.sections.at(-1).heading, '總評與選片結論');
  assert.equal(normalized.decision_guide.audience_for.length, 2);
  assert.equal(normalized.decision_guide.audience_not_for.length, 2);
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
    review: {intro: '短評', sections: Array.from({length: 6}, (_, i) => ({heading: `段落${i}`, content: `第${i}段的獨特內容。${'內容'.repeat(100)}`})), conclusion: '總評'},
  }, {movieId: 'TEST-001', safePublicSource, safeVideoAnalysis});
  assert.equal(normalized.title_signals.length, 2);
  assert.equal(normalized.sections.length, 7);
  assert.equal(normalized.evidence.length, 5);
  assert.deepEqual(normalized.editorial_tag_ids, ['story', 'contrast-charm']);
});

test('replaces an empty selected thesis with a non-empty structured fallback', () => {
  const normalized = normalizeEditorialResult({
    selected_thesis: '',
    decision_guide: {thesis: '由生疏到掌握節奏的角色成長，是這部作品最清楚的選片切角。'},
    angle_candidates: ['候選角度一', '候選角度二', '候選角度三'],
    title: 'TEST-002 測試標題',
    title_signals: ['甲', '乙'],
    sections: [],
  }, {
    movieId: 'TEST-002',
    safePublicSource: {safe_title_signals: [
      {type: 'performer', value: '甲', source_field: 'actress'},
      {type: 'performer', value: '乙', source_field: 'actress'},
    ]},
    safeVideoAnalysis: {observations: []},
  });
  assert.equal(normalized.selected_thesis, '由生疏到掌握節奏的角色成長，是這部作品最清楚的選片切角。');
});

test('expands a short quick-decision thesis into a useful local fallback', () => {
  const normalized = normalizeEditorialResult({
    selected_thesis: '企劃節奏明確',
    decision_guide: {thesis: '企劃節奏明確'},
    angle_candidates: ['企劃節奏的前後差異', '角色互動', '選片取捨'],
    title: 'TEST-007 測試標題',
    title_signals: ['企劃', '節奏'],
    sections: [],
  }, {
    movieId: 'TEST-007',
    safePublicSource: {safe_title_signals: [
      {type: 'theme', value: '企劃', source_field: 'title'},
      {type: 'presentation', value: '節奏', source_field: 'title'},
    ]},
    safeVideoAnalysis: {observations: []},
  });
  assert.ok(normalized.decision_guide.thesis.length >= 20);
  assert.match(normalized.decision_guide.thesis, /企劃節奏明確/);
});

test('maps snake-case review and decision wrappers and derives source-only evidence', () => {
  const safePublicSource = {
    safe_title_signals: [
      {type: 'performer', value: '甲', source_field: 'actress'},
      {type: 'performer', value: '乙', source_field: 'actress'},
      {type: 'presentation', value: '高畫質', source_field: 'safe_signals'},
    ],
    creative_seed_brief: {
      themes: ['角色成長', '互動節奏', '關係轉折'],
      creative_seeds: ['用前後差異形成敘事對照'],
    },
  };
  const normalized = normalizeEditorialResult({
    title: 'TEST-003 甲與乙', title_signals: safePublicSource.safe_title_signals,
    angle_candidates: ['角度一', '角度二', '角度三'],
    editorial_brief: {positioning: '以角色成長作為主要定位', audience: ['偏好企劃感的觀眾', '重視角色互動的觀眾']},
    review_draft: {
      opening: '開場內容'.repeat(40), story_and_structure: '結構內容'.repeat(40), performer_dynamics: '互動內容'.repeat(40),
      presentation_and_style: '呈現內容'.repeat(40), why_it_works: '看點內容'.repeat(40), selection_advice: '選片內容'.repeat(40), closing: '結論內容'.repeat(40),
    },
    decision_guide: {
      one_sentence_verdict: '這是一部以成長曲線與互動節奏建立差異的企劃。',
      best_for: ['偏好企劃感的觀眾', '重視角色互動的觀眾'],
      maybe_skip_if: ['偏好寫實紀錄者', '只想看單一節奏者'],
      compare_by_need: [{need: '想看什麼差異', advice: '比較前後段落的角色主導性'}],
    },
    sections: [], evidence: [],
  }, {movieId: 'TEST-003', safePublicSource, safeVideoAnalysis: {observations: []}});
  assert.equal(normalized.sections.length, 7);
  assert.equal(normalized.evidence.length, 6);
  assert.equal(normalized.decision_guide.audience_for.length, 2);
  assert.equal(normalized.decision_guide.audience_not_for.length, 2);
  assert.equal(normalized.decision_guide.questions_answered.length, 3);
});

test('recovers title fields nested inside a provider review wrapper', () => {
  const normalized = normalizeEditorialResult({
    review_draft: {
      title: 'TEST-006 密着マッサージ企劃',
      seo_title: 'TEST-006 密着マッサージ影評',
      social_title: 'TEST-006 選片重點',
      sections: [],
    },
    angle_candidates: ['角度一', '角度二', '角度三'],
  }, {
    movieId: 'TEST-006',
    safePublicSource: {safe_title_signals: [
      {type: 'theme', value: '密着マッサージ', source_field: 'title'},
      {type: 'performer', value: '測試演員', source_field: 'actress'},
    ]},
    safeVideoAnalysis: {observations: []},
  });
  assert.equal(normalized.title, 'TEST-006 密着マッサージ企劃');
  assert.equal(normalized.seo_title, 'TEST-006 密着マッサージ影評');
  assert.equal(normalized.social_title, 'TEST-006 選片重點');
});
