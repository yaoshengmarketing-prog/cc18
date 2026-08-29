import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPublishedMovieCardCatalog} from '../src/lib/movie-master.mjs';
import {searchableAliasNames} from '../src/lib/catalog-search.mjs';
import {parsePerformerStableId} from '../src/lib/performer-url.mjs';
import {buildPerformerLocalizationMap} from '../src/lib/performer-localization-policy.mjs';
import {
  validateCanonicalMovieIdentity,
  validateCanonicalMovieMasterIndexEntries,
  validateCanonicalMovieMasterIndexEntry,
  validateMovieMasterAgainstIndexEntry,
} from '../src/lib/movie-master-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const outputPath = resolve(root, 'data/search-index-v1.json');
const readText = (path) => readFile(resolve(root, path), 'utf8');
const readJson = async (path) => JSON.parse(await readText(path));
const clean = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

export const buildSearchLocalizationMap = (localization) => {
  return buildPerformerLocalizationMap(localization);
};

export const validateSearchDisplayPerformers = (performers, catalogCode) => {
  const ids = (performers ?? []).map((performer) => {
    parsePerformerStableId(performer.source_actor_id);
    return performer.source_actor_id;
  });
  for (const [index, id] of ids.entries()) {
    if (ids.indexOf(id) !== index) throw new Error(`${catalogCode}: duplicate Search performer ID ${id}`);
  }
  return ids;
};

export const validateCanonicalSearchMovieIdentity = validateCanonicalMovieIdentity;
export const validateCanonicalSearchIndexEntryIdentity = validateCanonicalMovieMasterIndexEntry;

export const validateSearchIndexEntryMaster = ({entry, master}) => {
  const identity = validateMovieMasterAgainstIndexEntry(entry, master);
  if (entry.is_demo !== (master.is_demo === true)
    || entry.is_published !== (master.publishing?.is_published === true)) {
    throw new Error(`${identity.catalogCode}: Movie Master index publication identity mismatch`);
  }
  return identity;
};

export const validateSearchPerformerProjection = (master, catalogCode) => {
  if (!Array.isArray(master.source?.performer_relations)) {
    throw new Error(`${catalogCode}: typed performer relations must be an array`);
  }
  if (!Array.isArray(master.display?.performers)) {
    throw new Error(`${catalogCode}: display performers must be an array`);
  }
  const relationIds = master.source.performer_relations.map((relation) => {
    if (relation?.source_type !== 'actor') throw new Error(`${catalogCode}: non-actor typed performer relation`);
    parsePerformerStableId(relation.stable_source_id);
    return relation.stable_source_id;
  });
  const displayIds = validateSearchDisplayPerformers(master.display.performers, catalogCode);
  if (relationIds.length !== displayIds.length
    || relationIds.some((id, index) => id !== displayIds[index])) {
    throw new Error(`${catalogCode}: typed performer relations and display performers differ in identity, order or multiplicity`);
  }
  return displayIds;
};

export const validateSearchMasterAuthority = ({entry, card, master}) => {
  const {catalogCode} = validateSearchIndexEntryMaster({entry, master});
  validateCanonicalSearchMovieIdentity({
    stableMovieId: card?.stable_movie_id,
    catalogCode: card?.catalog_code,
    label: `${catalogCode} card`,
  });
  if (entry.stable_movie_id !== card.stable_movie_id || entry.catalog_code !== card.catalog_code) {
    throw new Error(`${catalogCode}: Search index entry, card and Movie Master identity mismatch`);
  }
  if (entry.is_published !== true || entry.is_demo === true || master.is_demo === true
    || master.publishing?.is_published !== true || master.publishing?.indexability !== 'INDEX') {
    throw new Error(`${catalogCode}: public card is not backed by an eligible Movie Master`);
  }
  return validateSearchPerformerProjection(master, catalogCode);
};

