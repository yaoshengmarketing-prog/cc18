export const selectionStart = '2026-11-29';
export const internalCopy = ['目前沒有足夠的分散影片引用', '執行環境未能開啟外部頁面'];
// v1.2 (owner, 2026-11-28 22:52): only text that directly states the character is a high/middle/elementary-school student, a little girl, or under 18. Adjectives (蘿莉, 嬌小, 幼小), 義妹, generic 學生/大學生, adult uniform or JK cosplay and 幼馴染 are not risk terms.
export const riskTerms = ['未成年', '未滿十八', '未滿18', '思春期', '青春期', '女子高生', '女子校生', '女子○生', '女子〇生', '女高中生', '高校生', '中學生', '中学生', '國中生', '小學生', '小学生', '幼女', '小女孩'];
export const autoExclusionTerms = ['女高中生', '高中生', '女子高生', '高校生', '中學生', '中学生', '國中生', '小學生', '小学生', '小女孩', '未成年', '未滿18', '未滿十八'];
const costumeOrMemory = /打扮成|打扮|扮演|角色扮演|cosplay|コスプレ|穿著.{0,8}制服|制服.{0,8}角色扮演|高中時代|高中時|當年高中|高校時代|畢業後|卒業後/iu;
const explicitNegation = /(?:沒有|並無|不含|無|不是|不再是).{0,5}(?:未滿18|未滿十八|未成年|小女孩)|(?:未滿18|未滿十八|未成年).{0,5}(?:沒有|並無|不含)/u;

// Only source title and description are passed in. Other source fields cannot affect this decision.
export function autoExclusionDecision({title = '', description = ''} = {}) {
  for (const field of [title, description]) {
    for (const sentence of String(field ?? '').split(/(?<=[。！？!?；;\n])|(?<=\.)\s+/u).map((part) => part.trim()).filter(Boolean)) {
      const terms = autoExclusionTerms.filter((term) => sentence.includes(term) && !(term === '小女孩' && sentence.includes('膽小女孩')));
      if (terms.length && !costumeOrMemory.test(sentence) && !explicitNegation.test(sentence)) return {excluded: true, terms, sentence};
    }
  }
  return {excluded: false, terms: [], sentence: null};
}

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
