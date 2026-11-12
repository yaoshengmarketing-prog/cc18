import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {resolveInternalWorkHref} from './work-url.mjs';
import {
  validateCanonicalMovieMasterIndexEntries,
  validateMovieMasterAgainstIndexEntry,
} from './movie-master-identity.mjs';
import {resolveProjectRoot} from './project-root.mjs';

const root = resolveProjectRoot();
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const clean = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const promoRefPattern = /^data\/media-manifests\/([A-Z0-9-]+)\.json#\/video$/u;
const internalVideoPattern = /^\/media\/works\/\d{4}\/\d{2}\/[A-Z0-9-]+\/[A-Z0-9._-]+\.mp4$/iu;
const internalImagePattern = /^\/media\/works\/\d{4}\/\d{2}\/[A-Z0-9-]+\/[A-Z0-9._-]+\.(?:avif|jpe?g|png|webp)$/iu;
const isValidDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const cardTitle = (master) => [
  master.titles?.display_short_title,
  master.titles?.translated_title_zh_tw,
  master.titles?.article_title,
  master.source?.source_title,
  master.source?.catalog_code,
].map(clean).find(Boolean) ?? null;

const evidenceError = (catalogCode, message) => new Error(`${catalogCode ?? 'Published work'}: ${message}`);
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const isPublicMaster = (entry, master) => (
  entry.is_published === true
  && master.publishing?.is_published === true
  && entry.is_demo !== true
  && master.is_demo !== true
  && master.publishing?.indexability === 'INDEX'
);

