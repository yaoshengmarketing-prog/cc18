const clip = (value, maximum) => String(value ?? '').trim().slice(0, maximum);
const firstText = (...values) => values.find((value) => typeof value === 'string' && value.trim()) ?? '';

const internalEditorialTerms = new Map([
  ['creative_seed_brief', '企劃構想資料'],
  ['core_source_concept', '主要來源線索'],
  ['source_concepts', '來源名稱線索'],
  ['topic_elements', '來源題材資料'],
  ['role_dynamic', '角色互動'],
  ['central_tension', '主要衝突'],
  ['safe_title_signals', '作品名稱線索'],
  ['public_source', '公開來源資料'],
  ['video_analysis', '影片分析資料'],
  ['premise', '故事前提'],
  ['relationship', '人物關係'],
  ['setting', '場景設定'],
  ['presentation', '呈現形式'],
]);
const internalEditorialTermPattern = new RegExp(`\\b(?:${[...internalEditorialTerms.keys()].join('|')})\\b`, 'gu');

// Provider field names belong in the working record, never in reader-facing copy.
export function sanitizePublicEditorialResult(result) {
  const clean = (value) => typeof value === 'string'
    ? value.replace(internalEditorialTermPattern, (term) => internalEditorialTerms.get(term))
    : value;
  const cleanList = (values) => Array.isArray(values) ? values.map(clean) : values;
  const guide = result.decision_guide ?? {};
  return {
    ...result,
    angle_candidates: cleanList(result.angle_candidates),
    selected_thesis: clean(result.selected_thesis),
    title: clean(result.title),
    seo_title: clean(result.seo_title),
    social_title: clean(result.social_title),
    short_review: clean(result.short_review),
    editorial_angle: clean(result.editorial_angle),
    decision_guide: {
      ...guide,
      thesis: clean(guide.thesis),
      presentation: cleanList(guide.presentation),
      audience_for: cleanList(guide.audience_for),
      audience_not_for: cleanList(guide.audience_not_for),
      questions_answered: cleanList(guide.questions_answered),
    },
    sections: (result.sections ?? []).map((section) => ({heading: clean(section.heading), body: clean(section.body)})),
  };
}

export function parseFirstJsonObject(value) {
  const source = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let output = '';
  let started = false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const char of source) {
    if (!started) {
      if (char !== '{') continue;
      started = true;
      depth = 1;
      output = '{';
      continue;
    }
    if (inString && !escaped && (char === '\n' || char === '\r')) {
      output += '\\n';
      continue;
    }
    output += char;
    if (escaped) escaped = false;
    else if (char === '\\' && inString) escaped = true;
    else if (char === '"') inString = !inString;
    else if (!inString && char === '{') depth += 1;
    else if (!inString && char === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(output);
    }
  }
  throw new Error('Editorial provider returned no complete JSON object');
}

function derivedEditorialTags(safeVideoAnalysis) {
  const observations = safeVideoAnalysis.observations ?? [];
  const tags = ['story'];
  if (new Set(observations.map(({tone}) => tone)).size > 1) tags.push('contrast-charm');
  return tags.slice(0, 6);
}

function derivedEvidence(safeVideoAnalysis) {
  const observations = safeVideoAnalysis.observations ?? [];
  if (!observations.length) return [];
  const picks = [...new Set([0, Math.floor(observations.length * 0.25), Math.floor(observations.length * 0.5), Math.floor(observations.length * 0.75), observations.length - 1])];
  return picks.map((position) => {
    const item = observations[position];
    return {
      basis: 'video_sample',
      signal: clip(`${item.setting}、${item.tone}、${item.camera.join('、')}`, 300),
      supports: '支持文章對場景配置、互動氣氛與攝影距離的概括',
      observation_refs: [item.i],
    };
  });
}

