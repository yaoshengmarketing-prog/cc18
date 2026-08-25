import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const movieId = process.argv[2];
if (!movieId || !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId)) {
  throw new Error('Usage: node scripts/editorial/build-from-analysis.mjs <MOVIE-ID>');
}

const root = resolve(import.meta.dirname, '..', '..');
const json = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));

function parseStructuredJson(value) {
  const source = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let output = '';
  let inString = false;
  let escaped = false;
  for (const char of source) {
    if (inString && !escaped && (char === '\n' || char === '\r')) {
      output += '\\n';
      continue;
    }
    output += char;
    if (escaped) {
      escaped = false;
    } else if (char === '\\' && inString) {
      escaped = true;
    } else if (char === '"') {
      inString = !inString;
    }
  }
  return JSON.parse(output);
}
const source = await json(`data/source-records/${movieId}.json`);
const queue = await json('.cc18-bridge/queue.json');
const taxonomy = await json('data/taxonomy.json');
const registry = await json('data/movie-registry.json');
const candidates = await json('data/tag-candidates.json');
const config = await json('config/media-bridge.json');
const job = queue.jobs.find((item) => item.movie_id === movieId && item.status === 'analysis_ready');
if (!job?.analysis_path) throw new Error(`${movieId}: no analysis_ready Media Bridge job`);
const analysis = JSON.parse(await readFile(job.analysis_path, 'utf8'));

const knownTagIds = taxonomy.tags.map(({id}) => id);
const outputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['angle_candidates', 'selected_thesis', 'title', 'seo_title', 'short_review', 'editorial_angle', 'canonical_tag_ids', 'evidence', 'unsupported_claims_excluded', 'sections'],
  properties: {
    angle_candidates: {type: 'array', minItems: 3, maxItems: 3, items: {type: 'string', maxLength: 180}},
    selected_thesis: {type: 'string', maxLength: 240},
    title: {type: 'string', maxLength: 90},
    seo_title: {type: 'string', maxLength: 100},
    short_review: {type: 'string', maxLength: 240},
    editorial_angle: {type: 'string', maxLength: 300},
    canonical_tag_ids: {type: 'array', minItems: 2, maxItems: 6, uniqueItems: true, items: {type: 'string', enum: knownTagIds}},
    evidence: {
      type: 'array', minItems: 5, maxItems: 10,
      items: {
        type: 'object', additionalProperties: false,
        required: ['basis', 'signal', 'supports', 'observation_refs'],
        properties: {
          basis: {type: 'string', enum: ['public_source', 'video_sample', 'both']},
          signal: {type: 'string', maxLength: 300},
          supports: {type: 'string', maxLength: 240},
          observation_refs: {type: 'array', maxItems: 8, items: {type: 'integer', minimum: 0}},
        },
      },
    },
    unsupported_claims_excluded: {type: 'array', minItems: 3, maxItems: 8, items: {type: 'string', maxLength: 160}},
    sections: {
      type: 'array', minItems: 6, maxItems: 7,
      items: {
        type: 'object', additionalProperties: false,
        required: ['heading', 'body'],
        properties: {
          heading: {type: 'string', maxLength: 50},
          body: {type: 'string', minLength: 180, maxLength: 700},
        },
      },
    },
  },
};

const observations = analysis.visual_observations.map((item) => ({
  i: item.sample_index,
  at: Math.round(item.source_start_seconds),
  setting: item.setting.slice(0, 120),
  cues: item.narrative_cues.slice(0, 3),
  tone: item.interaction_tone.slice(0, 120),
  camera: item.camera_style.slice(0, 2),
}));

const system = `你是 CC18 的繁體中文資深影評編輯。根據公開作品資料與橫跨完整片長的代表性影片抽樣，寫出具體、克制、非露骨且有選片價值的原創影評。不得聲稱逐幀完整看完，不得辨識未提供姓名的演員，不得虛構對白、心理、剪輯品質或抽樣未支持的場景順序。來源含成人題材，但輸出只討論劇情設定、角色轉折、場景、互動氣氛、攝影距離、企劃取捨與適合觀眾。每一節回答不同問題，避免套版句型。標題必須保留番號及至少兩個來源訊號；演員未知時不可發明姓名。只輸出符合 JSON Schema 的 JSON。`;
const prompt = {
  task: '產生可審查的 Editorial Brief 與影評草稿',
  public_source: source,
  video_analysis: {
    duration_seconds: analysis.source_duration_seconds,
    sample_windows: analysis.coverage.sample_windows,
    average_confidence: analysis.coverage.average_confidence,
    observations,
  },
  taxonomy: taxonomy.tags.map(({id, label, group}) => ({id, label, group})),
  recent_review_titles: registry.records.map(({id}) => id).filter((id) => id !== movieId),
  required_method_note: '結尾以自然文字說明本文依據 CC18 公開資料與完整片長分布式抽樣，不宣稱逐幀觀看。',
};