export const projectMovieMasterEvidence = ({master, searchContent}) => {
  const catalogCode = master?.source?.catalog_code;
  const stableMovieId = master?.stable_movie_id;
  if (typeof catalogCode !== 'string' || !catalogCode) throw evidenceError(catalogCode, 'Evidence projection requires catalog_code');
  if (stableMovieId !== `cc18:${catalogCode}`) throw evidenceError(catalogCode, 'Evidence stable_movie_id does not match catalog_code');
  if (!searchContent || searchContent.movie_id !== catalogCode) throw evidenceError(catalogCode, 'Search Content identity does not match Movie Master');

  const evidenceLevel = master.editorial?.article_evidence_level;
  const evidenceScope = master.editorial?.article_evidence_scope;
  const records = master.evidence?.records;
  if (!Array.isArray(records)) throw evidenceError(catalogCode, 'evidence.records must be an array');

  if (evidenceLevel === 'PUBLIC_METADATA') {
    if (evidenceScope !== 'SOURCE_TITLE_DESCRIPTION_TAGS') {
      throw evidenceError(catalogCode, 'PUBLIC_METADATA requires SOURCE_TITLE_DESCRIPTION_TAGS scope');
    }
    if (records.length !== 0) throw evidenceError(catalogCode, 'PUBLIC_METADATA must not contain Evidence records');
    if (searchContent.evidence_job_id !== null && searchContent.evidence_job_id !== undefined) {
      throw evidenceError(catalogCode, 'PUBLIC_METADATA Search Content must not declare an Evidence job');
    }
    if (searchContent.sample_windows !== 0 && searchContent.sample_windows !== null) {
      throw evidenceError(catalogCode, 'PUBLIC_METADATA Search Content must use 0 or null sample_windows');
    }
    if (searchContent.timeline_summary !== null
      && searchContent.timeline_summary !== undefined
      && (!Array.isArray(searchContent.timeline_summary) || searchContent.timeline_summary.length !== 0)) {
      throw evidenceError(catalogCode, 'PUBLIC_METADATA Search Content must not contain a timeline');
    }
    return {
      stable_movie_id: stableMovieId,
      catalog_code: catalogCode,
      href: master.publishing?.canonical_url,
      evidence_level: evidenceLevel,
      evidence_scope: evidenceScope,
      sample_windows: null,
      timeline: [],
    };
  }

  if (evidenceLevel !== 'DISTRIBUTED_SAMPLE') throw evidenceError(catalogCode, `unsupported Evidence level ${evidenceLevel}`);
  if (evidenceScope !== 'DISTRIBUTED_VIDEO_SAMPLE') {
    throw evidenceError(catalogCode, 'DISTRIBUTED_SAMPLE requires DISTRIBUTED_VIDEO_SAMPLE scope');
  }
  if (records.length !== 1) throw evidenceError(catalogCode, 'DISTRIBUTED_SAMPLE requires exactly one Evidence record');

  const [record] = records;
  if (record.movie_id !== stableMovieId) throw evidenceError(catalogCode, 'Evidence record movie_id does not match Movie Master');
  if (record.evidence_level !== evidenceLevel) throw evidenceError(catalogCode, 'Evidence record level does not match Movie Master');
  if (record.evidence_status !== 'VALID' || record.validation_status !== 'VALID') {
    throw evidenceError(catalogCode, 'distributed Evidence record must be VALID');
  }
  if (record.analysis_method !== 'distributed_sampling') {
    throw evidenceError(catalogCode, 'distributed Evidence record must use distributed_sampling');
  }
  const sampleWindows = record.coverage_summary?.sample_windows;
  if (!Number.isInteger(sampleWindows) || sampleWindows <= 0) {
    throw evidenceError(catalogCode, 'distributed Evidence sample_windows must be a positive integer');
  }
  if (typeof searchContent.evidence_job_id !== 'string' || !searchContent.evidence_job_id
    || searchContent.evidence_job_id !== searchContent.evidence_job_id.trim()) {
    throw evidenceError(catalogCode, 'distributed Search Content requires a canonical Evidence job ID');
  }
  if (record.evidence_id !== `cc18:${catalogCode}:distributed-sample:${searchContent.evidence_job_id}`) {
    throw evidenceError(catalogCode, 'Search Content Evidence job does not match Evidence record');
  }
  if (typeof record.source_identity_hash !== 'string'
    || searchContent.source_snapshot_hash !== record.source_identity_hash) {
    throw evidenceError(catalogCode, 'Search Content source hash does not match Evidence record');
  }
  if (searchContent.sample_windows !== sampleWindows) {
    throw evidenceError(catalogCode, 'Search Content sample_windows does not match Evidence record');
  }
  const timeline = record.observation_summary;
  if (!Array.isArray(timeline) || !Array.isArray(searchContent.timeline_summary)
    || !sameJson(searchContent.timeline_summary, timeline)) {
    throw evidenceError(catalogCode, 'Search Content timeline does not match Evidence record');
  }
  for (const item of timeline) {
    if (!['opening', 'middle', 'late'].includes(item?.phase)
      || typeof item.label !== 'string' || !item.label
      || typeof item.summary !== 'string' || !item.summary
      || !Array.isArray(item.evidence_windows) || item.evidence_windows.length === 0
      || item.evidence_windows.some((index) => !Number.isInteger(index) || index < 0 || index >= sampleWindows)) {
      throw evidenceError(catalogCode, 'Evidence record contains an invalid timeline observation');
    }
  }

  return {
    stable_movie_id: stableMovieId,
    catalog_code: catalogCode,
    href: master.publishing?.canonical_url,
    evidence_level: evidenceLevel,
    evidence_scope: evidenceScope,
    sample_windows: sampleWindows,
    timeline: timeline.map((item) => ({...item, evidence_windows: [...item.evidence_windows]})),
  };
};

export const loadPublishedWorkEvidenceCatalog = async ({
  loadIndex = () => readJson('data/movie-master/index.json'),
  loadMaster = readJson,
  loadSearchContent = readJson,
} = {}) => {
  const index = await loadIndex();
  validateCanonicalMovieMasterIndexEntries(index?.entries);
  const records = [];
  for (const entry of index.entries ?? []) {
    const master = await loadMaster(entry.master_path);
    validateMovieMasterAgainstIndexEntry(entry, master);
    if (!isPublicMaster(entry, master)) continue;
    const catalogCode = master.source.catalog_code;
    const searchContent = await loadSearchContent(`data/search-content/${catalogCode}.json`);
    records.push(projectMovieMasterEvidence({master, searchContent}));
  }
  return {records};
};

