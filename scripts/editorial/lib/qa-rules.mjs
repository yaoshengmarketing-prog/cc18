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

export function editorialContentIssues({body = '', titles = [], titleSignals = [], topicElements = {}, coreSourceConcept = ''}) {
  const issues = [];
  const sourceTerms = [...new Set(Object.values(topicElements).flat().map((value) => String(value).trim()).filter(Boolean))];
  const meaningfulTerms = sourceTerms.filter((value) => !technicalTerms.has(normalized(value)));
  const requiredBodyTerms = Math.min(2, meaningfulTerms.length);
  if (meaningfulTerms.filter((term) => body.includes(term)).length < requiredBodyTerms) issues.push('body_lacks_source_adult_vocabulary');
  const hasSourceAdultSignal = titleSignals.some((signal) => meaningfulTerms.includes(signal))
    || (coreSourceConcept && titleSignals.includes(coreSourceConcept));
  if (meaningfulTerms.length && !hasSourceAdultSignal) issues.push('title_lacks_primary_source_adult_topic');
  if (coreSourceConcept) {
    if (!titles.some((title) => title.includes(coreSourceConcept))) issues.push('title_lacks_source_core_concept');
    if (body.split(coreSourceConcept).length - 1 < 2) issues.push('source_core_concept_not_developed');
  }
  if (genericArcs.some((phrase) => body.split(phrase).length - 1 > 1)) issues.push('overused_generic_editorial_arc');
  const conditionalReviewPhrases = body.match(/若(?:要)?成立|有沒有|有機會/g) ?? [];
  if (conditionalReviewPhrases.length >= 3) issues.push('overused_conditional_review_voice');
  return issues;
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
