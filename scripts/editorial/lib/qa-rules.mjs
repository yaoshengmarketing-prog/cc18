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
  return issues;
}
