export const selectionStart = '2026-11-29';
export const internalCopy = ['目前沒有足夠的分散影片引用', '執行環境未能開啟外部頁面'];
export const riskTerms = ['未成年', '未滿十八', '未滿18', '思春期', '學生', '学生', '女子高生', '女子校生', '幼馴染', '幼なじみ'];

export const chineseCount = (body) => [...body.matchAll(/[\p{Script=Han}]/gu)].length;
export const shingles = (body, size = 4) => {
  const text = body.replace(/[`#*_>\s\p{P}\p{S}]/gu, '');
  return new Set(Array.from({length: Math.max(0, text.length - size + 1)}, (_, index) => text.slice(index, index + size)));
};
export const jaccard = (a, b) => {
  let common = 0;
  for (const value of a) if (b.has(value)) common += 1;
  return a.size + b.size - common ? common / (a.size + b.size - common) : 0;
};

export function selectionIssues({body, publicCopy = body, quality, source, scoreDimensions = [], similarity = 0, approvedRisks = []}) {
  const issues = [];
  const count = chineseCount(body);
  if (count < 600) issues.push({code: 'selection_body_too_short', detail: `${count} Chinese characters`});
  if ((quality.evidence ?? []).length < 3) issues.push({code: 'selection_evidence_missing', detail: `${quality.evidence?.length ?? 0}`});
  const scores = quality.scores;
  if (!scores || typeof scores !== 'object' || scoreDimensions.some((name) => !Number.isFinite(scores[name]))) {
    issues.push({code: 'selection_scores_missing'});
  }
  if (similarity > 0.55) issues.push({code: 'selection_similarity', detail: similarity.toFixed(3)});
  const phrase = internalCopy.find((value) => publicCopy.includes(value));
  if (phrase) issues.push({code: 'selection_internal_copy', detail: phrase});
  const sourceText = [source.title, source.description, source.series, ...(source.source_tags ?? []), publicCopy].filter(Boolean).join(' ');
  const terms = riskTerms.filter((value) => sourceText.includes(value));
  if (terms.length && !terms.every((term) => approvedRisks.includes(term))) {
    issues.push({code: 'selection_risk_review_required', detail: terms.join(', ')});
  }
  return issues;
}
