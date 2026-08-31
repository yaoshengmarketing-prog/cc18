import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {assertEditorialProviderReady, editorialApiKey, loadLocalEditorialEnvironment, requestStructuredEditorial} from './lib/openai-writer.mjs';
import {buildSafePublicSource, buildSafeVideoAnalysis, safeCanonicalTagIds} from './lib/safe-editorial-payload.mjs';
import {normalizeEditorialResult, parseFirstJsonObject} from './lib/provider-normalization.mjs';
import {writeSearchContent} from './lib/search-content.mjs';
import {createDeterministicSourceBrief, createLocalSourceBrief} from './lib/local-source-brief.mjs';
import {ensureAllPerformersInTitle, fillMissingEditorialTitle} from './lib/editorial-fallbacks.mjs';
import {appendEditorialUsage} from './lib/usage-ledger.mjs';
import {loadBridgeConfig} from '../bridge/lib/config.mjs';
import {createTaxonomyHelpers} from '../tags/taxonomy.mjs';

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

const providerTagIds = taxonomy.tags.filter(({group, id}) => group === 'editorial' && safeCanonicalTagIds.includes(id)).map(({id}) => id);
const taxonomyHelpers = createTaxonomyHelpers(taxonomy);
const tagChannels = taxonomyHelpers.buildTagChannels({sourceTags: source.source_tags ?? []});
const topicElements = taxonomyHelpers.buildTopicElements(source.source_tags ?? []);
const outputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['angle_candidates', 'selected_thesis', 'title_signals', 'title', 'seo_title', 'social_title', 'short_review', 'editorial_angle', 'editorial_tag_ids', 'evidence', 'creative_reconstruction_notes', 'unsupported_claims_excluded', 'decision_guide', 'sections'],
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
    editorial_tag_ids: {type: 'array', minItems: 1, maxItems: 4, uniqueItems: true, items: {type: 'string', enum: providerTagIds}},
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
    unsupported_claims_excluded: {type: 'array', minItems: 1, maxItems: 5, items: {type: 'string', maxLength: 160}},
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

const bridgeConfig = sourceOnly ? null : await loadBridgeConfig(resolve(root, 'config/media-bridge.json'));
const existingBrief = repairExisting ? await json(`data/editorial-briefs/${movieId}.json`) : null;
const localCreativeBrief = existingBrief?.local_creative_brief
  ?? (sourceOnly ? createDeterministicSourceBrief(source) : await createLocalSourceBrief(source, bridgeConfig));
const safePublicSource = buildSafePublicSource(source, localCreativeBrief, taxonomy);
const safeVideoAnalysis = buildSafeVideoAnalysis(analysis);

const sourceOnlyGuard = sourceOnly
  ? '本次是 source-only：正文只能使用 public_source 與本地 Editorial Brief 中可追溯的來源片名、公開簡介、人物關係、企劃設定、core_source_concept 與 topic_elements。要將這些資訊自然寫成完整段落，並說明它們如何影響選片判斷。沒有 video_analysis 證據時，不得聲稱已觀察到情節、場景銜接、鏡位、聲音、剪輯、演技、表情或身體語言，也不可虛構演員私生活、真實身分或年齡。'
  : '';