function derivedSourceEvidence(safePublicSource) {
  const evidence = (safePublicSource.source_context ?? []).map(({text}) => ({
    basis: 'public_source', signal: clip(text, 300),
    supports: '支持對公開企劃設定的評論，不代表觀看過影片。', observation_refs: [],
  }));
  evidence.push(...(safePublicSource.safe_title_signals ?? []).map((item) => ({
    basis: 'public_source',
    signal: clip(`${item.type}：${item.value}`, 300),
    supports: clip(`這項可追溯來源訊號支持文章以「${item.value}」作為選片辨識與標題依據。`, 240),
    observation_refs: [],
  })));
  for (const theme of safePublicSource.creative_seed_brief?.themes ?? []) {
    evidence.push({
      basis: 'creative_reconstruction',
      signal: clip(`本機抽象創作主題：${theme}`, 300),
      supports: clip(`這項主題只支持影評的創作切角與段落組織，不宣稱為逐幕影片事實。`, 240),
      observation_refs: [],
    });
  }
  for (const seed of safePublicSource.creative_seed_brief?.creative_seeds ?? []) {
    if (evidence.length >= 5) break;
    evidence.push({
      basis: 'creative_reconstruction',
      signal: clip(`創作結構建議：${seed}`, 300),
      supports: clip('這項建議用來建立文章的前後對照與閱讀節奏，不回寫作品資料或影片證據。', 240),
      observation_refs: [],
    });
  }
  return evidence.slice(0, 10);
}

function normalizedSections(raw, review) {
  const sectionArray = (value) => Array.isArray(value) ? value : [];
  let sections = [
    sectionArray(raw.sections),
    sectionArray(raw.review_sections),
    sectionArray(raw.reviewSections),
  ].reduce((longest, candidate) => candidate.length > longest.length ? candidate : longest, []);
  if (Array.isArray(review.sections)) {
    const wrapped = [
      firstText(review.intro, review.opening) ? {heading: '這部作品先賣什麼', body: firstText(review.intro, review.opening)} : null,
      ...review.sections,
      firstText(review.conclusion, review.closing) ? {heading: '總評與選片結論', body: firstText(review.conclusion, review.closing)} : null,
    ].filter(Boolean);
    if (wrapped.length > sections.length) sections = wrapped;
  }
  if (review && typeof review === 'object') {
    const labels = {
      opening: '這部作品先賣什麼',
      story_and_structure: '企劃如何建立前後差異',
      performer_dynamics: '角色互動為何成立',
      presentation_and_style: '呈現方式與觀看節奏',
      why_it_works: '最值得注意的核心看點',
      selection_advice: '適合誰，又有哪些取捨',
      closing: '總評與選片結論',
    };
    const headingFor = (key) => {
      if (/intro|opening|setup/.test(key)) return '企劃開場與作品定位';
      if (/character|performer|dynamic/.test(key)) return '角色互動如何建立';
      if (/progress|structure/.test(key)) return '前後段落如何推進';
      if (/scene/.test(key)) return '場景與段落設計';
      if (/presentation|style/.test(key)) return '呈現方式與觀看節奏';
      if (/why|work|highlight/.test(key)) return '核心看點為何成立';
      if (/advice|conclusion|closing/.test(key)) return '總評、適合觀眾與取捨';
      return '作品切角補充';
    };
    const reviewSections = Object.entries(review)
      .map(([key, value]) => {
        if (typeof value === 'string' && value.trim()) return {heading: labels[key] ?? headingFor(key), body: value};
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const body = value.body ?? value.content;
          if (typeof body === 'string' && body.trim()) return {heading: value.heading ?? labels[key] ?? headingFor(key), body};
        }
        return null;
      })
      .filter(Boolean);
    if (reviewSections.length > sections.length) sections = reviewSections;
  }
  const normalized = sections
    .map((section, index) => {
      if (typeof section === 'string') {
        return {heading: `作品重點 ${index + 1}`, body: section.trim()};
      }
      const heading = section?.heading ?? section?.title ?? section?.section_heading ?? section?.name;
      const body = section?.body ?? section?.content ?? section?.text ?? section?.analysis ?? section?.paragraph;
      return {heading: clip(heading, 50), body: typeof body === 'string' ? body.trim() : ''};
    })
    .filter(({heading, body}) => heading && body)
  return normalized;
}

