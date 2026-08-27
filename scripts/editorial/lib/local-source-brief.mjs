import {assertLocalEndpoint} from '../../bridge/lib/local-analysis.mjs';

const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['premise', 'relationship', 'role_dynamic', 'central_tension', 'setting', 'themes', 'creative_seeds'],
  properties: {
    premise: {type: 'string', maxLength: 240},
    relationship: {type: 'string', maxLength: 120},
    role_dynamic: {type: 'string', maxLength: 160},
    central_tension: {type: 'string', maxLength: 180},
    setting: {type: 'string', maxLength: 120},
    themes: {type: 'array', minItems: 2, maxItems: 6, items: {type: 'string', maxLength: 60}},
    creative_seeds: {type: 'array', minItems: 3, maxItems: 6, items: {type: 'string', maxLength: 140}},
  },
};

const clip = (value, maximum) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum);

export function normalizeLocalSourceBrief(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Local source brief returned invalid JSON');
  const list = (key, maximum, limit) => Array.isArray(value[key])
    ? value[key].map((item) => clip(item, maximum)).filter(Boolean).slice(0, limit)
    : [];
  const result = {
    premise: clip(value.premise, 240),
    relationship: clip(value.relationship, 120),
    role_dynamic: clip(value.role_dynamic, 160),
    central_tension: clip(value.central_tension, 180),
    setting: clip(value.setting, 120),
    themes: list('themes', 60, 6),
    creative_seeds: list('creative_seeds', 140, 6),
  };
  if (![result.premise, result.relationship, result.role_dynamic, result.central_tension].every(Boolean)
    || result.themes.length < 2 || result.creative_seeds.length < 3) {
    throw new Error('Local source brief is incomplete');
  }
  return result;
}

export async function createLocalSourceBrief(source, config, fetchImplementation = fetch) {
  const endpoint = assertLocalEndpoint(config.local_analysis.endpoint);
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
        options: {temperature: 0.2, num_predict: 900},
        messages: [{
          role: 'system',
          content: '你是本機內容策劃器。讀取作品標題、公開簡介與標籤，整理成繁體中文、非露骨的創作 Brief。不要辨識未提供的人物，不要評論真人私生活。Creative seeds 可以提出可供影評編撰的情節、動機與轉折方向，但不可包含露骨描述。只輸出 JSON。',
        }, {
          role: 'user',
          content: JSON.stringify({title: source.title, description: source.description, actress: source.actress, series: source.series, source_tags: source.source_tags}),
        }],
      }),
    });
    if (!response.ok) throw new Error(`Local source brief returned HTTP ${response.status}`);
    const body = await response.json();
    return normalizeLocalSourceBrief(JSON.parse(body.message?.content ?? '{}'));
  } finally {
    clearTimeout(timeout);
  }
}

export {BRIEF_SCHEMA};