export const loadPublishedMovieCardRecords = async ({
  loadIndex = () => readJson('data/movie-master/index.json'),
  loadTaxonomy = () => readJson('data/taxonomy.json'),
  loadMaster = readJson,
} = {}) => {
  const [index, taxonomy] = await Promise.all([
    loadIndex(),
    loadTaxonomy(),
  ]);
  validateCanonicalMovieMasterIndexEntries(index?.entries);
  const tagLabels = new Map((taxonomy.tags ?? []).map(({id, label}) => [id, label]));
  const records = [];
  const exclusions = [];

  for (const entry of index.entries ?? []) {
    const master = await loadMaster(entry.master_path);
    validateMovieMasterAgainstIndexEntry(entry, master);
    const title = cardTitle(master);
    const href = resolveInternalWorkHref(master.publishing?.canonical_url, master.slug);
    const qualifies = Boolean(
      isPublicMaster(entry, master)
      && clean(master.stable_movie_id)
      && clean(master.slug)
      && clean(master.source?.catalog_code)
      && clean(master.source?.source_cover)
      && title
      && href,
    );

    if (!qualifies) {
      exclusions.push({
        stable_movie_id: master.stable_movie_id ?? entry.stable_movie_id ?? null,
        is_demo: master.is_demo === true || entry.is_demo === true,
        is_published: master.publishing?.is_published === true && entry.is_published === true,
      });
      continue;
    }

    const canonicalTopicTagIds = [...new Set(master.derived?.canonical_topic_tag_ids ?? [])]
      .filter((id) => typeof id === 'string' && tagLabels.has(id));

    records.push({
      published_at: master.publishing?.published_at ?? null,
      canonical_topic_tag_ids: canonicalTopicTagIds,
      remotion_promo_ref: clean(master.media?.remotion_promo_ref),
      card: {
        stable_movie_id: String(master.stable_movie_id),
        source_cover: String(master.source.source_cover),
        title: String(title),
        catalog_code: String(master.source.catalog_code),
        release_date: clean(master.source.release_date),
        performers: (master.display?.performers ?? []).map(({display_name: displayName}) => clean(displayName)).filter(Boolean),
        canonical_topics: canonicalTopicTagIds.slice(0, 2).map((id) => ({id, label: tagLabels.get(id)})),
        has_remotion_promo: Boolean(clean(master.media?.remotion_promo_ref)),
        href: String(href),
      },
    });
  }

  return {
    records,
    exclusions,
    index: {
      tracked_input_count: index.tracked_input_count,
      published_count: index.published_count,
      formal_draft_count: index.formal_draft_count,
      demo_count: index.demo_count,
    },
  };
};

const promoError = (record, message) => new Error(`${record.card?.catalog_code ?? 'Published work'}: ${message}`);

export const parseRemotionPromoRef = (record) => {
  const ref = clean(record.remotion_promo_ref);
  if (!ref) return null;
  const match = ref.match(promoRefPattern);
  if (!match) throw promoError(record, `invalid remotion_promo_ref ${ref}`);
  if (match[1] !== record.card.catalog_code) {
    throw promoError(record, `promo ref identifies ${match[1]}`);
  }
  return {manifestPath: ref.slice(0, ref.indexOf('#')), manifestId: match[1]};
};

const assertPromoRecordIds = (records) => {
  const seen = new Map();
  for (const record of records) {
    const stableMovieId = clean(record.card?.stable_movie_id);
    const catalogCode = clean(record.card?.catalog_code) ?? 'unknown catalog';
    if (!stableMovieId) throw promoError(record, 'stable_movie_id must be a non-empty string');
    if (seen.has(stableMovieId)) {
      throw new Error(`Duplicate promo stable_movie_id ${stableMovieId}: ${seen.get(stableMovieId)} and ${catalogCode}`);
    }
    seen.set(stableMovieId, catalogCode);
  }
};

