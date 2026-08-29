import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {resolveInternalWorkHref} from './work-url.mjs';

const root = resolve(process.cwd());
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

const loadPublishedMovieCardRecords = async () => {
  const [index, taxonomy] = await Promise.all([
    readJson('data/movie-master/index.json'),
    readJson('data/taxonomy.json'),
  ]);
  const tagLabels = new Map((taxonomy.tags ?? []).map(({id, label}) => [id, label]));
  const records = [];
  const exclusions = [];

  for (const entry of index.entries ?? []) {
    const master = await readJson(entry.master_path);
    const title = cardTitle(master);
    const href = resolveInternalWorkHref(master.publishing?.canonical_url, master.slug);
    const qualifies = Boolean(
      entry.is_published === true
      && master.publishing?.is_published === true
      && entry.is_demo !== true
      && master.is_demo !== true
      && master.publishing?.indexability === 'INDEX'
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

    const canonicalTopicTagIds = (master.derived?.canonical_topic_tag_ids ?? [])
      .filter((id) => typeof id === 'string' && tagLabels.has(id))
      .slice(0, 2);

    records.push({
      published_at: master.publishing?.published_at ?? null,
      remotion_promo_ref: clean(master.media?.remotion_promo_ref),
      card: {
        stable_movie_id: String(master.stable_movie_id),
        source_cover: String(master.source.source_cover),
        title: String(title),
        catalog_code: String(master.source.catalog_code),
        release_date: clean(master.source.release_date),
        performers: (master.display?.performers ?? []).map(({display_name: displayName}) => clean(displayName)).filter(Boolean),
        canonical_topics: canonicalTopicTagIds.map((id) => ({id, label: tagLabels.get(id)})),
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
