const unsupportedSourceOnlyObservation = /鏡位|運鏡|收音|聲音品質|剪輯(?:節奏|品質)|身體語言|停頓長短|呼吸節奏|表情管理|畫面(?:呈現|顯示|捕捉)|片中(?:可見|可以看到)|實際看(?:到|見)/;

const genericSignals = new Set(['高畫質', 'hd', '720p', '4k', '獨家配信']);
const normalized = (value) => String(value ?? '').normalize('NFKC').trim().toLowerCase();

export function sourceOnlyGroundingIssues({body, titleSignals = [], actresses = []}) {
  const issues = [];
  if (unsupportedSourceOnlyObservation.test(body)) issues.push('unsupported_source_only_observation');
  const identities = new Set(actresses.map(normalized));
  const specificConcepts = titleSignals.map(normalized).filter((value) => value && !identities.has(value) && !genericSignals.has(value));
  if (!specificConcepts.length) issues.push('missing_source_specific_title_concept');
  return issues;
}

export {unsupportedSourceOnlyObservation};
