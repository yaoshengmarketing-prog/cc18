const genericSignals = new Set(['高畫質', 'hd', '720p', '4k', '獨家配信']);
const normalized = (value) => String(value ?? '').normalize('NFKC').trim().toLowerCase();

export function sourceOnlyGroundingIssues({titleSignals = [], actresses = []}) {
  const issues = [];
  const identities = new Set(actresses.map(normalized));
  const specificConcepts = titleSignals.map(normalized).filter((value) => value && !identities.has(value) && !genericSignals.has(value));
  if (!specificConcepts.length) issues.push('missing_source_specific_title_concept');
  return issues;
}

const genericArcs = ['被引導到主動', '從拘謹到投入', '節奏逐漸升高', '反差魅力', '主導權轉移', '距離逐步拉近'];
const technicalTerms = new Set(['hd', '720p', 'fhd', '全高清 (fhd)', '4k', '高畫質', '獨家限定', '獨家配信', '配信専用']);
const agencyShiftThesis = (value) => /被(?:引導|安排|帶著走)|接受引導/.test(value) && /主導|掌握|接管/.test(value);
const reviewSentences = (value) => String(value ?? '').split(/[。！？!?]\s*/)
  .map((sentence) => sentence.replace(/^[\s#*「」『』]+|[\s#*「」『』]+$/g, '').replace(/\s+/g, ''))
  .filter((sentence) => sentence.length >= 18);

const productionMetaPattern = /(?:\bAI\b|人工智慧|語言模型|模型生成|自動生成|提示詞|prompt|內部規則|內容管線|pipeline|source[-_ ]?only|\bQA\b|stable\s*ID|Source\s*Record|Movie\s*Master|Search\s*Content|\bD1\b)/i;
export const hasReaderFacingProductionMeta = (value) => productionMetaPattern.test(String(value ?? ''));
const formulaicPivotPatterns = [
  /(?:真正(?:的)?|主要)?(?:重點|價值|差異|看點|關鍵).{0,18}(?:不在於|不在|不是).{0,42}(?:而在於|而在|而是)/g,
  /(?:比較|最)?聰明的地方(?:是|在於)/g,
  /(?:這(?:並)?|不只)?不是.{0,36}而是/g,
];
const formulaicHeadingPattern = /^#{1,6}\s+.*(?:不在(?:於)?.{0,42}而在(?:於)?|不是.{0,42}而是)/m;
const abstractTermLimits = new Map([
  ['節奏', 8], ['層次', 5], ['推進', 5], ['轉變', 5], ['核心', 9], ['觀看邏輯', 2],
]);
const paragraphRefs = (body, matches) => String(body ?? '')
  .split(/\r?\n\s*\r?\n/)
  .map((text, index) => ({text: text.trim(), paragraph: index + 1}))
  .filter(({text}) => text && matches(text))
  .map(({text, paragraph}) => ({paragraph, excerpt: text.replace(/\s+/g, ' ').slice(0, 140)}));
const matchesPattern = (text, pattern) => new RegExp(pattern.source, pattern.flags.replaceAll('g', '')).test(text);

const finding = (code, scope, detail = {}) => ({code, scope, ...detail});

export function editorialContentAssessment({body = '', titles = [], titleSignals = [], topicElements = {}, coreSourceConcept = '', localizedTitleVersion = false}) {
  const blockingIssues = [];
  const repairIssues = [];
  const notes = [];
  const findings = [];
  const note = (code, detail) => {
    notes.push(code);
    findings.push(finding(code, 'PASS_WITH_NOTES', detail));
  };

  if (hasReaderFacingProductionMeta(body)) note('reader_facing_production_meta', {
    reason: 'CONTENT_QUALITY_WARNING',
    locations: paragraphRefs(body, (text) => productionMetaPattern.test(text)),
  });
  const formulaicPivots = formulaicPivotPatterns.reduce((count, pattern) => count + (body.match(pattern)?.length ?? 0), 0);
  const formulaicLocations = paragraphRefs(body, (text) => formulaicPivotPatterns.some((pattern) => matchesPattern(text, pattern)));
  const formulaicHeadingLocations = paragraphRefs(body, (text) => formulaicHeadingPattern.test(text));
  const paragraphCount = paragraphRefs(body, () => true).length;
  const formulaicParagraphs = new Set([...formulaicLocations, ...formulaicHeadingLocations].map(({paragraph}) => paragraph));
  const broadFormulaicVoice = paragraphCount >= 6 && formulaicParagraphs.size / paragraphCount > 1 / 3;
  if (broadFormulaicVoice) {
    note('broad_formulaic_voice', {
      reason: 'STYLE_WARNING',
      affected_paragraphs: formulaicParagraphs.size,
      paragraph_count: paragraphCount,
      locations: [...formulaicLocations, ...formulaicHeadingLocations]
        .filter((item, index, values) => values.findIndex(({paragraph}) => paragraph === item.paragraph) === index),
    });
  } else {
    if (formulaicHeadingLocations.length) note('formulaic_heading_voice', {matches: formulaicHeadingLocations.length, locations: formulaicHeadingLocations});
    if (formulaicPivots >= 2) note('formulaic_machine_voice', {matches: formulaicPivots, locations: formulaicLocations});
    else if (formulaicPivots === 1) note('formulaic_pivot_observed', {matches: formulaicPivots, locations: formulaicLocations});
  }
  const excessiveAbstractTerms = [...abstractTermLimits]
    .map(([term, limit]) => ({term, count: body.split(term).length - 1, limit}))
    .filter(({count, limit}) => count > limit);
  if (excessiveAbstractTerms.length) note('abstract_editorial_vocabulary_overuse', {
    terms: excessiveAbstractTerms,
    locations: paragraphRefs(body, (text) => excessiveAbstractTerms.some(({term}) => text.includes(term))),
  });
  const sourceTerms = [...new Set(Object.values(topicElements).flat().map((value) => String(value).trim()).filter(Boolean))];
  const meaningfulTerms = sourceTerms.filter((value) => !technicalTerms.has(normalized(value)));
  const requiredBodyTerms = Math.min(2, meaningfulTerms.length);
  if (!localizedTitleVersion && meaningfulTerms.filter((term) => body.includes(term)).length < requiredBodyTerms) note('body_lacks_source_adult_vocabulary', {reason: 'COVERAGE_WARNING'});
  const hasSourceAdultSignal = titleSignals.some((signal) => meaningfulTerms.includes(signal))
    || (coreSourceConcept && titleSignals.includes(coreSourceConcept));
  if (meaningfulTerms.length && !hasSourceAdultSignal) note('title_lacks_primary_source_adult_topic', {reason: 'COVERAGE_WARNING'});
  if (coreSourceConcept) {
    if (!titles.some((title) => title.includes(coreSourceConcept))) note('title_lacks_source_core_concept', {reason: 'COVERAGE_WARNING'});
    if (!localizedTitleVersion && body.split(coreSourceConcept).length - 1 < 2) note('source_core_concept_not_developed', {reason: 'COVERAGE_WARNING'});
  }
  const repeatedGenericArcs = genericArcs
    .map((phrase) => ({phrase, count: body.split(phrase).length - 1}))
    .filter(({count}) => count > 1);
  if (repeatedGenericArcs.length) note('overused_generic_editorial_arc', {
    phrases: repeatedGenericArcs,
    locations: paragraphRefs(body, (text) => repeatedGenericArcs.some(({phrase}) => text.includes(phrase))),
  });
  // 「有沒有」常用於段落提問或選片問句，不等於作者迴避判斷。
  // 只計算真正把判斷留在假設狀態的措辭，避免把正常的評論結構誤判為含糊。
  const conditionalReviewPhrases = body.match(/若(?:要)?成立|有機會/g) ?? [];
  const conditionalLocations = paragraphRefs(body, (text) => /若(?:要)?成立|有機會/.test(text));
  if (conditionalReviewPhrases.length >= 3) note('overused_conditional_review_voice', {matches: conditionalReviewPhrases.length, locations: conditionalLocations});
  else if (conditionalReviewPhrases.length > 0) note('conditional_review_voice_observed', {matches: conditionalReviewPhrases.length, locations: conditionalLocations});
  return {blockingIssues, repairIssues, notes, findings};
}

// Backward-compatible aggregate for callers that only need a flat list.
export function editorialContentIssues(input) {
  const assessment = editorialContentAssessment(input);
  return [...assessment.blockingIssues, ...assessment.repairIssues, ...assessment.notes];
}

export function sitewideOriginalityIssues({body = '', selectedThesis = '', editorialAngle = '', recentReviews = []}) {
  const issues = [];
  const thesis = `${selectedThesis}\n${editorialAngle}`;
  if (agencyShiftThesis(thesis) && recentReviews.some((review) => agencyShiftThesis(`${review.selectedThesis ?? ''}\n${review.editorialAngle ?? ''}`))) {
    issues.push('reused_generic_thesis_family');
  }
  const currentSentences = new Set(reviewSentences(body));
  const reusedSentence = recentReviews.some((review) => reviewSentences(review.body).some((sentence) => currentSentences.has(sentence)));
  if (reusedSentence) issues.push('sitewide_reused_sentences');
  return issues;
}

export function sitewideOriginalityAssessment(input) {
  const issues = sitewideOriginalityIssues(input);
  const blockingIssues = [];
  const repairIssues = [];
  return {
    blockingIssues,
    repairIssues,
    notes: issues,
    findings: [
      ...issues.map((code) => finding(code, 'PASS_WITH_NOTES', {reason: 'SITEWIDE_ORIGINALITY_WARNING'})),
    ],
  };
}