function normalizedDecisionGuide(rawGuide, raw, brief, sourceSignals, angleCandidates) {
  const guide = rawGuide && typeof rawGuide === 'object' ? rawGuide : {};
  const nested = brief.decision_guide && typeof brief.decision_guide === 'object' ? brief.decision_guide : {};
  const presentation = Array.isArray(guide.presentation) ? guide.presentation
    : typeof guide.presentation === 'string' && guide.presentation.trim() ? [guide.presentation]
      : sourceSignals.map(({value}) => value);
  const arrayOr = (...values) => values.find((value) => Array.isArray(value) && value.length) ?? [];
  const comparisons = Array.isArray(guide.compare_by_need) ? guide.compare_by_need : [];
  let questions = comparisons.map((item) => typeof item === 'string'
    ? item
    : `${item?.need ?? '選片需求'}：${item?.advice ?? ''}`);
  const audienceFor = [...arrayOr(guide.audience_for, guide.best_for, nested.pick_if, brief.audience)];
  const audienceNotFor = [...arrayOr(guide.audience_not_for, guide.maybe_skip_if, nested.skip_if, brief.risks_or_limits, brief.risk_notes)];
  for (const fallback of ['偏好角色互動、演員魅力與企劃推進的觀眾', '願意接受鋪陳並觀察前後節奏差異的觀眾']) {
    if (audienceFor.length >= 2) break;
    if (!audienceFor.includes(fallback)) audienceFor.push(fallback);
  }
  for (const fallback of ['只想看高密度快速節奏、不重視角色鋪陳的觀眾', '偏好強情節衝突、不喜歡展示型企劃的觀眾']) {
    if (audienceNotFor.length >= 2) break;
    if (!audienceNotFor.includes(fallback)) audienceNotFor.push(fallback);
  }
  const rawThesis = firstText(guide.thesis, guide.one_sentence_verdict, nested.editor_pick_reason, raw.selected_thesis, brief.positioning, brief.angle, raw.editorial_angle, angleCandidates[0]);
  const thesisSeed = rawThesis || angleCandidates[0] || sourceSignals[0]?.value || '本作的核心企劃';
  const thesis = thesisSeed.length >= 20
    ? thesisSeed
    : `${thesisSeed}，這是本作最直接且可供比較的選片判斷。`;
  if (questions.length < 3) questions = [
    `這部作品的主要企劃切角是什麼？${thesis}`,
    `哪些觀眾較適合？${audienceFor[0] ?? '偏好角色互動與企劃推進的觀眾'}`,
    `有哪些觀看取捨？${audienceNotFor[0] ?? '偏好完全寫實紀錄者可能未必適合'}`,
  ];
  return {
    thesis: clip(thesis, 260),
    story_density: guide.story_density ?? 'unknown',
    pace: guide.pace ?? 'unknown',
    presentation: presentation.map((value) => clip(value, 40)).filter(Boolean).slice(0, 4),
    audience_for: audienceFor.map((value) => clip(value, 120)).filter(Boolean).slice(0, 4),
    audience_not_for: audienceNotFor.map((value) => clip(value, 120)).filter(Boolean).slice(0, 4),
    questions_answered: arrayOr(guide.questions_answered, questions).map((value) => clip(value, 120)).filter(Boolean).slice(0, 6),
  };
}

