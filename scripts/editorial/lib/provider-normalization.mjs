const clip = (value, maximum) => String(value ?? '').trim().slice(0, maximum);
const firstText = (...values) => values.find((value) => typeof value === 'string' && value.trim()) ?? '';

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
  const evidence = (safePublicSource.safe_title_signals ?? []).map((item) => ({
    basis: 'public_source',
    signal: clip(`${item.type}：${item.value}`, 300),
    supports: clip(`這項可追溯來源訊號支持文章以「${item.value}」作為選片辨識與標題依據。`, 240),
    observation_refs: [],
  }));
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
  let sections = raw.sections ?? [];
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
    .map(({heading, body, content}) => ({heading: clip(heading, 50), body: clip(body ?? content, 700)}))
    .filter(({heading, body}) => heading && body)
  if (normalized.length > 7) {
    normalized[1].body = clip(`${normalized[0].body}\n\n${normalized[1].body}`, 700);
    normalized.shift();
  }
  const seenSentences = new Set();
  for (const section of normalized) {
    section.body = section.body.split(/(?<=[。！？!?])\s*/).filter((sentence) => {
      const key = sentence.replace(/[\s。！？!?]/g, '');
      if (key.length < 16) return true;
      if (seenSentences.has(key)) return false;
      seenSentences.add(key);
      return true;
    }).join('');
  }
  return normalized.filter(({body}) => body.trim()).slice(0, 7);
}

function normalizedDecisionGuide(rawGuide, raw, brief, sourceSignals, angleCandidates) {
  const guide = rawGuide && typeof rawGuide === 'object' ? rawGuide : {};
  const nested = brief.decision_guide && typeof brief.decision_guide === 'object' ? brief.decision_guide : {};
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
  const thesis = firstText(guide.thesis, guide.one_sentence_verdict, nested.editor_pick_reason, raw.selected_thesis, brief.positioning, brief.angle, raw.editorial_angle, angleCandidates[0]);
  if (questions.length < 3) questions = [
    `這部作品的主要企劃切角是什麼？${thesis}`,
    `哪些觀眾較適合？${audienceFor[0] ?? '偏好角色互動與企劃推進的觀眾'}`,
    `有哪些觀看取捨？${audienceNotFor[0] ?? '偏好完全寫實紀錄者可能未必適合'}`,
  ];
  return {
    thesis: clip(thesis, 260),
    story_density: guide.story_density ?? 'unknown',
    pace: guide.pace ?? 'unknown',
    presentation: (guide.presentation ?? sourceSignals.map(({value}) => value)).map((value) => clip(value, 40)).filter(Boolean).slice(0, 4),
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
    if (!last.body.includes(review.conclusion.trim())) last.body = clip(`${last.body}\n\n${review.conclusion}`, 700);
  }

  const highlights = brief.what_to_highlight ?? [];
  const angleCandidates = [...(raw.angle_candidates ?? highlights.slice(0, 3))];
  while (angleCandidates.length < 3) {
    const signal = sourceSignals[angleCandidates.length % sourceSignals.length]?.value ?? movieId;
    angleCandidates.push(`${signal}的企劃呈現與觀看取向`);
  }

  const decisionGuide = normalizedDecisionGuide(raw.decision_guide ?? raw.decisionGuide ?? raw.search_content, raw, brief, sourceSignals, angleCandidates);
  if (sections.length && (!/適合|偏好|推薦/.test(sections.at(-1).body) || !/未必|不適合|取捨/.test(sections.at(-1).body))) {
    sections.at(-1).body = clip(`${sections.at(-1).body}\n\n適合：${decisionGuide.audience_for.join('；')}。未必適合：${decisionGuide.audience_not_for.join('；')}。這也是選片時最需要接受的取捨。`, 700);
  }
  return {
    ...raw,
    angle_candidates: angleCandidates.slice(0, 3).map((value) => clip(value, 180)),
    selected_thesis: clip(firstText(raw.selected_thesis, raw.decision_guide?.thesis, brief.positioning, brief.angle, raw.editorial_angle, angleCandidates[0]), 240),
    title_signals: titleSignals.slice(0, 4),
    title: clip(firstText(raw.title, raw.review_title, raw.reviewTitle, review.title, review.review_title, brief.title), 90),
    seo_title: clip(firstText(raw.seo_title, raw.seoTitle, review.seo_title, review.seoTitle, brief.seo_title), 100),
    social_title: clip(firstText(raw.social_title, raw.socialTitle, review.social_title, review.socialTitle, brief.social_title), 90),
    short_review: clip(firstText(raw.short_review, review.intro, brief.positioning, raw.editorial_angle), 240),
    editorial_angle: clip(firstText(raw.editorial_angle, brief.angle, brief.positioning, raw.decision_guide?.thesis, angleCandidates[0]), 300),
    editorial_tag_ids: raw.editorial_tag_ids?.length ? raw.editorial_tag_ids : (raw.canonical_tag_ids?.length ? raw.canonical_tag_ids : derivedEditorialTags(safeVideoAnalysis)),
    evidence: raw.evidence?.length ? raw.evidence : (safeVideoAnalysis.observations?.length ? derivedEvidence(safeVideoAnalysis) : derivedSourceEvidence(safePublicSource)),
    creative_reconstruction_notes: raw.creative_reconstruction_notes ?? raw.creativeNotes ?? [
      '正文允許依核心題材補寫敘事銜接與人物動機',
      '創作性內容只屬影評正文，不作為來源或影片證據',
    ],
    unsupported_claims_excluded: raw.unsupported_claims_excluded ?? brief.risk_notes ?? [
      '創作內容不改動番號、演員、日期、系列、來源連結或 Registry',
    ],
    decision_guide: decisionGuide,
    sections,
  };
}
