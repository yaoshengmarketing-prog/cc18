import {assertLocalEndpoint} from '../../bridge/lib/local-analysis.mjs';

const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['core_source_concept', 'premise', 'relationship', 'role_dynamic', 'central_tension', 'setting', 'themes', 'creative_seeds', 'search_concepts'],
  properties: {
    core_source_concept: {type: 'string', minLength: 2, maxLength: 12},
    premise: {type: 'string', maxLength: 240},
    relationship: {type: 'string', maxLength: 120},
    role_dynamic: {type: 'string', maxLength: 160},
    central_tension: {type: 'string', maxLength: 180},
    setting: {type: 'string', maxLength: 120},
    themes: {type: 'array', minItems: 2, maxItems: 6, items: {type: 'string', maxLength: 60}},
    creative_seeds: {type: 'array', minItems: 3, maxItems: 6, items: {type: 'string', maxLength: 140}},
    search_concepts: {type: 'array', minItems: 2, maxItems: 6, items: {type: 'string', maxLength: 30}},
  },
};

const clip = (value, maximum) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum);
const technicalCoreTerms = /^(?:HD|FHD|UHD|4K|720p|1080p|全高清 \(FHD\)|独占配信|獨家限定|配信専用)$/i;
const genericCoreTerms = /^(?:色情拍攝|拍攝|企劃|作品|影片|AV女優片|成人影片)$/i;
const cleanCandidate = (value) => String(value ?? '').normalize('NFKC').trim()
  .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')
  .trim();

export function coreConceptCandidates(source) {
  const titlePhrases = String(source.title ?? '').split(/[，。！？…、：:｜|×\s]+/u)
    .map(cleanCandidate).filter((value) => value.length >= 2 && value.length <= 12);
  const values = [source.series, ...titlePhrases, ...(source.source_tags ?? [])]
    .map(cleanCandidate)
    .filter((value) => value.length >= 2 && value.length <= 12 && !technicalCoreTerms.test(value) && !genericCoreTerms.test(value));
  return [...new Set(values)];
}

export function resolveCoreSourceConcept(proposed, source) {
  const value = clip(proposed, 12);
  const traceableText = [source.title, source.series, source.description].filter(Boolean).join('\n');
  if (value.length >= 2 && traceableText.includes(value) && !genericCoreTerms.test(value)) return value;
  const exactProposedParts = String(proposed ?? '').split(/[，,、／/｜|×]+/u)
    .map(cleanCandidate)
    .filter((candidate) => candidate.length >= 2 && candidate.length <= 12 && !genericCoreTerms.test(candidate) && traceableText.includes(candidate));
  if (exactProposedParts.length) return exactProposedParts.sort((left, right) => right.length - left.length)[0];
  const candidates = coreConceptCandidates(source);
  const matches = candidates.filter((candidate) => value.includes(candidate));
  if (matches.length) return matches.sort((left, right) => right.length - left.length)[0];
  return candidates.find((candidate) => traceableText.includes(candidate)) ?? null;
}

export function normalizeLocalSourceBrief(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Local source brief returned invalid JSON');
  const list = (key, maximum, limit) => Array.isArray(value[key])
    ? value[key].map((item) => clip(item, maximum)).filter(Boolean).slice(0, limit)
    : [];
  const result = {
    core_source_concept: clip(value.core_source_concept, 12),
    premise: clip(value.premise, 240),
    relationship: clip(value.relationship, 120),
    role_dynamic: clip(value.role_dynamic, 160),
    central_tension: clip(value.central_tension, 180),
    setting: clip(value.setting, 120),
    themes: list('themes', 60, 6),
    creative_seeds: list('creative_seeds', 140, 6),
    search_concepts: list('search_concepts', 30, 6),
  };
  if (![result.core_source_concept, result.premise, result.relationship, result.role_dynamic, result.central_tension].every(Boolean)
    || result.themes.length < 2 || result.creative_seeds.length < 3 || result.search_concepts.length < 2) {
    throw new Error('Local source brief is incomplete');
  }
  return result;
}

