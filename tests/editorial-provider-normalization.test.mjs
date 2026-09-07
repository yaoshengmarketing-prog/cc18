import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEditorialResult, parseFirstJsonObject, publicationProjectionForEvidence} from '../scripts/editorial/lib/provider-normalization.mjs';

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

test('preserves top-level review_sections returned alongside an empty sections array', () => {
  const safePublicSource = {
    core_source_concept: '密着企劃',
    topic_elements: {adult_topics: ['口交']},
    safe_title_signals: [
      {type: 'theme', value: '密着企劃', source_field: 'title'},
      {type: 'adult_topic', value: '口交', source_field: 'source_tags'},
    ],
  };
  const normalized = normalizeEditorialResult({
    title: 'YAKO-099 密着企劃',
    title_signals: safePublicSource.safe_title_signals,
    sections: [],
    review_sections: Array.from({length: 6}, (_, index) => ({
      title: `選片問題 ${index + 1}`,
      text: `${index < 2 ? '密着企劃' : '口交題材'}的來源設定與選片說明。${'這段只整理可追溯的作品資訊，不將未觀看內容寫成事實。'.repeat(5)}`,
    })),
    decision_guide: {
      thesis: '這部作品以密着企劃與口交題材的組合，提供明確而可追溯的選片方向。',
      audience_for: ['偏好密着企劃設定的觀眾', '重視口交題材的觀眾'],
      audience_not_for: ['偏好其他企劃設定的觀眾', '不偏好口交題材的觀眾'],
    },
  }, {movieId: 'YAKO-099', safePublicSource, safeVideoAnalysis: {observations: []}});

  assert.equal(normalized.sections.length, 6);
  assert.equal(normalized.sections[0].heading, '選片問題 1');
  assert.match(normalized.sections[0].body, /密着企劃/);
  assert.match(normalized.sections[2].body, /口交題材/);
  assert.match(normalized.sections.at(-1).body, /未必適合/);
});

test('sparse provider content receives local display fallbacks without inventing source facts', () => {
  const normalized = normalizeEditorialResult({
    angle_candidates: [],
    selected_thesis: '',
    title_signals: [],
    title: '',
    seo_title: '',
    social_title: '',
    short_review: '   ',
    editorial_angle: '',
    editorial_tag_ids: [],
    evidence: [],
    creative_reconstruction_notes: [],
    unsupported_claims_excluded: [],
    decision_guide: {
      thesis: '', story_density: 'unknown', pace: 'unknown', presentation: [],
      audience_for: [], audience_not_for: [], questions_answered: [],
    },
    sections: [],
  }, {
    movieId: 'TEST-008',
    safePublicSource: {core_source_concept: null, safe_title_signals: [], topic_elements: {}},
    safeVideoAnalysis: {observations: []},
  });

  assert.match(normalized.short_review, /TEST-008/);
  assert.equal(normalized.sections.length, 0);
  assert.equal(normalized.evidence.length, 0);
  assert.equal(normalized.decision_guide.questions_answered.length, 3);
  assert.equal(normalized.decision_guide.audience_for.length, 2);
  assert.equal(normalized.decision_guide.audience_not_for.length, 2);
});

test('insufficient video citations replace every public prose surface with one source-only projection', () => {
  const safePublicSource = {
    core_source_concept: '來源企劃',
    safe_title_signals: [{type: 'theme', value: '來源企劃', source_field: 'title'}],
    creative_seed_brief: {themes: [], creative_seeds: []},
  };
  const videoResult = normalizeEditorialResult({
    title: 'TEST-010 影片觀察',
    seo_title: 'TEST-010 鏡位分析',
    social_title: 'TEST-010 表演反應',
    short_review: '鏡頭先拉近，後段收音與呼吸明顯改變。',
    editorial_angle: '以實際鏡位和剪輯變化判斷。',
    evidence: [{basis: 'video_sample', signal: '鏡位', supports: '影片觀察', observation_refs: [0, 1]}],
    decision_guide: {
      thesis: '影片前後段的鏡位與表演反應形成明顯差異。',
      story_density: 'high', pace: 'fast', presentation: ['近距離鏡位'],
      audience_for: ['偏好鏡位變化的觀眾'], audience_not_for: ['不偏好快速剪輯的觀眾'],
      questions_answered: ['後段如何改變？鏡位拉近。', '收音如何？呼吸更明顯。', '表演如何？反應更強。'],
    },
    sections: [{heading: '影片觀察', body: '鏡頭、收音、剪輯與表演反應都在後段改變。'}],
  }, {
    movieId: 'TEST-010',
    safePublicSource,
    safeVideoAnalysis: {duration_seconds: 600, sample_windows: 8, average_confidence: 0.9, observations: []},
  });

  const projection = publicationProjectionForEvidence({
    result: videoResult,
    movieId: 'TEST-010',
    safePublicSource,
    safeVideoAnalysis: {
      duration_seconds: 600,
      sample_windows: 8,
      average_confidence: 0.9,
      observations: [{i: 0}, {i: 1}],
    },
  });
  const publicText = JSON.stringify(projection.result);
  assert.equal(projection.downgraded, true);
  assert.equal(projection.publishVideoEvidence, false);
  assert.equal(projection.safeVideoAnalysis.sample_windows, 0);
  assert.equal(projection.result.sections.length, 1);
  assert.ok(projection.result.evidence.every(({basis, observation_refs: refs}) => basis === 'public_source' && refs.length === 0));
  for (const leaked of ['鏡頭先拉近', '快速剪輯', '反應更強', '實際鏡位']) assert.doesNotMatch(publicText, new RegExp(leaked, 'u'));
  assert.match(publicText, /沒有足夠的分散影片引用/u);
  assert.match(publicText, /來源企劃/u);
});