const system = `你是 CC18 的繁體中文資深影評編輯。public_source.core_source_concept 是本作來源片名、系列或簡介中最具辨識度的企劃核心；它必須出現在 title 或 seo_title，控制 selected_thesis，並在至少兩個不同段落中得到實質分析。public_source.topic_elements 是由 CC18 原始標籤確定映射的題材字詞；正文必須自然使用重要的成人題材，說明題材與設定的組合、選片價值與取捨，不可只堆關鍵字。Canonical Tag 由規則引擎決定；你只選 editorial_tag_ids，表示影評觀點而非來源事實。文章要完整、具體且有選片價值，但所有作品事實只能來自 public_source、Editorial Brief 或 video_analysis；不得把未提供的情節、場景、鏡位、聲音、剪輯、表演或觀看結果寫成事實。${sourceOnlyGuard}公開欄位不得提到 AI、模型、提示詞、QA、source-only、資料欄位或內部製作方法。只能輸出 sections，不要輸出 review_sections；sections 必須有六至七節，每節 body 至少 180 字。每節先直接回答一個選片問題，再以可追溯的人物關係、設定或題材支持判斷。最後一節必須同時說明適合與不適合的觀眾。句型要自然變化，不得以公式化翻轉句代替論證。title_signals 必須從 safe_title_signals 原樣選取二至四個，且必須包含 core_source_concept；顯示標題、SEO 標題及社群標題都必須包含番號。decision_guide.thesis 必須至少二十個中文字並直接協助選片。演員未知時不可發明姓名。只輸出符合 JSON Schema 的 JSON。`;
const prompt = {
  task: '產生可審查的 Editorial Brief 與影評草稿',
  public_source: safePublicSource,
  video_analysis: safeVideoAnalysis,
  taxonomy: taxonomy.tags.filter(({id}) => providerTagIds.includes(id)).map(({id, label, group}) => ({id, label, group})),
  title_policy: titlePolicy,
  recent_review_titles: registry.records.map(({id}) => id).filter((id) => id !== movieId),
  editorial_mode: sourceOnly ? 'creative_first_source_only' : 'creative_first_video_enhanced',
  method_note_location: '網站編輯方法頁；正文不需重複免責句',
  section_contract: {
    output_field: 'sections',
    count: '6-7',
    minimum_body_characters: 180,
    required_development: ['core_source_concept 至少兩節', 'topic_elements 至少兩節', '最後一節同時說明適合與不適合觀眾'],
    evidence_boundary: '只寫 public_source、Editorial Brief 或 video_analysis 可證明的作品內容',
  },
  rewrite_attempt: rewriteAttempt,
};

if (feedbackArgument) {
  const feedback = JSON.parse(await readFile(resolve(feedbackArgument), 'utf8'));
  const guidance = {
    reused_generic_thesis_family: '不要再使用「被引導或被安排，最後掌握或接管節奏」作為核心命題。改由本作獨有的來源企劃結構、人物關係或場景規則決定全文因果。',
    sitewide_reused_sentences: '刪除可套用到其他作品的結尾與選片句，重新撰寫開場、段落邏輯及結論，不得沿用站內既有完整句子。',
    overused_conditional_review_voice: '直接提出並支持評論判斷；不要反覆使用「若成立」或「有機會」把結論停留在假設狀態。段落可以提出問題，但同一段必須給出明確答案。',
    missing_quick_decision: 'decision_guide.thesis 必須至少二十個中文字，直接說明本作最重要的企劃特色、呈現方式與選片取捨，不能只寫短標籤或片語。',
    missing_decision_value: '最後一節與 decision_guide 必須同時交代適合誰、不適合誰與具體取捨，不可只重複題材名稱。',
    body_lacks_source_adult_vocabulary: '將 public_source.topic_elements 中有來源的成人詞彙自然寫入至少兩個完整段落，說明它們在企劃中的作用，不可只列詞。',
    source_core_concept_not_developed: '以 public_source.core_source_concept 組織全文，至少在兩個不同段落說明設定、題材組合與選片差異。',
    insufficient_sections: '輸出欄位必須是 sections，且必須有六至七個不同段落；每節 body 至少 180 字，不得改用 review_sections 或只回傳摘要。',
  };
  const failureReasons = feedback.failure_reasons ?? [
    ...(feedback.issues ?? []),
    ...(feedback.repair_issues ?? []),
  ];
  prompt.previous_qa_feedback = {
    failure_reasons: failureReasons,
    checks: feedback.checks ?? {},
    targeted_guidance: failureReasons.map((reason) => guidance[reason]).filter(Boolean),
    instruction: '重寫全文以修正所有失敗項目；保留可追溯證據，但不可只局部補句。新的核心命題、開場、段落因果與結論都必須明顯不同。',
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
    requiredNonBlankFields: ['short_review'],
    blankFieldRepair: {
      field: 'short_review',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['short_review'],
        properties: {short_review: {type: 'string', minLength: 1, maxLength: 240, pattern: '.*\\S.*'}},
      },
      instructions: '只修補 short_review。根據提供的 public_source 與 editorial_brief，寫一段非空白、完整且有實質選片資訊的繁體中文短評。只能使用其中可追溯的作品設定、題材與成人詞彙；不得補寫來源未提供的情節、場景、鏡位、聲音、剪輯、表演或觀看結果。只輸出符合 Schema 的 JSON。',
      input: {
        movie_id: movieId,
        public_source: safePublicSource,
        editorial_brief: localCreativeBrief,
      },
    },
  });