export function createDeterministicSourceBrief(source) {
  const coreSourceConcept = resolveCoreSourceConcept('', source);
  if (!coreSourceConcept) {
    throw Object.assign(new Error(`${source.id}: no traceable source concept for cloud editorial`), {code: 'EDITORIAL_SAFE_SIGNALS_INSUFFICIENT'});
  }
  const sourceConcepts = coreConceptCandidates(source).filter((value) => {
    const text = [source.title, source.series, source.description].filter(Boolean).join('\n');
    return text.includes(value);
  }).slice(0, 6);
  while (sourceConcepts.length < 2) sourceConcepts.push(coreSourceConcept);
  return normalizeLocalSourceBrief({
    core_source_concept: coreSourceConcept,
    premise: `作品以「${coreSourceConcept}」作為企劃起點，透過分段安排呈現角色面對新規則時的變化。`,
    relationship: '主角與企劃參與者之間的互動關係',
    role_dynamic: '主角在不同階段逐步理解企劃規則，並形成可辨識的回應方式。',
    central_tension: `企劃如何讓「${coreSourceConcept}」不只停留在片名，而成為前後段落的推進邏輯。`,
    setting: '一般室內場景',
    themes: ['企劃設定', '角色變化', '互動節奏'],
    creative_seeds: [
      '以初段理解規則與後段形成回應製造對照',
      '讓每個段落回答不同的選片問題',
      '用角色心態與互動方式的變化串連全篇',
    ],
    search_concepts: sourceConcepts,
  });
}

export async function createLocalSourceBrief(source, config, fetchImplementation = fetch) {
  const endpoint = assertLocalEndpoint(config.local_analysis.endpoint);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.local_analysis.request_timeout_ms);
    try {
      const response = await fetchImplementation(new URL('/api/chat', endpoint), {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      signal: controller.signal,
      body: JSON.stringify({
        model: config.local_analysis.vision_model,
        stream: false,
        format: BRIEF_SCHEMA,
        keep_alive: '5m',
        options: {temperature: 0, num_predict: 1400},
        messages: [{
          role: 'system',
          content: '你是本機內容策劃器。讀取作品標題、公開簡介與標籤，整理成繁體中文、非露骨的創作 Brief。core_source_concept 必須逐字摘自來源標題、系列名或公開簡介，只能是 2 至 12 字的名詞短語，不得寫成句子；選最能區分本作企劃核心的詞，例如「露出慾望」「旅館同房」「人妻美容療程」。不可用演員名、番號、畫質或泛稱「劇情」取代。不要辨識未提供的人物，不要評論真人私生活。Creative seeds 可以提出可供影評編撰的情節、動機與轉折方向，但不可包含露骨描述。search_concepts 必須逐字摘自標題或公開簡介，至少兩個必須來自人物背景、職業、關係、場景、課程形式、任務、時間或故事鉤子。可選例型：弓道少女、首次拍攝、講師的指導、短短一天、溫泉旅行、偶像時代。絕對不要輸出身體部位、射精次數、多人數字或含 P 的人數詞。只輸出 JSON。',
        }, {
          role: 'user',
          content: JSON.stringify({
            title: source.title,
            description: source.description,
            actress: source.actress,
            series: source.series,
            source_tags: source.source_tags,
            retry_instruction: attempt ? '上一輪輸出不是完整 JSON。這次務必完成單一 JSON 物件，不可新增 schema 之外的欄位。' : undefined,
          }),
        }],
      }),
      });
      if (!response.ok) throw new Error(`Local source brief returned HTTP ${response.status}`);
      const body = await response.json();
      const brief = normalizeLocalSourceBrief(JSON.parse(body.message?.content ?? '{}'));
      const resolvedCore = resolveCoreSourceConcept(brief.core_source_concept, source);
      if (!resolvedCore) throw new Error(`Local source brief core concept is not traceable: ${brief.core_source_concept}`);
      brief.core_source_concept = resolvedCore;
      return brief;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Local source brief failed after retry: ${lastError?.message ?? 'unknown error'}`);
}

export {BRIEF_SCHEMA};
