const clip = (value, maximum) => String(value ?? '').trim().slice(0, maximum);

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

function derivedCanonicalTags(safeVideoAnalysis) {
  const observations = safeVideoAnalysis.observations ?? [];
  const tags = ['story'];
  if (observations.some(({camera}) => camera.includes('近距離鏡位'))) tags.push('close-perspective');
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

export function normalizeEditorialResult(raw, {movieId, safePublicSource, safeVideoAnalysis}) {
  const brief = raw.editorialBrief ?? {};
  const review = raw.review ?? {};
  const sourceSignals = safePublicSource.safe_title_signals;
  const rawSignals = raw.title_signals ?? raw.titleSignals ?? [];
  let titleSignals = rawSignals.map((signal) => {
    if (typeof signal === 'object' && signal?.value) return signal;
    return sourceSignals.find(({value}) => value === signal);
  }).filter(Boolean);
  if (titleSignals.length < 2) titleSignals = sourceSignals.slice(0, 4);

  let sections = raw.sections ?? review.sections?.map(({heading, content, body}) => ({heading, body: body ?? content})) ?? [];
  sections = sections.map(({heading, body}) => ({heading: clip(heading, 50), body: clip(body, 700)})).slice(0, 7);
  if (review.conclusion && sections.length) {
    const last = sections.at(-1);
    last.body = clip(`${last.body}\n\n${review.conclusion}`, 700);
  }

  const highlights = brief.what_to_highlight ?? [];
  const angleCandidates = [...(raw.angle_candidates ?? highlights.slice(0, 3))];
  while (angleCandidates.length < 3) {
    const signal = sourceSignals[angleCandidates.length % sourceSignals.length]?.value ?? movieId;
    angleCandidates.push(`${signal}的企劃呈現與觀看取向`);
  }

  return {
    ...raw,
    angle_candidates: angleCandidates.slice(0, 3).map((value) => clip(value, 180)),
    selected_thesis: clip(raw.selected_thesis ?? brief.positioning ?? brief.angle, 240),
    title_signals: titleSignals.slice(0, 4),
    title: clip(raw.title, 90),
    seo_title: clip(raw.seo_title ?? raw.seoTitle, 100),
    social_title: clip(raw.social_title ?? raw.socialTitle, 90),
    short_review: clip(raw.short_review ?? review.intro ?? brief.positioning, 240),
    editorial_angle: clip(raw.editorial_angle ?? brief.angle ?? brief.positioning, 300),
    canonical_tag_ids: raw.canonical_tag_ids ?? derivedCanonicalTags(safeVideoAnalysis),
    evidence: raw.evidence ?? derivedEvidence(safeVideoAnalysis),
    unsupported_claims_excluded: raw.unsupported_claims_excluded ?? brief.risk_notes ?? [
      '未提供姓名時不辨識演員', '不虛構對白或心理', '不宣稱逐幀完整觀看',
    ],
    sections,
  };
}
