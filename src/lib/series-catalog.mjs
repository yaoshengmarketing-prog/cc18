import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadPublishedMovieCardCatalog} from './movie-master.mjs';
import {
  validateCanonicalMovieIdentity,
  validateCanonicalMovieMasterIndexEntries,
  validateCanonicalMovieMasterIndexEntry,
  validateMovieMasterAgainstIndexEntry,
} from './movie-master-identity.mjs';
import {parseCc18SearchRelationUrl} from './performer-url.mjs';
import {resolveProjectRoot} from './project-root.mjs';
import {
  parseSeriesSourceId,
  parseSeriesStableId,
  seriesHref,
  seriesRouteSegment,
  seriesStableIdFromSourceId,
} from './series-identity.mjs';

export const SERIES_INDEX_MINIMUM_PUBLIC_WORKS = 3;

const root = resolveProjectRoot();
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const releaseDatePattern = /^\d{4}-\d{2}-\d{2}$/u;

const requireRawText = (value, label) => {
  if (typeof value !== 'string' || value === '' || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty canonical source string`);
  }
  return value;
};

const assertReleaseDate = (card) => {
  if (typeof card.release_date !== 'string' || !releaseDatePattern.test(card.release_date)
    || Number.isNaN(Date.parse(`${card.release_date}T00:00:00Z`))) {
    throw new Error(`${card.catalog_code}: series work requires a valid release_date`);
  }
};

export const seriesIndexDecision = (publicWorkCount) => {
  if (!Number.isInteger(publicWorkCount) || publicWorkCount < 1) {
    throw new Error('Series records require at least one public work');
  }
  return publicWorkCount >= SERIES_INDEX_MINIMUM_PUBLIC_WORKS
    ? {decision: 'INDEX_READY', reason: 'HAS_AT_LEAST_THREE_PUBLIC_WORKS'}
    : {decision: 'NOINDEX_THIN', reason: 'HAS_FEWER_THAN_THREE_PUBLIC_WORKS'};
};

export const validatePublicSeriesIndexEntry = (card, entry, master) => {
  const entryIdentity = validateCanonicalMovieMasterIndexEntry(entry);
  const cardIdentity = validateCanonicalMovieIdentity({
    stableMovieId: card?.stable_movie_id,
    catalogCode: card?.catalog_code,
    label: card?.catalog_code ?? 'Public series card',
  });
  if (entryIdentity.stableMovieId !== cardIdentity.stableMovieId
    || entryIdentity.catalogCode !== cardIdentity.catalogCode) {
    throw new Error(`${card.catalog_code}: public card/index/Movie Master identity or canonical path mismatch`);
  }
  if (master !== undefined) validateMovieMasterAgainstIndexEntry(entry, master);
  return true;
};

const validateSeriesRelation = ({master, card, seriesNamesById}) => {
  const code = card.catalog_code;
  const relations = master.source?.series_relations;
  const rawNames = master.source?.raw_series_names;
  if (!Array.isArray(relations) || !Array.isArray(rawNames)) {
    throw new Error(`${code}: public Movie Master requires explicit series relation and raw name arrays`);
  }
  if (relations.length > 1) throw new Error(`${code}: multiple series identities are not allowed`);
  if (rawNames.length !== relations.length) throw new Error(`${code}: typed series/raw series name count mismatch`);
  if (relations.length === 0) return null;

  const relation = relations[0];
  const sourceId = parseSeriesSourceId(relation?.source_id);
  const stableSeriesId = relation?.stable_source_id;
  parseSeriesStableId(stableSeriesId);
  if (relation?.source_type !== 'series' || stableSeriesId !== seriesStableIdFromSourceId(sourceId)) {
    throw new Error(`${code}: invalid series relation identity`);
  }
  const sourceName = requireRawText(relation.source_name, `${code} series source_name`);
  if (rawNames[0] !== sourceName) throw new Error(`${code}: typed series/raw series name mismatch`);
  const parsedUrl = parseCc18SearchRelationUrl(relation.source_url);
  if (parsedUrl.sourceType !== 'series' || parsedUrl.sourceId !== sourceId) {
    throw new Error(`${code}: series relation URL/identity mismatch`);
  }
  if (typeof relation.observed_at !== 'string' || Number.isNaN(Date.parse(relation.observed_at))) {
    throw new Error(`${code}: invalid series observed_at`);
  }
  const priorName = seriesNamesById.get(stableSeriesId);
  if (priorName !== undefined && priorName !== sourceName) {
    throw new Error(`${code}: series identity ${stableSeriesId} has conflicting source names`);
  }
  seriesNamesById.set(stableSeriesId, sourceName);
  return {sourceId, stableSeriesId, sourceName};
};

export function buildSeriesCatalog({cards, masters}) {
  if (!Array.isArray(cards) || !Array.isArray(masters)) throw new Error('Series catalog inputs are incomplete');
  const cardIds = new Set();
  const cardCodes = new Set();
  for (const card of cards) {
    validateCanonicalMovieIdentity({stableMovieId: card?.stable_movie_id, catalogCode: card?.catalog_code});
    if (cardIds.has(card.stable_movie_id) || cardCodes.has(card.catalog_code)) {
      throw new Error(`Duplicate public series work identity: ${card.stable_movie_id}`);
    }
    cardIds.add(card.stable_movie_id);
    cardCodes.add(card.catalog_code);
    assertReleaseDate(card);
  }

  const mastersById = new Map();
  for (const master of masters) {
    const identity = validateCanonicalMovieIdentity({
      stableMovieId: master?.stable_movie_id,
      catalogCode: master?.source?.catalog_code,
      label: master?.source?.catalog_code ?? 'Series Movie Master',
    });
    if (mastersById.has(identity.stableMovieId)) throw new Error(`Duplicate series Movie Master ${identity.stableMovieId}`);
    mastersById.set(identity.stableMovieId, master);
  }
  if (mastersById.size !== cards.length || [...cardIds].some((id) => !mastersById.has(id))) {
    throw new Error('Public card and series Movie Master sets are not an exact bijection');
  }

  const seriesNamesById = new Map();
  const seriesById = new Map();
  const orderedSeriesByWork = [];
  for (const card of cards) {
    const master = mastersById.get(card.stable_movie_id);
    const validated = validateSeriesRelation({master, card, seriesNamesById});
    const workSeries = [];
    if (validated) {
      const {sourceId, stableSeriesId, sourceName} = validated;
      let series = seriesById.get(stableSeriesId);
      if (!series) {
        series = {
          stable_series_id: stableSeriesId,
          source_id: sourceId,
          source_name: sourceName,
          display_name: sourceName,
          route_segment: seriesRouteSegment(stableSeriesId),
          href: seriesHref(stableSeriesId),
          public_works: [],
        };
        seriesById.set(stableSeriesId, series);
      }
      series.public_works.push(card);
      workSeries.push({
        stable_series_id: stableSeriesId,
        source_name: sourceName,
        display_name: sourceName,
        href: series.href,
      });
    }
    orderedSeriesByWork.push({
      stable_movie_id: card.stable_movie_id,
      catalog_code: card.catalog_code,
      href: card.href,
      series: workSeries,
    });
  }

  const normalizedNameCounts = new Map();
  for (const series of seriesById.values()) {
    const normalizedName = series.display_name.normalize('NFKC');
    normalizedNameCounts.set(normalizedName, (normalizedNameCounts.get(normalizedName) ?? 0) + 1);
  }
  const series = [...seriesById.values()].map((record) => {
    record.public_works.sort((left, right) => (
      right.release_date.localeCompare(left.release_date)
      || left.catalog_code.localeCompare(right.catalog_code, 'en')
    ));
    const index = seriesIndexDecision(record.public_works.length);
    return {
      ...record,
      metadata_identity_label: normalizedNameCounts.get(record.display_name.normalize('NFKC')) > 1
        ? `${record.display_name}（${record.stable_series_id}）`
        : record.display_name,
      public_work_count: record.public_works.length,
      index_decision: index.decision,
      index_reason: index.reason,
    };
  }).sort((left, right) => (
    left.display_name.localeCompare(right.display_name, 'ja')
    || left.stable_series_id.localeCompare(right.stable_series_id, 'en')
  ));

  return {
    series,
    ordered_series_by_work: orderedSeriesByWork,
    counts: {
      public_works: cards.length,
      stable_series: series.length,
      thin_series: series.filter(({index_decision: decision}) => decision === 'NOINDEX_THIN').length,
      index_ready_series: series.filter(({index_decision: decision}) => decision === 'INDEX_READY').length,
    },
  };
}

export async function loadSeriesCatalog({
  loadCardCatalog = loadPublishedMovieCardCatalog,
  loadIndex = () => readJson('data/movie-master/index.json'),
  loadMaster = readJson,
} = {}) {
  const [cardCatalog, index] = await Promise.all([loadCardCatalog(), loadIndex()]);
  validateCanonicalMovieMasterIndexEntries(index?.entries);
  const entriesById = new Map((index.entries ?? []).map((entry) => [entry.stable_movie_id, entry]));
  const masters = [];
  for (const card of cardCatalog.cards ?? []) {
    const entry = entriesById.get(card.stable_movie_id);
    if (!entry) throw new Error(`${card.catalog_code}: public series card has no Movie Master index entry`);
    validatePublicSeriesIndexEntry(card, entry);
    const master = await loadMaster(entry.master_path);
    validatePublicSeriesIndexEntry(card, entry, master);
    masters.push(master);
  }
  const catalog = buildSeriesCatalog({cards: cardCatalog.cards, masters});
  return {...catalog, index: cardCatalog.index, exclusions: cardCatalog.exclusions};
}