export const projectPromoRecord = (record, manifest, manifestId) => {
  const {card} = record;
  if (manifest?.id !== manifestId || manifestId !== card.catalog_code) {
    throw promoError(record, `Media Manifest ID must equal ${card.catalog_code}`);
  }
  if (card.stable_movie_id !== `cc18:${card.catalog_code}`) {
    throw promoError(record, 'stable_movie_id and catalog_code contract disagree');
  }

  const video = manifest.video;
  if (video?.status !== 'rendered_and_uploaded') throw promoError(record, 'promo video is not rendered_and_uploaded');
  if (video.duration_seconds !== 9) throw promoError(record, 'promo video duration must be 9 seconds');
  if (video.width !== 1080 || video.height !== 1920) throw promoError(record, 'promo video must be 1080x1920');
  if (String(video.codec ?? '').toLowerCase() !== 'h264') throw promoError(record, 'promo video codec must be h264');
  if (!internalVideoPattern.test(video.public_path ?? '')) throw promoError(record, 'promo video public_path must be an internal mp4 path');
  if (!video.public_path.includes(`/${card.catalog_code}/`)) throw promoError(record, 'promo video public_path identifies another work');

  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const poster = ['vertical_scene', 'article_hero']
    .map((role) => assets.find((asset) => (
      asset?.role === role
      && internalImagePattern.test(asset.path ?? '')
      && asset.path.includes(`/${card.catalog_code}/`)
    )))
    .find(Boolean);
  if (!poster) throw promoError(record, 'promo poster requires an internal vertical_scene or article_hero image');

  return {
    stableMovieId: card.stable_movie_id,
    catalogCode: card.catalog_code,
    title: card.title,
    href: card.href,
    videoUrl: video.public_path,
    posterUrl: poster.path,
    durationSeconds: video.duration_seconds,
  };
};

export async function projectLatestAddedPromoRecords(records, {limit = 3, loadManifest = readJson} = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Promo catalog limit must be a positive integer');
  assertPromoRecordIds(records);
  const promos = [];
  for (const record of sortLatestAddedMovieCardRecords(records)) {
    const parsed = parseRemotionPromoRef(record);
    if (!parsed) continue;
    let manifest;
    try {
      manifest = await loadManifest(parsed.manifestPath);
    } catch (error) {
      throw promoError(record, `cannot read Media Manifest ${parsed.manifestPath}: ${error.message}`);
    }
    promos.push(projectPromoRecord(record, manifest, parsed.manifestId));
  }
  if (promos.length < limit) {
    throw new Error(`Promo catalog requires ${limit} qualified works; received ${promos.length}`);
  }
  return promos.slice(0, limit);
}

export const sortLatestAddedMovieCardRecords = (records) => {
  for (const {card, published_at: publishedAt} of records) {
    if (!isValidDate(publishedAt)) {
      throw new Error(`${card?.catalog_code ?? 'Published work'}: latest_added requires a valid published_at`);
    }
  }
  return [...records].sort((left, right) => (
    right.published_at.localeCompare(left.published_at)
    || left.card.catalog_code.localeCompare(right.card.catalog_code, 'en')
  ));
};

export async function loadPublishedMovieCardCatalog() {
  const catalog = await loadPublishedMovieCardRecords();
  const {records, ...metadata} = catalog;
  const cards = records.map(({card}) => card);
  cards.sort((left, right) => (
    (right.release_date ?? '').localeCompare(left.release_date ?? '')
    || left.catalog_code.localeCompare(right.catalog_code, 'en')
  ));

  return {...metadata, cards};
}

export async function loadLatestAddedMovieCardCatalog() {
  const catalog = await loadPublishedMovieCardRecords();
  const {records, ...metadata} = catalog;
  const cards = sortLatestAddedMovieCardRecords(records).map(({card}) => card);
  return {...metadata, cards};
}

export async function loadLatestAddedPromoCatalog({limit = 3} = {}) {
  const catalog = await loadPublishedMovieCardRecords();
  const {records, ...metadata} = catalog;
  const cards = await projectLatestAddedPromoRecords(records, {limit});
  return {...metadata, cards};
}