const endpoint = new URL(config.local_analysis.endpoint);
if (!['127.0.0.1', 'localhost', '::1'].includes(endpoint.hostname)) throw new Error('Editorial model endpoint must be loopback');
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 300_000);
let result;
try {
  const response = await fetch(new URL('/api/chat', endpoint), {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    signal: controller.signal,
    body: JSON.stringify({
      model: config.local_analysis.vision_model,
      stream: false,
      format: outputSchema,
      keep_alive: '10m',
      options: {temperature: 0.2, num_ctx: 32768, num_predict: 5000},
      messages: [
        {role: 'system', content: system},
        {role: 'user', content: JSON.stringify(prompt)},
      ],
    }),
  });
  if (!response.ok) throw new Error(`Local Ollama returned HTTP ${response.status}`);
  const body = await response.json();
  result = parseStructuredJson(body.message?.content ?? '{}');
} finally {
  clearTimeout(timeout);
}

if (!result.title.includes(movieId)) result.title = `${movieId} ${result.title}`.slice(0, 90);
if (!result.seo_title.includes(movieId)) result.seo_title = `${movieId} 影評｜${result.seo_title}`.slice(0, 100);
for (const tag of result.canonical_tag_ids) {
  if (!knownTagIds.includes(tag)) throw new Error(`Unknown generated canonical tag: ${tag}`);
}
const usedEvidence = new Set(result.evidence.flatMap(({observation_refs}) => observation_refs));
if (usedEvidence.size < 3) throw new Error('Draft must cite at least three distinct video sample windows');

const brief = {
  schema_version: 1,
  id: movieId,
  generated_at: new Date().toISOString(),
  generation_mode: 'local_only',
  source_record: `data/source-records/${movieId}.json`,
  video_analysis_job_id: analysis.job_id,
  video_coverage: analysis.coverage,
  ...result,
};
await mkdir(resolve(root, 'data/editorial-briefs'), {recursive: true});
await writeFile(resolve(root, `data/editorial-briefs/${movieId}.json`), `${JSON.stringify(brief, null, 2)}\n`);

const yamlText = (value) => JSON.stringify(value);
const yamlList = (values) => values.length ? values.map((value) => `  - ${value}`).join('\n') : '  []';
const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Taipei'}).format(new Date());
const markdown = `---
id: ${movieId}
sourceTitle: ${yamlText(source.title)}
title: ${yamlText(result.title)}
seoTitle: ${yamlText(result.seo_title)}
actress:
${yamlList(source.actress ?? [])}
releaseDate: ${source.release_date}
publishedAt: ${today}
studio: ${yamlText(source.studio)}
series: ${yamlText(source.series)}
sourceUrl: ${source.source_url}
sourceSite: cc18.tv
coverUrl: ${source.cover_source_url}
shortReview: ${yamlText(result.short_review)}
editorialAngle: ${yamlText(result.editorial_angle)}
sourceTags:
${yamlList(source.source_tags ?? [])}
canonicalTagIds:
${yamlList(result.canonical_tag_ids)}
status: draft
videoStatus: pending
featured: false
---

${result.sections.map(({heading, body}) => `## ${heading}\n\n${body}`).join('\n\n')}
`;
const reviewPath = resolve(root, `content/reviews/${movieId}.md`);
await writeFile(reviewPath, markdown);

const handledTags = new Set([
  ...Object.keys(taxonomy.source_tag_map),
  ...taxonomy.ignored_source_tags,
]);
for (const label of source.source_tags ?? []) {
  if (handledTags.has(label)) continue;
  const existing = candidates.candidates.find((item) => item.label === label);
  if (existing) {
    existing.occurrences = Math.max(existing.occurrences ?? 0, 1);
    existing.source_ids = [...new Set([...(existing.source_ids ?? []), movieId])];
    existing.last_seen = today;
  } else {
    candidates.candidates.push({label, occurrences: 1, source_ids: [movieId], first_seen: today, last_seen: today, status: 'quarantined'});
  }
}
await writeFile(resolve(root, 'data/tag-candidates.json'), `${JSON.stringify(candidates, null, 2)}\n`);

if (!registry.records.some(({id}) => id === movieId)) {
  registry.records.push({
    id: movieId,
    actress: source.actress ?? [],
    release_date: source.release_date,
    source_url: source.source_url,
    source_site: 'cc18.tv',
    review_status: 'draft',
    cover_status: 'remote_source',
    video_status: 'pending',
    template: 'story',
    published_at: today,
  });
  registry.updated_at = new Date().toISOString();
  await writeFile(resolve(root, 'data/movie-registry.json'), `${JSON.stringify(registry, null, 2)}\n`);
}

const quality = {
  schema_version: 1,
  id: movieId,
  review_sha256: createHash('sha256').update(markdown).digest('hex'),
  selected_thesis: result.selected_thesis,
  title_basis: {
    performer: (source.actress ?? []).join('、') || null,
    primary_theme: '旅館同房',
    presentation_feature: '同期女同事的酒後角色反差',
    editorial_judgment: result.editorial_angle,
    source_keywords: ['旅館', '同期女同事', '撒嬌'],
  },
  evidence: result.evidence,
  unsupported_claims_excluded: result.unsupported_claims_excluded,
  scores: null,
  rewrite_attempts: 0,
  approved_for_publish: false,
};
await writeFile(resolve(root, `data/review-quality/${movieId}.json`), `${JSON.stringify(quality, null, 2)}\n`);

console.log(JSON.stringify({movie_id: movieId, brief: `data/editorial-briefs/${movieId}.json`, review: `content/reviews/${movieId}.md`, status: 'draft'}, null, 2));