if (!repairExisting) await appendEditorialUsage({root, movieId, rewriteAttempt, usage: generation.usage});
const result = normalizeEditorialResult(parseFirstJsonObject(generation.text), {movieId, safePublicSource, safeVideoAnalysis});
result.editorial_tag_ids = [...new Set((result.editorial_tag_ids ?? []).filter((id) => providerTagIds.includes(id)))].slice(0, 4);
if (!result.editorial_tag_ids.length) result.editorial_tag_ids = ['story'];
const providerFields = Object.keys(result).sort();
const providerFallbacks = [];

if (fillMissingEditorialTitle({result, movieId, source, safePublicSource})) providerFallbacks.push('title');
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
const coreSourceConcept = safePublicSource.core_source_concept;
if (coreSourceConcept) {
  const coreSignal = safePublicSource.safe_title_signals.find(({value}) => value === coreSourceConcept);
  if (!coreSignal) throw new Error(`Core source concept is missing from safe title signals: ${coreSourceConcept}`);
  const withoutCore = result.title_signals.filter(({value}) => value !== coreSourceConcept);
  const performer = withoutCore.find(({type}) => type === 'performer');
  result.title_signals = [performer, coreSignal, ...withoutCore.filter((signal) => signal !== performer)].filter(Boolean).slice(0, 4);
}
for (const requiredArray of ['angle_candidates', 'editorial_tag_ids', 'evidence', 'creative_reconstruction_notes', 'unsupported_claims_excluded', 'sections']) {
  if (!Array.isArray(result[requiredArray])) throw new Error(`Editorial provider returned no ${requiredArray}; fields=${providerFields.join(',')}`);
}
for (const requiredText of ['selected_thesis', 'short_review', 'editorial_angle']) {
  if (!result[requiredText]?.trim()) throw new Error(`Editorial provider returned no ${requiredText}; fields=${providerFields.join(',')}`);
}
console.log(JSON.stringify({event: 'editorial_provider_shape', fields: providerFields, local_fallbacks: providerFallbacks}));
if (!result.title.includes(movieId)) result.title = `${movieId} ${result.title}`.slice(0, 90);
if (!result.seo_title.includes(movieId)) result.seo_title = `${movieId} 影評｜${result.seo_title}`.slice(0, 100);
if (!result.social_title.includes(movieId)) result.social_title = `${movieId}｜${result.social_title}`.slice(0, 90);
result.title = ensureAllPerformersInTitle({
  value: result.title,
  movieId,
  performers: source.actress,
  maximumLength: 90,
});
result.seo_title = ensureAllPerformersInTitle({
  value: result.seo_title,
  movieId,
  performers: source.actress,
  maximumLength: 100,
});
if (coreSourceConcept && ![result.title, result.seo_title].some((value) => value.includes(coreSourceConcept))) {
  const performer = (source.actress ?? []).join('、');
  result.seo_title = `${movieId}${performer ? ` ${performer}` : ''}影評｜${coreSourceConcept}：${result.seo_title.replace(movieId, '').trim()}`.slice(0, 100);
  providerFallbacks.push('core_source_concept_in_seo_title');
}
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
for (const tag of result.editorial_tag_ids) {
  if (!providerTagIds.includes(tag)) throw new Error(`Unknown generated editorial tag: ${tag}`);
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
  topic_elements: topicElements,
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
${yamlList(tagChannels.canonicalTagIds)}
editorialTagIds:
${yamlList(result.editorial_tag_ids)}
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
    existing.source_ids = [...new Set([...(existing.source_ids ?? []), movieId])];
    existing.occurrences = existing.source_ids.length;
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
    image_status: 'pending',
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

console.log(JSON.stringify({movie_id: movieId, brief: `data/editorial-briefs/${movieId}.json`, review: `content/reviews/${movieId}.md`, status: 'draft'}, null, 2));
