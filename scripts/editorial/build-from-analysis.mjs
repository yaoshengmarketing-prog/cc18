import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {assertEditorialProviderReady, editorialApiKey, loadLocalEditorialEnvironment, requestStructuredEditorial} from './lib/openai-writer.mjs';
import {buildSafePublicSource, buildSafeVideoAnalysis, safeCanonicalTagIds} from './lib/safe-editorial-payload.mjs';
import {normalizeEditorialResult, parseFirstJsonObject} from './lib/provider-normalization.mjs';
import {writeSearchContent} from './lib/search-content.mjs';
import {createLocalSourceBrief} from './lib/local-source-brief.mjs';
import {loadBridgeConfig} from '../bridge/lib/config.mjs';

const movieId = process.argv.slice(2).find((argument) => !argument.startsWith('--'))?.trim().toUpperCase();
if (!movieId || !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId)) {
  throw new Error('Usage: node scripts/editorial/build-from-analysis.mjs <MOVIE-ID>');
}

const root = resolve(import.meta.dirname, '..', '..');
loadLocalEditorialEnvironment(root);
const analysisArgument = process.argv.find((argument) => argument.startsWith('--analysis='))?.slice('--analysis='.length);
const sourceOnly = process.argv.includes('--source-only');
const repairExisting = process.argv.includes('--repair-existing');
const feedbackArgument = process.argv.find((argument) => argument.startsWith('--qa-feedback='))?.slice('--qa-feedback='.length);
const rewriteAttempt = Number(process.argv.find((argument) => argument.startsWith('--rewrite-attempt='))?.slice('--rewrite-attempt='.length) ?? 0);
const normalizedTag = (value) => value.normalize('NFKC').trim();
const json = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));

const sourceRecordPath = resolve(root, `data/source-records/${movieId}.json`);
const sourceRecordText = await readFile(sourceRecordPath, 'utf8');
const source = JSON.parse(sourceRecordText);
const taxonomy = await json('data/taxonomy.json');
const registry = await json('data/movie-registry.json');
const candidates = await json('data/tag-candidates.json');
const editorialModel = await json('config/editorial-model.json');
const titlePolicy = await json('config/title-policy.json');
let analysisPath = analysisArgument ? resolve(analysisArgument) : null;
if (!sourceOnly && !analysisPath) {
  const queue = await json('.cc18-bridge/queue.json');
  const job = queue.jobs.find((item) => item.movie_id === movieId && item.status === 'analysis_ready');
  if (!job?.analysis_path) throw new Error(`${movieId}: no analysis_ready Media Bridge job`);
  analysisPath = job.analysis_path;
}
const analysis = sourceOnly ? {
  schema_version: 1,
  movie_id: movieId,
  job_id: null,
  source_duration_seconds: null,
  coverage: {strategy: 'source_only', sample_windows: 0, average_confidence: null},
  visual_observations: [],
  audio_transcription_status: 'not_configured',
} : JSON.parse(await readFile(analysisPath, 'utf8'));
if (analysis.movie_id !== movieId) throw new Error(`${movieId}: analysis belongs to ${analysis.movie_id}`);

