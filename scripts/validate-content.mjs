import {createHash} from 'node:crypto';
import {readdir, readFile} from 'node:fs/promises';
import {buildSafeTitleSignals} from './editorial/lib/safe-editorial-payload.mjs';

const root = new URL('../', import.meta.url);
const readJson = async (relative) => JSON.parse(await readFile(new URL(relative, root), 'utf8'));
const taxonomy = await readJson('data/taxonomy.json');
const candidates = await readJson('data/tag-candidates.json');
const registry = await readJson('data/movie-registry.json');
const policy = await readJson('config/review-policy.json');
const titlePolicy = await readJson('config/title-policy.json');

const knownTagIds = new Set(taxonomy.tags.map(({id}) => id));
const editorialTagIds = new Set(taxonomy.tags.filter(({group}) => group === 'editorial').map(({id}) => id));
const ignoredSourceTags = new Set(taxonomy.ignored_source_tags);
const candidateLabels = new Set(candidates.candidates.map(({label}) => label));

const frontmatter = (markdown) => {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error('Review is missing YAML frontmatter');
  return match[1];
};

const scalar = (yaml, key) => {
  const match = yaml.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, '');
};

const list = (yaml, key) => {
  const match = yaml.match(new RegExp(`^${key}:\\s*\\r?\\n((?:  - .+(?:\\r?\\n|$))*)`, 'm'));
  return match ? [...match[1].matchAll(/^  - (.+)$/gm)].map((item) => item[1].trim()) : [];
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const published = registry.records.filter(({review_status}) => review_status === 'published');
const approvedReviews = [];

for (const record of published) {
  const reviewUrl = new URL(`content/reviews/${record.id}.md`, root);
  const sourceUrl = new URL(`data/source-records/${record.id}.json`, root);
  const sourceText = await readFile(sourceUrl, 'utf8');
  const source = JSON.parse(sourceText);
  const quality = await readJson(`data/review-quality/${record.id}.json`);
  const search = await readJson(`data/search-content/${record.id}.json`);
  const markdown = await readFile(reviewUrl, 'utf8');
  const yaml = frontmatter(markdown);

  if (scalar(yaml, 'id') !== record.id) throw new Error(`${record.id}: frontmatter ID mismatch`);
  if (scalar(yaml, 'sourceTitle') !== source.title) throw new Error(`${record.id}: sourceTitle must exactly match the source record`);

  const seoTitle = scalar(yaml, 'seoTitle') ?? '';
  const displayTitle = scalar(yaml, 'title') ?? '';
  const socialTitle = scalar(yaml, 'socialTitle') ?? '';
  const titleSignals = list(yaml, 'titleSignals').map((value) => value.replace(/^['"]|['"]$/g, ''));
  if (!displayTitle.includes(record.id)) throw new Error(`${record.id}: display title must include the catalog number`);
  if (!seoTitle.includes(record.id)) throw new Error(`${record.id}: seoTitle must include the catalog number`);
  if (!socialTitle.includes(record.id)) throw new Error(`${record.id}: socialTitle must include the catalog number`);
  for (const actress of record.actress ?? []) {
    if (actress && !seoTitle.includes(actress)) throw new Error(`${record.id}: seoTitle must include performer ${actress}`);
    if (actress && !displayTitle.includes(actress)) throw new Error(`${record.id}: display title must include performer ${actress}`);
  }
  const minimumSignals = titlePolicy.validation.display_title_minimum_signals;
  const maximumSignals = titlePolicy.keyword_stack_strategy.maximum_title_signals;
  if (titleSignals.length < minimumSignals || titleSignals.length > maximumSignals) {
    throw new Error(`${record.id}: titleSignals must contain ${minimumSignals} to ${maximumSignals} values`);
  }
  const sourceCorpus = [
    source.title, source.description, ...(source.actress ?? []), source.series,
    ...(source.source_tags ?? []), ...buildSafeTitleSignals(source).map(({value}) => value),
  ].filter(Boolean).join('\n');
  for (const signal of titleSignals) {
    if (!sourceCorpus.includes(signal)) throw new Error(`${record.id}: title signal is not traceable to source: ${signal}`);
  }
  const matchedKeywords = titleSignals.filter((keyword) => displayTitle.includes(keyword));
  if (matchedKeywords.length < minimumSignals) {
    throw new Error(`${record.id}: display title must retain at least two approved source-title signals`);
  }
  if (!titleSignals.some((keyword) => socialTitle.includes(keyword))) {
    throw new Error(`${record.id}: social title must retain at least one approved source-title signal`);
  }
  const originalTitleJa = scalar(yaml, 'originalTitleJa');
  const translatedTitleZhTw = scalar(yaml, 'translatedTitleZhTw');
  if (originalTitleJa && originalTitleJa !== source.original_title_ja) throw new Error(`${record.id}: originalTitleJa must match source record`);
  if (translatedTitleZhTw && translatedTitleZhTw !== source.translated_title_zh_tw) throw new Error(`${record.id}: translatedTitleZhTw must match source record`);
  if (translatedTitleZhTw && !originalTitleJa) throw new Error(`${record.id}: translatedTitleZhTw requires originalTitleJa`);

  const tagIds = list(yaml, 'canonicalTagIds');
  const reviewEditorialTagIds = list(yaml, 'editorialTagIds');
  if (!tagIds.length) throw new Error(`${record.id}: at least one canonicalTagId is required`);
  if (tagIds.length > taxonomy.policy.max_visible_tags_per_review) throw new Error(`${record.id}: too many canonical tags`);
  for (const id of tagIds) {
    if (!knownTagIds.has(id)) throw new Error(`${record.id}: unknown canonical tag ID ${id}`);
  }
  for (const id of reviewEditorialTagIds) {
    if (!editorialTagIds.has(id)) throw new Error(`${record.id}: ${id} is not an editorial tag`);
  }

  for (const sourceTag of source.source_tags ?? []) {
    const handled = taxonomy.source_tag_map[sourceTag] || ignoredSourceTags.has(sourceTag) || candidateLabels.has(sourceTag);
    if (!handled) throw new Error(`${record.id}: unmapped source tag must enter data/tag-candidates.json: ${sourceTag}`);
  }

  if (quality.review_sha256 !== sha256(markdown)) throw new Error(`${record.id}: quality approval is stale; review hash changed`);
  if ((quality.evidence ?? []).length < policy.production.minimum_evidence_items) throw new Error(`${record.id}: insufficient source evidence`);
  if (!quality.approved_for_publish) throw new Error(`${record.id}: quality record is not approved`);
  if (quality.rewrite_attempts > policy.production.maximum_rewrite_attempts) throw new Error(`${record.id}: rewrite limit exceeded`);

  if (search.movie_id !== record.id) throw new Error(`${record.id}: search-content identity mismatch`);
  if (search.source_snapshot_hash !== `sha256:${sha256(sourceText)}`) throw new Error(`${record.id}: search-content source snapshot is stale`);
  if ((search.quick_decision?.thesis ?? '').length < 20) throw new Error(`${record.id}: missing quick decision`);
  if ((search.quick_decision?.presentation ?? []).length < 2) throw new Error(`${record.id}: insufficient presentation signals`);
  if ((search.audience_fit?.for ?? []).length < 2 || (search.audience_fit?.not_for ?? []).length < 2) throw new Error(`${record.id}: audience fit needs at least two positive and negative conditions`);
  if ((search.questions_answered ?? []).length < 3) throw new Error(`${record.id}: search content must answer at least three intents`);
  if (search.sample_windows > 0) {
    if ((search.timeline_summary ?? []).length !== 3) throw new Error(`${record.id}: sampled work requires opening, middle, and late timeline summaries`);
    const refs = search.timeline_summary.flatMap((item) => item.evidence_windows ?? []);
    if (refs.some((index) => !Number.isInteger(index) || index < 0 || index >= search.sample_windows)) throw new Error(`${record.id}: invalid timeline evidence reference`);
  }
  const publishedIds = new Set(published.map(({id}) => id));
  for (const recommendation of search.recommendations ?? []) {
    if (recommendation.movie_id === record.id || !publishedIds.has(recommendation.movie_id)) throw new Error(`${record.id}: invalid recommendation target ${recommendation.movie_id}`);
    if ((recommendation.reason ?? '').length < 20) throw new Error(`${record.id}: recommendation reason is too short`);
    if (!(recommendation.shared_signals ?? []).length || !(recommendation.contrast_signals ?? []).length) throw new Error(`${record.id}: recommendation requires shared and contrast signals`);
  }

  const scores = quality.scores ?? {};
  const gate = policy.publication_gate;
  const thresholds = {
    overall: gate.minimum_overall,
    source_fidelity: gate.minimum_source_fidelity,
    specificity: gate.minimum_specificity,
    originality: gate.minimum_originality,
    decision_value: gate.minimum_decision_value,
    ...(scores.search_value === undefined ? {} : {search_value: gate.minimum_search_value}),
  };
  for (const [dimension, minimum] of Object.entries(thresholds)) {
    if (scores[dimension] < minimum) throw new Error(`${record.id}: ${dimension} ${scores[dimension]} is below ${minimum}`);
  }

  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
  approvedReviews.push({id: record.id, displayTitle, body});
}

const shingles = (text, size = 4) => {
  const normalized = text.replace(/[`#*_>\s\p{P}\p{S}]/gu, '');
  return new Set(Array.from({length: Math.max(0, normalized.length - size + 1)}, (_, index) => normalized.slice(index, index + size)));
};

const similarity = (left, right) => {
  const a = shingles(left);
  const b = shingles(right);
  const intersection = [...a].filter((value) => b.has(value)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
};

for (let left = 0; left < approvedReviews.length; left += 1) {
  for (let right = left + 1; right < approvedReviews.length; right += 1) {
    const a = approvedReviews[left];
    const b = approvedReviews[right];
    if (a.displayTitle === b.displayTitle) throw new Error(`${a.id}/${b.id}: duplicate display title`);
    const score = similarity(a.body, b.body);
    if (score > 0.55) throw new Error(`${a.id}/${b.id}: review body similarity ${score.toFixed(3)} exceeds 0.55`);
  }
}

const reviewDirectory = new URL('content/reviews/', root);
const reviewFiles = (await readdir(reviewDirectory)).filter((name) => name.endsWith('.md'));
console.log(`Content valid: ${published.length} published review(s), ${reviewFiles.length} total review file(s).`);
