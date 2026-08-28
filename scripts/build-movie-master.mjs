import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCHEMA_VERSION = '1.0.0';
const GENERATOR_VERSION = '1.0.1';
const SITE_URL = 'https://cc18.pages.dev';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(root, 'data', 'movie-master');

const fail = (message) => {
  throw new Error(message);
};

const fromRepoPath = (value) => join(root, ...value.split('/'));
const uniqueSorted = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const gitLines = (args) => {
  const output = execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
  return output ? output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
};

const trackedFiles = new Set(gitLines(['ls-files']).map((path) => path.replaceAll('\\', '/')));
const trackedReviewPaths = gitLines(['ls-files', 'content/reviews'])
  .map((path) => path.replaceAll('\\', '/'))
  .filter((path) => path.endsWith('.md'))
  .sort();
const untrackedReviewPaths = gitLines(['ls-files', '--others', '--exclude-standard', '--', 'content/reviews'])
  .map((path) => path.replaceAll('\\', '/'))
  .filter((path) => path.endsWith('.md'))
  .sort();

const assertTracked = (repoPath, context) => {
  if (!trackedFiles.has(repoPath)) fail(`${context} is not tracked by Git: ${repoPath}`);
};

const readTrackedText = async (repoPath, context) => {
  assertTracked(repoPath, context);
  return readFile(fromRepoPath(repoPath), 'utf8');
};

const readTrackedJson = async (repoPath, context) => JSON.parse(await readTrackedText(repoPath, context));

const parseScalar = (rawValue) => {
  const value = rawValue.trim();
  if (value === '' || value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      fail(`Unsupported quoted YAML scalar: ${value}`);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  return value;
};

const parseFrontmatter = (markdown, repoPath) => {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) fail(`${repoPath}: missing bounded YAML frontmatter`);
  const lines = match[1].split(/\r?\n/);
  const data = {};

  for (let index = 0; index < lines.length; index += 1) {
    const keyMatch = lines[index].match(/^([A-Za-z][A-Za-z0-9_]*):(?:\s*(.*))?$/);
    if (!keyMatch) continue;
    const [, key, remainder = ''] = keyMatch;
    if (remainder.trim() !== '') {
      data[key] = remainder.trim() === '[]' ? [] : parseScalar(remainder);
      continue;
    }

    const values = [];
    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      const item = next.match(/^  -\s*(.*)$/);
      if (item) {
        values.push(parseScalar(item[1]));
        index += 1;
        continue;
      }
      if (next.trim() === '[]') {
        index += 1;
      }
      break;
    }
    data[key] = values;
  }

  return {data, body: match[2]};
};

const cleanScalar = (value) => {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim();
  return cleaned === '' ? null : cleaned;
};

const cleanArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map(cleanScalar).filter((item) => item !== null);
};

const normalizeCatalogCode = (value) => {
  const normalized = cleanScalar(value)?.normalize('NFKC').trim().toUpperCase() ?? null;
  if (!normalized) fail('Movie is missing catalog code');
  return normalized;
};

const normalizeSlug = (value) => cleanScalar(value)?.normalize('NFKC').trim().toLowerCase() ?? null;

const normalizeDate = (value) => {
  const cleaned = cleanScalar(value);
  if (!cleaned) return null;
  const match = cleaned.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/);
  if (!match) fail(`Invalid date value: ${cleaned}`);
  return match[1];
};