export function normalizeEditorialResult(raw, {movieId, safePublicSource, safeVideoAnalysis}) {
  const brief = raw.editorialBrief ?? raw.editorial_brief ?? {};
  const review = raw.review ?? raw.review_draft ?? raw.reviewDraft ?? {};
  const sourceSignals = safePublicSource.safe_title_signals;
  const rawSignals = raw.title_signals ?? raw.titleSignals ?? [];
  let titleSignals = rawSignals.map((signal) => {
    if (typeof signal === 'object' && signal?.value) return signal;
    return sourceSignals.find(({value}) => value === signal);
  }).filter(Boolean);
  if (titleSignals.length < 2) titleSignals = sourceSignals.slice(0, 4);

  const sections = normalizedSections(raw, review);
  if (review.conclusion && sections.length) {
    const last = sections.at(-1);
    if (!sections.some(({body}) => body.includes(review.conclusion.trim()))) last.body = `${last.body}\n\n${review.conclusion}`;
  }

  const highlights = brief.what_to_highlight ?? [];
  const angleCandidates = [...(raw.angle_candidates ?? highlights.slice(0, 3))];
  while (angleCandidates.length < 3) {
    const signal = sourceSignals[angleCandidates.length % sourceSignals.length]?.value ?? movieId;
    angleCandidates.push(`${signal}的企劃呈現與觀看取向`);
  }

  const decisionGuide = normalizedDecisionGuide(raw.decision_guide ?? raw.decisionGuide ?? raw.search_content, raw, brief, sourceSignals, angleCandidates);
  const fallbackSignalLabels = sourceSignals.map(({value}) => value).filter(Boolean).slice(0, 2);
  const fallbackShortReview = safePublicSource.core_source_concept
    ? `本作以「${safePublicSource.core_source_concept}」為主要來源線索；其餘資訊不足處暫不補寫。`
    : fallbackSignalLabels.length
      ? `本作可先從${fallbackSignalLabels.join('、')}等可追溯來源線索判斷是否符合偏好。`
      : `${movieId}目前僅保留可驗證的作品識別與來源資料，其他內容不足處暫不補寫。`;
  return {
    ...raw,
    angle_candidates: angleCandidates.slice(0, 3).map((value) => clip(value, 180)),
    selected_thesis: clip(firstText(raw.selected_thesis, raw.decision_guide?.thesis, brief.positioning, brief.angle, raw.editorial_angle, angleCandidates[0]), 240),
    title_signals: titleSignals.slice(0, 4),
    title: clip(firstText(raw.title, raw.review_title, raw.reviewTitle, review.title, review.review_title, brief.title), 90),
    seo_title: clip(firstText(raw.seo_title, raw.seoTitle, review.seo_title, review.seoTitle, brief.seo_title), 100),
    social_title: clip(firstText(raw.social_title, raw.socialTitle, review.social_title, review.socialTitle, brief.social_title), 90),
    short_review: clip(firstText(raw.short_review, review.intro, brief.positioning, raw.editorial_angle, fallbackShortReview), 240),
    editorial_angle: clip(firstText(raw.editorial_angle, brief.angle, brief.positioning, raw.decision_guide?.thesis, angleCandidates[0]), 300),
    editorial_tag_ids: raw.editorial_tag_ids?.length ? raw.editorial_tag_ids : (raw.canonical_tag_ids?.length ? raw.canonical_tag_ids : derivedEditorialTags(safeVideoAnalysis)),
    evidence: raw.evidence?.length ? raw.evidence : (safeVideoAnalysis.observations?.length ? derivedEvidence(safeVideoAnalysis) : derivedSourceEvidence(safePublicSource)),
    creative_reconstruction_notes: raw.creative_reconstruction_notes ?? raw.creativeNotes ?? [
      '正文只將來源記錄與編輯摘要中可追溯的設定、題材與詞彙組織為選片說明',
      '未有影片證據時，不將場景、鏡位、聲音、表演或情節寫成已觀察事實',
    ],
    unsupported_claims_excluded: raw.unsupported_claims_excluded ?? brief.risk_notes ?? [
      '創作內容不改動番號、演員、日期、系列、來源連結或 Registry',
    ],
    decision_guide: decisionGuide,
    sections,
  };
}

const emptyVideoProjection = () => ({
  duration_seconds: null,
  sample_windows: 0,
  average_confidence: null,
  observations: [],
});

