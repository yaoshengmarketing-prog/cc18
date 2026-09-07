import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
// These excerpts describe source-provided context, not observed footage.
const contextPattern = /企劃|訪談|紀錄|拍攝|課程|講師|教練|瑜伽|旅行|旅館|溫泉|同事|夫妻|結婚|職場|公司|辦公|店員|店長|醫生|護士|教師|音樂|舞蹈|攝影|出道|移籍|再會|重逢|インタビュー|ドキュメンタリー|撮影|企画|講師|旅行|温泉|同僚|夫婦|会社|ヨガ|デビュー/u;
const graphicPattern = /口交|顏射|亂交|性交|性愛|性器|性行為|陰道|陰莖|肛門|精液|射精|內射|勃起|乳交|乳頭|高潮|巨乳|美乳|胸部|手交|自慰|插入|抽插|肉棒|雞巴|小穴|フェラ|中出し|射精|セックス|膣|ペニス|アナル|\bsex\b|oral|anal|facial|ejaculat|orgasm|penetrat/iu;
export const sourceDescriptionHash = (source) => createHash('sha256').update(String(source.description ?? '')).digest('hex');
export const sourceSentences = (source) => [...String(source.description ?? '').matchAll(/[^。！？!?\r\n]+[。！？!?]?/gu)]
  .map(match => ({text: match[0].trim(), source_field: 'description', source_start: match.index + match[0].indexOf(match[0].trim())}))
  .filter(item => item.text);
export function validateContextSelection(source, selection) {
  if (selection?.movie_id !== source.id || selection?.description_sha256 !== sourceDescriptionHash(source)) return null;
  const sentences = sourceSentences(source);
  if (!Array.isArray(selection.sentence_indices)) return null;
  const indices = [...new Set(selection.sentence_indices)];
  if (indices.some(i => !Number.isInteger(i) || i < 0 || i >= sentences.length)) return null;
  return indices.sort((a, b) => a - b).map(i => sentences[i])
    .filter(({text}) => !graphicPattern.test(text) && !/跳蛋|肉穴|幹到|股間|性教育支配/u.test(text));
}
function cachedSelection(source) {
  if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(source.id ?? '')) return null;
  try {
    return validateContextSelection(source, JSON.parse(readFileSync(new URL(`../../../data/source-context/${source.id}.json`, import.meta.url), 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export function buildSourceContext(source, {selection} = {}) {
  const description = typeof source.description === 'string' ? source.description : '';
  const excerpts = [];
  const counts = {no_context: 0, graphic: 0, too_long: 0, duplicate: 0, budget: 0};
  let characters = 0;
  const seen = new Set();
  const semantic = selection === undefined ? cachedSelection(source) : validateContextSelection(source, selection);
  const semanticStarts = new Set((semantic ?? []).map(item => item.source_start));
  for (const match of description.matchAll(/[^。！？!?\r\n]+[。！？!?]?/gu)) {
    const text = match[0].trim();
    if (!text) continue;
    // Retain complete sentences; never splice away negations or explicit clauses.
    if (graphicPattern.test(text)) { counts.graphic++; continue; }
    if (!contextPattern.test(text) && !semanticStarts.has(match.index + match[0].indexOf(text))) { counts.no_context++; continue; }
    if (text.length > 600) { counts.too_long++; continue; }
    if (seen.has(text)) { counts.duplicate++; continue; }
    if (characters + text.length > 2400) { counts.budget++; continue; }
    seen.add(text);
    characters += text.length;
    excerpts.push({text, source_field: 'description', source_start: match.index + match[0].indexOf(text)});
  }
  return {excerpts, audit: {semantic_selection_available: semantic !== null, description_present: Boolean(description.trim()),
    description_characters: description.length, transmitted_context_characters: characters,
    transmitted_context_sentences: excerpts.length, omitted_sentences: counts}};
}

export function auditWriterSource({source, publicSource, videoAnalysis}) {
  const {audit} = buildSourceContext(source);
  const observations = videoAnalysis?.observations?.length ?? 0;
  const transmitted = publicSource.source_context?.length ?? 0;
  return {...audit, transmitted_context_sentences: transmitted,
    transmitted_context_characters: (publicSource.source_context ?? []).reduce((sum, item) => sum + String(item.text ?? '').length, 0),
    video_observations: observations,
    source_concepts: publicSource.creative_seed_brief?.source_concepts?.length ?? 0,
    context_status: observations > 0 ? 'video_context_available'
      : transmitted > 0 ? 'source_context_available'
      : audit.description_present ? 'description_present_but_no_context_transmitted'
      : 'source_description_missing',
    quality_assured: false};
}