const normalizeText = (value) => {
  const lf = String(value ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const withoutTrailingWhitespace = lf.split('\n').map((line) => line.replace(/[\t ]+$/u, '')).join('\n');
  return `${withoutTrailingWhitespace.replace(/\n*$/u, '')}\n`;
};

const contentHash = ({articleTitle, seoTitle, shortReview, body}) => {
  const header = JSON.stringify({
    article_title: articleTitle ?? null,
    seo_title: seoTitle ?? null,
    short_review: shortReview ?? null,
  });
  return sha256(`${header}\n${normalizeText(body)}`);
};

const sourceSiteMovieId = (sourceUrl) => {
  if (!sourceUrl) return null;
  try {
    return cleanScalar(new URL(sourceUrl).searchParams.get('uuid'));
  } catch {
    fail(`Invalid source URL: ${sourceUrl}`);
  }
};

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

const findRemotionRef = (manifest, manifestPath) => {
  if (!manifest?.video?.public_path) return null;
  return `${manifestPath}#/video`;
};

const buildEvidenceRecord = async ({catalogCode, stableMovieId, trackedSearch}) => {
  const searchPath = `data/search-content/${catalogCode}.json`;
  const briefPath = `data/editorial-briefs/${catalogCode}.json`;
  const qualityPath = `data/review-quality/${catalogCode}.json`;
  const automatedQualityPath = `data/review-quality/${catalogCode}-automated.json`;
  const supportingRefs = [searchPath, briefPath, qualityPath, automatedQualityPath];

  // A Search Content file alone is ordinary editorial input. Evidence is
  // upgraded only when the complete, Git-tracked distributed-sample bundle is
  // present and its cross-file invariants pass below.
  if (!supportingRefs.every((path) => trackedFiles.has(path))) return [];

  const search = trackedSearch ?? await readTrackedJson(searchPath, `${catalogCode} Search Content`);
  const brief = await readTrackedJson(briefPath, `${catalogCode} Editorial Brief`);
  const quality = await readTrackedJson(qualityPath, `${catalogCode} QA`);
  const automatedQuality = await readTrackedJson(automatedQualityPath, `${catalogCode} automated QA`);
  const declaresDistributedSample = Boolean(
    cleanScalar(search.evidence_job_id)
    || cleanScalar(brief.video_analysis_job_id)
    || search.sample_windows > 0
    || brief.video_coverage?.sample_windows > 0
    || search.duration_seconds > 0
    || automatedQuality.metrics?.distinct_video_windows > 0,
  );
  if (!declaresDistributedSample) return [];

  for (const [label, record] of [['Search Content', search], ['Editorial Brief', brief], ['QA', quality], ['automated QA', automatedQuality]]) {
    if (normalizeCatalogCode(record.id ?? record.movie_id) !== catalogCode) fail(`${catalogCode}: ${label} identity mismatch`);
  }
  const jobId = cleanScalar(search.evidence_job_id);
  if (!jobId || jobId !== cleanScalar(brief.video_analysis_job_id)) fail(`${catalogCode}: evidence job ID mismatch`);
  if (!Number.isInteger(search.sample_windows) || search.sample_windows < 2
    || search.sample_windows !== brief.video_coverage?.sample_windows) {
    fail(`${catalogCode}: invalid sample-window coverage`);
  }
  if (!Number.isFinite(search.duration_seconds) || search.duration_seconds <= 0
    || search.duration_seconds !== brief.video_coverage?.timeline_end_seconds
    || !Number.isFinite(brief.video_coverage?.timeline_start_seconds)
    || brief.video_coverage.timeline_start_seconds < 0) {
    fail(`${catalogCode}: duration/coverage mismatch`);
  }
  if (!cleanScalar(search.source_snapshot_hash) || !cleanScalar(search.generated_at)
    || quality.approved_for_publish !== true || automatedQuality.passed !== true
    || !Number.isInteger(automatedQuality.metrics?.distinct_video_windows)
    || automatedQuality.metrics.distinct_video_windows < 2
    || automatedQuality.metrics.distinct_video_windows > search.sample_windows) {
    fail(`${catalogCode}: evidence QA is not valid`);
  }

  return [{
    evidence_id: `cc18:${catalogCode}:distributed-sample:${jobId}`,
    movie_id: stableMovieId,
    evidence_level: 'DISTRIBUTED_SAMPLE',
    evidence_status: 'VALID',
    source_media_kind: 'source_full_video',
    source_ref: null,
    source_identity_hash: cleanScalar(search.source_snapshot_hash),
    source_duration_seconds: search.duration_seconds,
    analysis_method: 'distributed_sampling',
    analyzed_by_type: 'hybrid',
    analyzed_at: cleanScalar(search.generated_at),
    coverage_summary: {
      sample_windows: search.sample_windows,
      timeline_start_seconds: brief.video_coverage.timeline_start_seconds,
      timeline_end_seconds: brief.video_coverage.timeline_end_seconds,
      average_confidence: search.average_confidence,
      distinct_validated_windows: automatedQuality.metrics.distinct_video_windows,
    },
    observation_summary: (search.timeline_summary ?? []).map(({phase, label, summary, evidence_windows: evidenceWindows}) => ({
      phase,
      label,
      summary,
      evidence_windows: evidenceWindows,
    })),
    validation_status: 'VALID',
    supporting_refs: supportingRefs,
  }];
};

const assertNoEmptyStrings = (value, path = 'master') => {
  if (typeof value === 'string' && value === '') fail(`${path}: empty strings are not allowed`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoEmptyStrings(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertNoEmptyStrings(item, `${path}.${key}`);
  }
};

const buildAll = async () => {
  if (!trackedReviewPaths.length) fail('No Git-tracked review inputs found');
  assertTracked('data/movie-registry.json', 'Registry');
  assertTracked('data/taxonomy.json', 'Taxonomy');
  const registry = await readTrackedJson('data/movie-registry.json', 'Registry');
  const taxonomy = await readTrackedJson('data/taxonomy.json', 'Taxonomy');
  const registryById = new Map((registry.records ?? []).map((record) => [record.id, record]));
  const taxonomyById = new Map((taxonomy.tags ?? []).map((tag) => [tag.id, tag]));
  const sourceTagMap = taxonomy.source_tag_map ?? {};
  const masters = [];

  for (const reviewPath of trackedReviewPaths) {
    const markdown = await readTrackedText(reviewPath, 'Review input');
    const {data: frontmatter, body} = parseFrontmatter(markdown, reviewPath);
    const catalogCode = normalizeCatalogCode(frontmatter.id ?? basename(reviewPath, '.md'));
    const expectedCatalogCode = normalizeCatalogCode(basename(reviewPath, '.md'));
    if (catalogCode !== expectedCatalogCode) fail(`${reviewPath}: frontmatter/catalog filename mismatch`);
    const slug = normalizeSlug(basename(reviewPath, '.md'));
    const stableMovieId = `cc18:${catalogCode}`;
    const isDemo = catalogCode === 'CC18-DEMO-001';
    const sourceRecordPath = `data/source-records/${catalogCode}.json`;
    let source = null;
    if (isDemo) {
      if (trackedFiles.has(sourceRecordPath)) source = await readTrackedJson(sourceRecordPath, `${catalogCode} Source Record`);
    } else {
      source = await readTrackedJson(sourceRecordPath, `${catalogCode} Source Record`);
      if (normalizeCatalogCode(source.id) !== catalogCode) fail(`${catalogCode}: Source Record identity mismatch`);
    }

    const contentStatus = cleanScalar(frontmatter.status);
    if (!['draft', 'published'].includes(contentStatus)) fail(`${catalogCode}: unsupported content status ${contentStatus}`);
    const isPublished = contentStatus === 'published';
    const registryRecord = registryById.get(catalogCode);
    if (isPublished && !registryRecord) fail(`${catalogCode}: published work is missing Registry record`);
    if (registryRecord) {
      const registryStatus = cleanScalar(registryRecord.review_status);
      if (contentStatus !== registryStatus) {
        fail(`${catalogCode}: Registry/content publication mismatch (${registryStatus}/${contentStatus})`);
      }
    }

    const sourceTags = cleanArray(source?.source_tags ?? frontmatter.sourceTags);
    const canonicalTopicTagIds = uniqueSorted(sourceTags.flatMap((rawTag) => {
      const tagId = sourceTagMap[rawTag];
      if (!tagId) return [];
      const tag = taxonomyById.get(tagId);
      if (!tag) fail(`${catalogCode}: source tag ${rawTag} maps to unknown taxonomy ID ${tagId}`);
      if (tagId === 'contrast-charm') return [];
      if (tag.group === 'editorial' && tagId !== 'story') return [];
      return [tagId];
    }));

    const qualityCodes = uniqueSorted(canonicalTopicTagIds.flatMap((tagId) => ({
      hd: ['HD_720P'],
      fhd: ['FHD_1080P'],
      'uhd-4k': ['UHD_4K'],
    })[tagId] ?? []));

    const searchPath = `data/search-content/${catalogCode}.json`;
    const trackedSearch = trackedFiles.has(searchPath) ? await readTrackedJson(searchPath, `${catalogCode} Search Content`) : null;
    const evidenceRecords = await buildEvidenceRecord({catalogCode, stableMovieId, trackedSearch});
    const evidenceLevel = isDemo ? 'UNKNOWN' : evidenceRecords.length ? 'DISTRIBUTED_SAMPLE' : 'PUBLIC_METADATA';
    const evidenceScope = isDemo ? 'UNKNOWN' : evidenceRecords.length ? 'DISTRIBUTED_VIDEO_SAMPLE' : 'SOURCE_TITLE_DESCRIPTION_TAGS';

    const manifestPath = `data/media-manifests/${catalogCode}.json`;
    const manifest = trackedFiles.has(manifestPath) ? await readTrackedJson(manifestPath, `${catalogCode} Media Manifest`) : null;
    const articleTitle = cleanScalar(frontmatter.title);
    const seoTitle = cleanScalar(frontmatter.seoTitle);
    const shortReview = cleanScalar(frontmatter.shortReview);
    const sourceTitle = cleanScalar(source?.title ?? frontmatter.sourceTitle);
    const translatedTitle = cleanScalar(source?.translated_title_zh_tw);
    const fallbackTitle = [null, translatedTitle, articleTitle, sourceTitle, catalogCode].find(Boolean);
    if (!fallbackTitle) fail(`${catalogCode}: no valid card-title fallback`);

    const legacyPublishedAt = !isPublished ? normalizeDate(frontmatter.publishedAt) : null;
    const publishedAt = isPublished ? normalizeDate(registryRecord.published_at) : null;
    if (isPublished && !publishedAt) fail(`${catalogCode}: published work is missing published_at`);

    const master = {
      schema_version: SCHEMA_VERSION,
      stable_movie_id: stableMovieId,
      slug,
      is_demo: isDemo,
      source: {
        catalog_code: catalogCode,
        source_title: sourceTitle,
        release_date: normalizeDate(source?.release_date ?? frontmatter.releaseDate),
        source_url: cleanScalar(source?.source_url ?? frontmatter.sourceUrl),
        source_site_movie_id: sourceSiteMovieId(source?.source_url ?? frontmatter.sourceUrl),
        public_description: cleanScalar(source?.description),
        source_cover: cleanScalar(source?.cover_source_url ?? frontmatter.coverUrl),
        raw_performer_names: cleanArray(source?.actress ?? frontmatter.actress),
        raw_studio_name: cleanScalar(source?.studio ?? frontmatter.studio),
        raw_series_names: cleanArray(Array.isArray(source?.series) ? source.series : source?.series ? [source.series] : frontmatter.series ? [frontmatter.series] : []),
        source_tags: sourceTags,
        source_record_ref: source ? sourceRecordPath : null,
        source_snapshot_ref: null,
        source_fetched_at: cleanScalar(source?.fetched_at),
        source_verified_at: null,
        source_parser_version: null,
      },
      titles: {
        article_title: articleTitle,
        translated_title_zh_tw: translatedTitle,
        display_short_title: null,
        seo_title: seoTitle,
      },
      derived: {
        quality_codes: qualityCodes,
        duration_seconds: evidenceRecords[0]?.source_duration_seconds ?? null,
        canonical_topic_tag_ids: canonicalTopicTagIds,
      },
      editorial: {
        one_line_summary: shortReview,
        article_ref: reviewPath,
        article_evidence_level: evidenceLevel,
        article_evidence_scope: evidenceScope,
      },
      media: {
        remotion_promo_ref: findRemotionRef(manifest, manifestPath),
      },
      evidence: {
        records: evidenceRecords,
      },
      publishing: {
        is_published: isPublished,
        published_at: publishedAt,
        canonical_url: isPublished ? `${SITE_URL}/reviews/${slug}/` : null,
        indexability: isPublished && !isDemo ? 'INDEX' : 'NOINDEX',
        content_hash: contentHash({articleTitle, seoTitle, shortReview, body}),
      },
      legacy: {
        legacy_published_at: legacyPublishedAt,
        legacy_published_at_semantics: legacyPublishedAt ? 'LEGACY_SEMANTICS_UNKNOWN' : null,
      },
    };

    if (!master.source.source_url || !master.source.source_cover) fail(`${catalogCode}: basic source URL/cover is missing`);
    if (isDemo && master.publishing.indexability !== 'NOINDEX') fail(`${catalogCode}: Demo must be NOINDEX`);
    if (!isPublished && (master.publishing.published_at || master.publishing.canonical_url || master.publishing.indexability !== 'NOINDEX')) {
      fail(`${catalogCode}: draft publishing projection is invalid`);
    }
    if (isPublished && (!master.publishing.canonical_url || master.publishing.indexability !== 'INDEX')) {
      fail(`${catalogCode}: published projection is invalid`);
    }
    if (!/^[a-f0-9]{64}$/u.test(master.publishing.content_hash)) fail(`${catalogCode}: invalid content hash`);
    assertNoEmptyStrings(master, catalogCode);
    masters.push(master);
  }

  const duplicate = (key, label) => {
    const seen = new Set();
    for (const master of masters) {
      const value = key(master);
      if (seen.has(value)) fail(`Duplicate ${label}: ${value}`);
      seen.add(value);
    }
  };
  duplicate((master) => master.stable_movie_id, 'stable movie ID');
  duplicate((master) => master.source.catalog_code, 'catalog code');
  duplicate((master) => master.slug, 'slug');

  masters.sort((left, right) => left.source.catalog_code.localeCompare(right.source.catalog_code, 'en'));
  const excludedUntrackedContentIds = untrackedReviewPaths.map((path) => normalizeCatalogCode(basename(path, '.md'))).sort();
  return {masters, excludedUntrackedContentIds};
};

const summaryFor = ({masters, excludedUntrackedContentIds}) => {
  const evidenceDistribution = {};
  for (const master of masters) {
    const level = master.editorial.article_evidence_level;
    evidenceDistribution[level] = (evidenceDistribution[level] ?? 0) + 1;
  }
  const demoCount = masters.filter((master) => master.is_demo).length;
  const publishedCount = masters.filter((master) => master.publishing.is_published).length;
  const draftCount = masters.length - publishedCount;
  const formalDraftCount = masters.filter((master) => !master.is_demo && !master.publishing.is_published).length;
  const isBasicCardEligible = (master) => {
    const title = master.titles.display_short_title ?? master.titles.translated_title_zh_tw ?? master.titles.article_title
      ?? master.source.source_title ?? master.source.catalog_code;
    return Boolean(master.stable_movie_id && master.slug && master.source.catalog_code && master.source.source_cover && title);
  };
  const basicCardEligible = masters.filter(isBasicCardEligible).length;
  return {
    tracked_movies: masters.length,
    formal_movies: masters.length - demoCount,
    demo_movies: demoCount,
    published_movies: publishedCount,
    draft_movies: draftCount,
    formal_draft_movies: formalDraftCount,
    evidence_distribution: Object.fromEntries(Object.entries(evidenceDistribution).sort()),
    basic_card_structurally_eligible: basicCardEligible,
    published_basic_card_eligible: masters.filter((master) => master.publishing.is_published && isBasicCardEligible(master)
      && master.publishing.canonical_url && master.publishing.indexability === 'INDEX').length,
    excluded_untracked_content_ids: excludedUntrackedContentIds,
  };
};

const outputForMaster = (master) => `data/movie-master/${master.slug}.json`;

const indexWithoutGeneratedAt = (masters) => {
  const summary = summaryFor({masters, excludedUntrackedContentIds: []});
  return {
    schema_version: SCHEMA_VERSION,
    generator_version: GENERATOR_VERSION,
    tracked_input_count: summary.tracked_movies,
    formal_movie_count: summary.formal_movies,
    demo_count: summary.demo_movies,
    published_count: summary.published_movies,
    formal_draft_count: summary.formal_draft_movies,
    draft_count: summary.draft_movies,
    entries: masters.map((master) => ({
      stable_movie_id: master.stable_movie_id,
      catalog_code: master.source.catalog_code,
      slug: master.slug,
      master_path: outputForMaster(master),
      is_demo: master.is_demo,
      is_published: master.publishing.is_published,
      content_hash: master.publishing.content_hash,
    })),
  };
};

const readExistingIndex = async () => {
  try {
    return JSON.parse(await readFile(join(outputDirectory, 'index.json'), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const buildIndex = async (masters) => {
  const stable = indexWithoutGeneratedAt(masters);
  const existing = await readExistingIndex();
  const {generated_at: previousGeneratedAt, ...previousStable} = existing ?? {};
  const unchanged = existing && JSON.stringify(previousStable) === JSON.stringify(stable);
  return {
    schema_version: stable.schema_version,
    generated_at: unchanged ? previousGeneratedAt : new Date().toISOString(),
    generator_version: stable.generator_version,
    tracked_input_count: stable.tracked_input_count,
    formal_movie_count: stable.formal_movie_count,
    demo_count: stable.demo_count,
    published_count: stable.published_count,
    formal_draft_count: stable.formal_draft_count,
    draft_count: stable.draft_count,
    entries: stable.entries,
  };
};

const expectedOutputs = async (result) => {
  const index = await buildIndex(result.masters);
  return new Map([
    ['data/movie-master/index.json', jsonText(index)],
    ...result.masters.map((master) => [outputForMaster(master), jsonText(master)]),
  ]);
};

const writeOutputs = async (outputs) => {
  await mkdir(outputDirectory, {recursive: true});
  const expectedNames = new Set([...outputs.keys()].map((path) => basename(path)));
  const existingNames = (await readdir(outputDirectory)).filter((name) => name.endsWith('.json'));
  const stale = existingNames.filter((name) => !expectedNames.has(name));
  if (stale.length) fail(`Unexpected Movie Master output(s); refusing to delete automatically: ${stale.join(', ')}`);

  let changed = 0;
  for (const [repoPath, text] of outputs) {
    const path = fromRepoPath(repoPath);
    let current = null;
    try {
      current = await readFile(path, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (current === text) continue;
    await writeFile(path, text, 'utf8');
    changed += 1;
  }
  return changed;
};

const checkOutputs = async (outputs) => {
  const issues = [];
  let existingNames = [];
  try {
    existingNames = (await readdir(outputDirectory)).filter((name) => name.endsWith('.json'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const expectedNames = new Set([...outputs.keys()].map((path) => basename(path)));
  for (const name of existingNames) if (!expectedNames.has(name)) issues.push(`unexpected output: data/movie-master/${name}`);

  for (const [repoPath, expected] of outputs) {
    try {
      const actual = await readFile(fromRepoPath(repoPath), 'utf8');
      if (actual !== expected) issues.push(`out of date: ${repoPath}`);
    } catch (error) {
      if (error?.code === 'ENOENT') issues.push(`missing: ${repoPath}`);
      else throw error;
    }
  }
  if (issues.length) fail(`Movie Master check failed:\n- ${issues.join('\n- ')}`);
};

const help = () => {
  console.log(`Usage: node scripts/build-movie-master.mjs <mode>\n\nModes:\n  --write   Build or update tracked Movie Master JSON files\n  --check   Regenerate in memory and compare without writing\n  --report  Print a read-only summary without writing\n\nNo mode never writes files.`);
};

const mode = process.argv[2];
if (!mode) {
  help();
  process.exit(0);
}
if (!['--write', '--check', '--report'].includes(mode) || process.argv.length !== 3) {
  help();
  process.exitCode = 2;
} else {
  try {
    const result = await buildAll();
    const summary = summaryFor(result);
    if (mode === '--report') {
      console.log(jsonText(summary).trimEnd());
    } else {
      const outputs = await expectedOutputs(result);
      if (mode === '--write') {
        const changed = await writeOutputs(outputs);
        console.log(`Movie Master write complete: ${result.masters.length} master(s), ${changed} file(s) changed.`);
      } else {
        await checkOutputs(outputs);
        console.log(`Movie Master check passed: ${result.masters.length} master(s), ${outputs.size} output file(s) current.`);
      }
      console.log(jsonText(summary).trimEnd());
    }
  } catch (error) {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  }
}