export const validateSearchAuthorityBijection = ({bindings, cards}) => {
  if (!Array.isArray(bindings) || !Array.isArray(cards)) throw new Error('Search authority bindings and cards must be arrays');
  const cardsById = new Map();
  const cardCodes = new Set();
  for (const card of cards) {
    validateCanonicalSearchMovieIdentity({
      stableMovieId: card?.stable_movie_id,
      catalogCode: card?.catalog_code,
      label: 'Published MovieCard projection',
    });
    if (cardsById.has(card.stable_movie_id) || cardCodes.has(card.catalog_code)) {
      throw new Error(`Duplicate published MovieCard identity: ${card.stable_movie_id} / ${card.catalog_code}`);
    }
    cardsById.set(card.stable_movie_id, card);
    cardCodes.add(card.catalog_code);
  }
  const seenEntryIds = new Set();
  const seenEntryCodes = new Set();
  const seenMasterPaths = new Set();
  const result = [];
  for (const binding of bindings) {
    const {entry, master} = binding;
    const identity = validateSearchIndexEntryMaster({entry, master});
    if (seenEntryIds.has(identity.stableMovieId) || seenEntryCodes.has(identity.catalogCode)
      || seenMasterPaths.has(identity.masterPath)) {
      throw new Error(`Duplicate public Movie Master authority: ${identity.stableMovieId} / ${identity.masterPath}`);
    }
    seenEntryIds.add(identity.stableMovieId);
    seenEntryCodes.add(identity.catalogCode);
    seenMasterPaths.add(identity.masterPath);
    const card = cardsById.get(identity.stableMovieId);
    if (!card) throw new Error(`${identity.catalogCode}: public Movie Master has no matching card`);
    validateSearchMasterAuthority({entry, card, master});
    result.push({...binding, card});
  }
  const consumedIds = new Set(result.map(({entry}) => entry.stable_movie_id));
  const extraCards = [...cardsById.keys()].filter((id) => !consumedIds.has(id));
  if (result.length !== cards.length || extraCards.length > 0) {
    throw new Error(`Public Movie Master/card sets are not bijective; extra cards: ${extraCards.join(', ') || 'none'}`);
  }
  return result;
};

export const validateSearchIndexEntries = (entries) => {
  return validateCanonicalMovieMasterIndexEntries(entries);
};

export async function loadSearchAuthorityBindings(movieIndex, cardCatalog, {loadMaster = readJson} = {}) {
  validateSearchIndexEntries(movieIndex?.entries);
  if (!Array.isArray(cardCatalog?.cards)) throw new Error('Published MovieCard catalog cards must be an array');
  const loaded = [];
  for (const entry of movieIndex.entries) {
    const master = await loadMaster(entry.master_path);
    const identity = validateSearchIndexEntryMaster({entry, master});
    if (entry.is_published === true && entry.is_demo !== true
      && master.publishing?.indexability === 'INDEX') {
      validateSearchPerformerProjection(master, identity.catalogCode);
      loaded.push({entry, master});
    }
  }
  return validateSearchAuthorityBijection({bindings: loaded, cards: cardCatalog.cards});
}