export function publicationProjectionForEvidence({result, movieId, safePublicSource, safeVideoAnalysis, sourceOnly = false}) {
  const observedVideoRefs = new Set((safeVideoAnalysis.observations ?? [])
    .map(({i}) => i)
    .filter(Number.isInteger));
  const videoEvidence = (result.evidence ?? []).filter(({basis}) => ['video_sample', 'both'].includes(basis));
  const videoRefs = new Set(videoEvidence
    .flatMap(({observation_refs: refs}) => refs ?? [])
    .filter((ref) => Number.isInteger(ref) && observedVideoRefs.has(ref)));
  const hasInvalidEvidenceRefs = (result.evidence ?? []).some(({basis, observation_refs: refs = []}) => refs.some((ref) => (
    !['video_sample', 'both'].includes(basis)
    || !Number.isInteger(ref)
    || !observedVideoRefs.has(ref)
  )));
  const publishVideoEvidence = !sourceOnly && !hasInvalidEvidenceRefs && videoRefs.size >= 3;
  // Source commentary does not require video citations. Keep the author's prose;
  // factual support remains subject to editorial QA.
  const sourceCommentary = !hasInvalidEvidenceRefs && videoEvidence.length === 0
    && (result.evidence ?? []).some(({basis}) => basis === 'public_source')
    && (result.sections ?? []).some(({body}) => typeof body === 'string' && body.trim());
  if (sourceCommentary) {
    return {result, safeVideoAnalysis: emptyVideoProjection(), publishVideoEvidence: false,
      downgraded: false, distinctVideoWindows: 0};
  }
  if (publishVideoEvidence) {
    return {
      result,
      safeVideoAnalysis,
      publishVideoEvidence,
      downgraded: false,
      distinctVideoWindows: videoRefs.size,
    };
  }

  const sourceSignals = safePublicSource.safe_title_signals ?? [];
  const sourceConcept = safePublicSource.core_source_concept ?? sourceSignals[0]?.value ?? null;
  const sourceSummary = sourceConcept
    ? '來源資料可確認本作以「' + sourceConcept + '」作為主要作品線索。'
    : movieId + '目前只有可驗證的作品識別與基本來源資料。';
  const noVideoConclusion = '目前沒有足夠的分散影片引用，因此不描述鏡位、收音、表演反應、段落順序或觀看結果。';
  const sourceEvidence = derivedSourceEvidence(safePublicSource)
    .filter(({basis}) => basis === 'public_source');
  const titleSuffix = sourceConcept ? '｜' + sourceConcept : '｜作品資料';
  const fallback = normalizeEditorialResult({
    angle_candidates: [sourceSummary],
    selected_thesis: sourceSummary,
    title_signals: sourceSignals,
    title: movieId + titleSuffix,
    seo_title: movieId + ' 作品資料' + (sourceConcept ? '｜' + sourceConcept : ''),
    social_title: movieId + titleSuffix,
    short_review: sourceSummary + noVideoConclusion,
    editorial_angle: sourceSummary,
    editorial_tag_ids: [],
    evidence: sourceEvidence,
    creative_reconstruction_notes: ['公開內容只保留可追溯的來源資料整理。'],
    unsupported_claims_excluded: ['未保留缺少足夠影片引用的觀看觀察。'],
    decision_guide: {
      thesis: sourceSummary + noVideoConclusion,
      story_density: 'unknown',
      pace: 'unknown',
      presentation: sourceSignals.map(({value}) => value).filter(Boolean).slice(0, 4),
      audience_for: ['想先依來源題材與作品設定挑選的觀眾', '接受目前只提供來源資料整理的觀眾'],
      audience_not_for: ['需要影片抽樣觀察才能決定的觀眾', '需要鏡位、收音或段落變化結論的觀眾'],
      questions_answered: [
        '來源資料可確認什麼？' + sourceSummary,
        '目前能否提供影片觀察？' + noVideoConclusion,
        '如何使用本頁？可先依來源題材與作品識別資訊判斷是否符合偏好。',
      ],
    },
    sections: [{
      heading: '來源資料與選片範圍',
      body: sourceSummary + noVideoConclusion,
    }],
  }, {movieId, safePublicSource, safeVideoAnalysis: emptyVideoProjection()});
  fallback.editorial_tag_ids = [];
  fallback.evidence = sourceEvidence;

  return {
    result: fallback,
    safeVideoAnalysis: emptyVideoProjection(),
    publishVideoEvidence: false,
    downgraded: true,
    distinctVideoWindows: videoRefs.size,
  };
}