const knownTagIds = taxonomy.tags.map(({id}) => id);
const providerTagIds = knownTagIds.filter((id) => safeCanonicalTagIds.includes(id));
const outputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['angle_candidates', 'selected_thesis', 'title_signals', 'title', 'seo_title', 'social_title', 'short_review', 'editorial_angle', 'canonical_tag_ids', 'evidence', 'creative_reconstruction_notes', 'unsupported_claims_excluded', 'decision_guide', 'sections'],
  properties: {
    angle_candidates: {type: 'array', minItems: 3, maxItems: 3, items: {type: 'string', maxLength: 180}},
    selected_thesis: {type: 'string', maxLength: 240},
    title_signals: {
      type: 'array', minItems: 2, maxItems: 4,
      items: {
        type: 'object', additionalProperties: false,
        required: ['type', 'value', 'source_field'],
        properties: {
          type: {type: 'string', enum: titlePolicy.signal_types},
          value: {type: 'string', minLength: 1, maxLength: 30},
          source_field: {type: 'string', enum: titlePolicy.signal_source_fields},
        },
      },
    },
    title: {type: 'string', maxLength: 90},
    seo_title: {type: 'string', maxLength: 100},
    social_title: {type: 'string', maxLength: 90},
    short_review: {type: 'string', maxLength: 240},
    editorial_angle: {type: 'string', maxLength: 300},
    canonical_tag_ids: {type: 'array', minItems: 2, maxItems: 6, uniqueItems: true, items: {type: 'string', enum: providerTagIds}},
    evidence: {
      type: 'array', minItems: 5, maxItems: 10,
      items: {
        type: 'object', additionalProperties: false,
        required: ['basis', 'signal', 'supports', 'observation_refs'],
        properties: {
          basis: {type: 'string', enum: ['public_source', 'video_sample', 'both', 'creative_reconstruction']},
          signal: {type: 'string', maxLength: 300},
          supports: {type: 'string', maxLength: 240},
          observation_refs: {type: 'array', maxItems: 8, items: {type: 'integer', minimum: 0}},
        },
      },
    },
    creative_reconstruction_notes: {type: 'array', minItems: 2, maxItems: 8, items: {type: 'string', minLength: 8, maxLength: 180}},
    unsupported_claims_excluded: {type: 'array', minItems: 3, maxItems: 8, items: {type: 'string', maxLength: 160}},
    decision_guide: {
      type: 'object', additionalProperties: false,
      required: ['thesis', 'story_density', 'pace', 'presentation', 'audience_for', 'audience_not_for', 'questions_answered'],
      properties: {
        thesis: {type: 'string', minLength: 20, maxLength: 260},
        story_density: {type: 'string', enum: ['low', 'medium', 'high', 'unknown']},
        pace: {type: 'string', enum: ['slow', 'balanced', 'fast', 'varied', 'unknown']},
        presentation: {type: 'array', minItems: 2, maxItems: 4, uniqueItems: true, items: {type: 'string', maxLength: 40}},
        audience_for: {type: 'array', minItems: 2, maxItems: 4, uniqueItems: true, items: {type: 'string', minLength: 8, maxLength: 120}},
        audience_not_for: {type: 'array', minItems: 2, maxItems: 4, uniqueItems: true, items: {type: 'string', minLength: 8, maxLength: 120}},
        questions_answered: {type: 'array', minItems: 3, maxItems: 6, uniqueItems: true, items: {type: 'string', minLength: 8, maxLength: 120}},
      },
    },
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

const bridgeConfig = await loadBridgeConfig(resolve(root, 'config/media-bridge.json'));
const existingBrief = repairExisting ? await json(`data/editorial-briefs/${movieId}.json`) : null;
const localCreativeBrief = existingBrief?.local_creative_brief ?? await createLocalSourceBrief(source, bridgeConfig);
const safePublicSource = buildSafePublicSource(source, localCreativeBrief);
const safeVideoAnalysis = buildSafeVideoAnalysis(analysis);

const sourceOnlyGuard = sourceOnly
  ? '本次是 source-only：你沒有影片鏡位、收音、剪輯、演技、表情、身體語言或逐幕順序的證據。不得把這些內容寫成實際觀察。必須優先使用 safe_title_signals 中非演員、非畫質的來源概念，並以「公開片名／公開簡介／企劃設定」作為評論立足點。'
  : '';
const system = `你是 CC18 的繁體中文創作型資深影評編輯。作品資料只負責確認番號、演員、日期、系列與來源身分；正文以內容完整、故事性、獨特切角與選片價值為優先。你可以創作性重構情節發展、人物動機、場景銜接與敘事細節，使文章讀起來像完整影評，而不是資料摘要。將這些創作依據列入 creative_reconstruction_notes；不得把它們標成 video_sample、不得改寫 Registry 或 Canonical Tag，也不得虛構演員私生活、真實身分或年齡。${sourceOnlyGuard}文章正文不用插入方法免責聲明。每一節回答不同問題，避免套版句型。title_signals 必須從 safe_title_signals 原樣選取二至四個；顯示標題、SEO 標題及社群標題都必須包含番號。decision_guide 必須直接協助選片。演員未知時不可發明姓名。只輸出符合 JSON Schema 的 JSON。`;
const prompt = {
  task: '產生可審查的 Editorial Brief 與影評草稿',
  public_source: safePublicSource,
  video_analysis: safeVideoAnalysis,
  taxonomy: taxonomy.tags.filter(({id}) => providerTagIds.includes(id)).map(({id, label, group}) => ({id, label, group})),
  title_policy: titlePolicy,
  recent_review_titles: registry.records.map(({id}) => id).filter((id) => id !== movieId),
  editorial_mode: sourceOnly ? 'creative_first_source_only' : 'creative_first_video_enhanced',
  method_note_location: '網站編輯方法頁；正文不需重複免責句',
  rewrite_attempt: rewriteAttempt,
};

if (feedbackArgument) {
  const feedback = JSON.parse(await readFile(resolve(feedbackArgument), 'utf8'));
  prompt.previous_qa_feedback = {
    failure_reasons: feedback.failure_reasons ?? [],
    checks: feedback.checks ?? {},
    instruction: '重寫全文以修正所有失敗項目；保留可追溯證據，但不可只局部補句。',
  };
}

if (!repairExisting) assertEditorialProviderReady(editorialModel);
const generation = repairExisting
  ? {text: JSON.stringify(existingBrief), usage: {model: existingBrief.generation_model ?? editorialModel.model}}
  : await requestStructuredEditorial({
    apiKey: editorialApiKey(editorialModel),
    config: editorialModel,
    schema: outputSchema,
    instructions: system,
    input: prompt,
  });
const result = normalizeEditorialResult(parseFirstJsonObject(generation.text), {movieId, safePublicSource, safeVideoAnalysis});
const providerFields = Object.keys(result).sort();
const providerFallbacks = [];

if (!result.title?.trim()) throw new Error('Editorial provider returned no title');
if (!result.seo_title?.trim()) {
  result.seo_title = `${movieId} 影評｜${result.title}`.slice(0, 100);
  providerFallbacks.push('seo_title');
}
if (!result.social_title?.trim()) {
  result.social_title = result.title.slice(0, 90);
  providerFallbacks.push('social_title');
}
if (!Array.isArray(result.title_signals) || result.title_signals.length < 2) {
  result.title_signals = safePublicSource.safe_title_signals.slice(0, 4);
  providerFallbacks.push('title_signals');
}
for (const requiredArray of ['angle_candidates', 'canonical_tag_ids', 'evidence', 'creative_reconstruction_notes', 'unsupported_claims_excluded', 'sections']) {
  if (!Array.isArray(result[requiredArray])) throw new Error(`Editorial provider returned no ${requiredArray}; fields=${providerFields.join(',')}`);
}
for (const requiredText of ['selected_thesis', 'short_review', 'editorial_angle']) {
  if (!result[requiredText]?.trim()) throw new Error(`Editorial provider returned no ${requiredText}; fields=${providerFields.join(',')}`);
}
console.log(JSON.stringify({event: 'editorial_provider_shape', fields: providerFields, local_fallbacks: providerFallbacks}));
if (!result.title.includes(movieId)) result.title = `${movieId} ${result.title}`.slice(0, 90);
if (!result.seo_title.includes(movieId)) result.seo_title = `${movieId} 影評｜${result.seo_title}`.slice(0, 100);
if (!result.social_title.includes(movieId)) result.social_title = `${movieId}｜${result.social_title}`.slice(0, 90);
const sourceTextByField = {
  title: source.title ?? '',
  description: source.description ?? '',
  actress: (source.actress ?? []).join('、'),
  series: source.series ?? '',
  safe_signals: safePublicSource.safe_title_signals.map(({value}) => value).join('、'),
};
for (const signal of result.title_signals) {
  if (!sourceTextByField[signal.source_field]?.includes(signal.value)) {
    throw new Error(`Untraceable title signal ${signal.value} in ${signal.source_field}`);
  }
}
const signalValues = result.title_signals.map(({value}) => value);
if (signalValues.filter((value) => result.title.includes(value)).length < 2) {
  const generated = result.title.replace(movieId, '').trim().replace(/^[｜|：:—–-]+/, '').trim();
  result.title = `${movieId} ${signalValues[0]} × ${signalValues[1]}｜${generated}`.slice(0, 90);
}
if (!signalValues.some((value) => result.social_title.includes(value))) {
  const generated = result.social_title.replace(movieId, '').trim().replace(/^[｜|：:—–-]+/, '').trim();
  result.social_title = `${movieId}｜${signalValues[0]}：${generated}`.slice(0, 90);
}
for (const tag of result.canonical_tag_ids) {
  if (!knownTagIds.includes(tag)) throw new Error(`Unknown generated canonical tag: ${tag}`);
}
const usedEvidence = new Set(result.evidence.flatMap(({observation_refs}) => observation_refs));
if (!sourceOnly && usedEvidence.size < 3) throw new Error('Video-enhanced draft must cite at least three distinct video sample windows');

const brief = {
  schema_version: 1,
  id: movieId,
  generated_at: new Date().toISOString(),
  generation_mode: sourceOnly ? 'creative_first_source_only' : 'creative_first_video_enhanced',
  generation_model: generation.usage.model,
  rewrite_attempt: rewriteAttempt,
  source_record: `data/source-records/${movieId}.json`,
  video_analysis_job_id: analysis.job_id ?? null,
  local_creative_brief: localCreativeBrief,
  locally_repaired_at: repairExisting ? new Date().toISOString() : null,
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
${source.original_title_ja ? `originalTitleJa: ${yamlText(source.original_title_ja)}\n` : ''}${source.translated_title_zh_tw ? `translatedTitleZhTw: ${yamlText(source.translated_title_zh_tw)}\n` : ''}title: ${yamlText(result.title)}
seoTitle: ${yamlText(result.seo_title)}
socialTitle: ${yamlText(result.social_title)}
titleSignals:
${yamlList(signalValues.map(yamlText))}
titleVersion: 1
actress:
${yamlList(source.actress ?? [])}
releaseDate: ${source.release_date}
publishedAt: ${today}
studio: ${yamlText(source.studio ?? '')}
series: ${yamlText(source.series ?? '')}
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
].map(normalizedTag));
for (const label of source.source_tags ?? []) {
  if (handledTags.has(normalizedTag(label))) continue;
  const existing = candidates.candidates.find((item) => normalizedTag(item.label) === normalizedTag(label));
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
    signals: result.title_signals,
    primary_theme: signalValues[0],
    presentation_feature: signalValues[1],
    editorial_judgment: result.editorial_angle,
    source_keywords: signalValues,
  },
  evidence: result.evidence,
  unsupported_claims_excluded: result.unsupported_claims_excluded,
  scores: null,
  rewrite_attempts: rewriteAttempt,
  approved_for_publish: false,
};
await writeFile(resolve(root, `data/review-quality/${movieId}.json`), `${JSON.stringify(quality, null, 2)}\n`);