export async function buildSearchIndex() {
  const [movieIndexText, localizationText, taxonomyText] = await Promise.all([
    readText('data/movie-master/index.json'),
    readText('data/localization/performers-zh-tw.json'),
    readText('data/taxonomy.json'),
  ]);
  const movieIndex = JSON.parse(movieIndexText);
  validateSearchIndexEntries(movieIndex.entries);
  const cardCatalog = await loadPublishedMovieCardCatalog();
  const localization = JSON.parse(localizationText);
  const taxonomy = JSON.parse(taxonomyText);
  const authorityBindings = await loadSearchAuthorityBindings(movieIndex, cardCatalog);
  const localizedById = buildSearchLocalizationMap(localization);
  const taxonomyLabels = new Map(taxonomy.tags.map(({id, label}) => [id, label]));
  const performerMap = new Map();
  const movies = [];

  for (const {entry, master, card} of authorityBindings) {
    const performerIds = validateSearchMasterAuthority({entry, card, master});
    const displayPerformers = master.display.performers;
    for (const [index, performer] of displayPerformers.entries()) {
      const stableActorId = performerIds[index];
      const localized = localizedById.get(stableActorId);
      if (!localized) throw new Error(`${entry.catalog_code}: missing performer localization for ${stableActorId}`);
      const expectedDisplayName = clean(localized.display_name_zh_tw) ?? clean(localized.name_ja) ?? clean(localized.source_name);
      if (!expectedDisplayName || performer.display_name !== expectedDisplayName) {
        throw new Error(`${entry.catalog_code}: performer display projection mismatch for ${stableActorId}`);
      }
      const current = performerMap.get(stableActorId) ?? {
        stable_actor_id: stableActorId,
        display_name: clean(performer.display_name),
        display_name_zh_tw: clean(localized.display_name_zh_tw),
        name_ja: clean(localized.name_ja),
        source_name: clean(localized.source_name),
        searchable_aliases: searchableAliasNames(localized.aliases),
        related_movie_ids: [],
      };
      current.related_movie_ids.push(master.stable_movie_id);
      performerMap.set(stableActorId, current);
    }

    const topicIds = (master.derived?.canonical_topic_tag_ids ?? []).filter((id) => taxonomyLabels.has(id));
    movies.push({
      card: {...card, canonical_topics: topicIds.map((id) => ({id, label: taxonomyLabels.get(id)}))},
      performer_ids: performerIds,
      search: {
        source_title: clean(master.source?.source_title),
        article_title: clean(master.titles?.article_title),
        display_short_title: clean(master.titles?.display_short_title),
        slug: clean(master.slug),
      },
    });
  }

  if (movies.length !== movieIndex.published_count) {
    throw new Error(`Search index expected ${movieIndex.published_count} published eligible movies, received ${movies.length}`);
  }
  movies.sort((left, right) => (right.card.release_date ?? '').localeCompare(left.card.release_date ?? '')
    || left.card.catalog_code.localeCompare(right.card.catalog_code, 'en'));
  const performers = [...performerMap.values()].map((performer) => ({
    ...performer,
    related_movie_ids: [...new Set(performer.related_movie_ids)],
  })).sort((left, right) => left.display_name.localeCompare(right.display_name, 'zh-Hant')
    || left.stable_actor_id.localeCompare(right.stable_actor_id, 'en'));
  const sourceRevision = createHash('sha256').update(movieIndexText).update(localizationText).update(taxonomyText).digest('hex');

  return {
    schema_version: '1.0.0',
    source_revision: `sha256:${sourceRevision}`,
    source_generated_at: movieIndex.generated_at,
    counts: {
      movies: movies.length,
      performers: performers.length,
      excluded_formal_drafts: movieIndex.formal_draft_count,
      excluded_demos: movieIndex.demo_count,
    },
    performers,
    movies,
  };
}

async function main() {
  const mode = process.argv[2] ?? '--write';
  const payload = await buildSearchIndex();
  const next = stableJson(payload);
  let current = null;
  try { current = await readFile(outputPath, 'utf8'); } catch {}
  if (mode === '--write') {
    if (current !== next) await writeFile(outputPath, next);
    console.log(`Search index write complete: ${payload.counts.movies} movie(s), ${payload.counts.performers} performer(s), ${current === next ? 0 : 1} file(s) changed.`);
    return;
  }
  if (mode === '--check') {
    if (current !== next) throw new Error('data/search-index-v1.json is stale; run npm run search-index:build');
    console.log(`Search index check passed: ${payload.counts.movies} movie(s), ${payload.counts.performers} performer(s).`);
    return;
  }
  if (mode === '--report') {
    console.log(JSON.stringify(payload.counts, null, 2));
    return;
  }
  throw new Error(`Unknown mode: ${mode}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
