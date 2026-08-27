const genericSignals = new Set(['高畫質', 'hd', '720p', '4k', '獨家配信']);
const normalized = (value) => String(value ?? '').normalize('NFKC').trim().toLowerCase();

export function sourceOnlyGroundingIssues({titleSignals = [], actresses = []}) {
  const issues = [];
  const identities = new Set(actresses.map(normalized));
  const specificConcepts = titleSignals.map(normalized).filter((value) => value && !identities.has(value) && !genericSignals.has(value));
  if (!specificConcepts.length) issues.push('missing_source_specific_title_concept');
  return issues;
}