await writeSearchContent({root, source, sourceRecordText, safeVideoAnalysis, result, analysis, registry});

if (!repairExisting) {
  await mkdir(resolve(root, 'data/editorial-usage'), {recursive: true});
  const usagePath = resolve(root, `data/editorial-usage/${movieId}.json`);
  let previousUsage = {calls: []};
  try {
    previousUsage = JSON.parse(await readFile(usagePath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const usageCall = {
    generated_at: new Date().toISOString(),
    rewrite_attempt: rewriteAttempt,
    ...generation.usage,
  };
  const usageCalls = [...(previousUsage.calls ?? []), usageCall];
  await writeFile(usagePath, `${JSON.stringify({
    schema_version: 1,
    movie_id: movieId,
    calls: usageCalls,
    totals: {
      input_tokens: usageCalls.reduce((sum, call) => sum + call.input_tokens, 0),
      cached_input_tokens: usageCalls.reduce((sum, call) => sum + call.cached_input_tokens, 0),
      output_tokens: usageCalls.reduce((sum, call) => sum + call.output_tokens, 0),
      estimated_cost_usd: Number(usageCalls.reduce((sum, call) => sum + (call.estimated_cost_usd ?? 0), 0).toFixed(6)),
      estimated_payg_cash_cost_usd: Number(usageCalls.reduce((sum, call) => sum + (call.estimated_payg_cash_cost_usd ?? 0), 0).toFixed(6)),
      direct_openai_reference_usd: Number(usageCalls.reduce((sum, call) => sum + (call.direct_openai_reference_usd ?? 0), 0).toFixed(6)),
      gateway_premium_usd: Number(usageCalls.reduce((sum, call) => sum + (call.gateway_premium_usd ?? 0), 0).toFixed(6)),
    },
  }, null, 2)}\n`);
}

console.log(JSON.stringify({movie_id: movieId, brief: `data/editorial-briefs/${movieId}.json`, review: `content/reviews/${movieId}.md`, status: 'draft'}, null, 2));