test('three distinct video citations preserve the video-backed result', () => {
  const result = {evidence: [{basis: 'video_sample', observation_refs: [0, 2, 4]}], sections: [{heading: '觀察', body: '有足夠引用。'}]};
  const safeVideoAnalysis = {
    duration_seconds: 600,
    sample_windows: 8,
    average_confidence: 0.9,
    observations: [{i: 0}, {i: 2}, {i: 4}],
  };
  const projection = publicationProjectionForEvidence({
    result, movieId: 'TEST-011', safePublicSource: {safe_title_signals: []}, safeVideoAnalysis,
  });
  assert.equal(projection.downgraded, false);
  assert.equal(projection.publishVideoEvidence, true);
  assert.equal(projection.result, result);
  assert.equal(projection.safeVideoAnalysis, safeVideoAnalysis);
});

test('invented, out-of-range, or non-video observation refs cannot preserve video prose', () => {
  const safePublicSource = {
    core_source_concept: '來源企劃',
    safe_title_signals: [{type: 'theme', value: '來源企劃', source_field: 'title'}],
  };
  const safeVideoAnalysis = {
    duration_seconds: 120,
    sample_windows: 2,
    average_confidence: 0.8,
    observations: [{i: 0}, {i: 1}],
  };
  for (const evidence of [
    [{basis: 'video_sample', observation_refs: [97, 98, 99]}],
    [{basis: 'video_sample', observation_refs: [0, 1, 99]}],
    [{basis: 'public_source', observation_refs: [0, 1, 2]}],
  ]) {
    const result = {evidence, short_review: '未受支持的影片觀察', sections: [{heading: '觀察', body: '未受支持的影片觀察'}]};
    const projection = publicationProjectionForEvidence({
      result, movieId: 'TEST-012', safePublicSource, safeVideoAnalysis,
    });
    assert.equal(projection.downgraded, true);
    assert.equal(projection.publishVideoEvidence, false);
    assert.equal(projection.safeVideoAnalysis.sample_windows, 0);
    assert.doesNotMatch(JSON.stringify(projection.result), /未受支持的影片觀察/u);
  }
});

test('source-only repair always replaces stale video prose even when old refs look valid', () => {
  const result = {
    evidence: [{basis: 'video_sample', observation_refs: [0, 1, 2]}],
    short_review: '舊影片正文仍描述鏡位與收音。',
    decision_guide: {thesis: '舊影片結論。'},
    sections: [{heading: '舊觀察', body: '舊影片正文仍描述鏡位與收音。'}],
  };
  const projection = publicationProjectionForEvidence({
    result,
    movieId: 'TEST-013',
    safePublicSource: {
      core_source_concept: '來源企劃',
      safe_title_signals: [{type: 'theme', value: '來源企劃', source_field: 'title'}],
    },
    safeVideoAnalysis: {observations: [{i: 0}, {i: 1}, {i: 2}], sample_windows: 3},
    sourceOnly: true,
  });
  const publicText = JSON.stringify(projection.result);
  assert.equal(projection.downgraded, true);
  assert.equal(projection.publishVideoEvidence, false);
  assert.equal(projection.safeVideoAnalysis.sample_windows, 0);
  assert.doesNotMatch(publicText, /舊影片/u);
  assert.ok(projection.result.evidence.every(({basis, observation_refs: refs}) => basis === 'public_source' && refs.length === 0));
});

test('an empty provider result becomes a complete source-only publication after a content filter', () => {
  const safePublicSource = {
    core_source_concept: '可追溯來源企劃',
    safe_title_signals: [{type: 'source_topic', value: '可追溯來源企劃', source_field: 'safe_signals'}],
    source_url: 'https://cc18.tv/player.php?uuid=test',
  };
  const safeVideoAnalysis = {duration_seconds: null, sample_windows: 0, average_confidence: null, observations: []};
  const normalized = normalizeEditorialResult({}, {movieId: 'FILTER-001', safePublicSource, safeVideoAnalysis});
  const projection = publicationProjectionForEvidence({
    result: normalized,
    movieId: 'FILTER-001',
    safePublicSource,
    safeVideoAnalysis,
    sourceOnly: true,
  });
  assert.equal(projection.publishVideoEvidence, false);
  assert.equal(projection.downgraded, true);
  assert.match(projection.result.short_review, /可追溯來源企劃/u);
  assert.equal(projection.result.sections.length, 1);
  assert.deepEqual(projection.result.editorial_tag_ids, []);
  assert.ok(projection.result.evidence.every(({basis}) => basis === 'public_source'));
});
