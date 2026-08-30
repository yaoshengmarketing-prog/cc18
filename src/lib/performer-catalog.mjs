import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadPublishedMovieCardCatalog} from './movie-master.mjs';
import {
  parsePerformerSourceUrl,
  parsePerformerStableId,
  performerHref,
  performerRouteSegment,
  performerStableIdFromSourceId,
} from './performer-url.mjs';
import {buildPerformerLocalizationMap} from './performer-localization-policy.mjs';
import {
  validateCanonicalMovieIdentity,
  validateCanonicalMovieMasterIndexEntries,
  validateCanonicalMovieMasterIndexEntry,
  validateMovieMasterAgainstIndexEntry,
} from './movie-master-identity.mjs';
import {resolveProjectRoot} from './project-root.mjs';

const root = resolveProjectRoot();
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));

const requireText = (value, label) => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value;
};

const assertUniqueMovieIds = (masters) => {
  const rawIds = [];
  for (const master of masters) {
    const code = master.source?.catalog_code ?? 'unknown catalog';
    const id = master.stable_movie_id;
    validateCanonicalMovieIdentity({stableMovieId: id, catalogCode: code, label: code});
    rawIds.push([id, code]);
  }
  const seen = new Map();
  for (const [id, code] of rawIds) {
    if (seen.has(id)) throw new Error(`Duplicate stable_movie_id ${id}: ${seen.get(id)} and ${code}`);
    seen.set(id, code);
  }
};

const assertUniquePerformerRecords = (records, idKey, label) => {
  const ids = [];
  for (const record of records) {
    const id = record?.[idKey];
    parsePerformerStableId(id);
    ids.push(id);
  }
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate ${label} performer ID ${id}`);
    seen.add(id);
  }
};

const sameOrderedValues = (actual, expected) => (
  actual.length === expected.length && actual.every((value, index) => value === expected[index])
);

const sameUniqueValues = (actual, expected, label) => {
  if (!Array.isArray(actual)) throw new Error(`${label} must be an array`);
  for (const [position, value] of actual.entries()) {
    if (actual.indexOf(value) !== position) throw new Error(`${label} contains duplicate ${value}`);
  }
  return actual.length === expected.length && actual.every((value) => expected.includes(value));
};

export const performerIndexDecision = (publicWorkCount) => {
  if (!Number.isInteger(publicWorkCount) || publicWorkCount < 1) {
    throw new Error('Performer records require at least one public work');
  }
  return publicWorkCount >= 2
    ? {decision: 'INDEX_READY', reason: 'HAS_MULTIPLE_PUBLIC_WORKS'}
    : {decision: 'NOINDEX_THIN', reason: 'ONLY_ONE_PUBLIC_WORK'};
};

export const addPerformerMetadataIdentityLabels = (performers) => {
  const normalizedCounts = new Map();
  for (const performer of performers) {
    const normalized = requireText(
      performer.primary_display_name,
      `${performer.stable_performer_id} primary display name`,
    ).normalize('NFKC');
    normalizedCounts.set(normalized, (normalizedCounts.get(normalized) ?? 0) + 1);
  }
  return performers.map((performer) => ({
    ...performer,
    metadata_identity_label: normalizedCounts.get(performer.primary_display_name.normalize('NFKC')) > 1
      ? `${performer.primary_display_name}（${performer.stable_performer_id}）`
      : performer.primary_display_name,
  }));
};

export const validatePublicPerformerIndexEntry = (card, entry, master) => {
  const entryIdentity = validateCanonicalMovieMasterIndexEntry(entry);
  const cardIdentity = validateCanonicalMovieIdentity({
    stableMovieId: card?.stable_movie_id,
    catalogCode: card?.catalog_code,
    label: card?.catalog_code ?? 'Public performer card',
  });
  if (entryIdentity.stableMovieId !== cardIdentity.stableMovieId
    || entryIdentity.catalogCode !== cardIdentity.catalogCode) {
    throw new Error(`${card.catalog_code}: public card/index/Movie Master identity or canonical path mismatch`);
  }
  if (master !== undefined) validateMovieMasterAgainstIndexEntry(entry, master);
  return true;
};

export function buildPerformerCatalog({cards, masters, localization, searchIndex}) {
  if (!Array.isArray(cards) || !Array.isArray(masters)
    || !Array.isArray(localization?.performers) || !Array.isArray(searchIndex?.performers)) {
    throw new Error('Performer catalog inputs are incomplete');
  }

  assertUniqueMovieIds(cards.map((card) => ({stable_movie_id: card.stable_movie_id, source: {catalog_code: card.catalog_code}})));
  assertUniquePerformerRecords(localization.performers, 'source_actor_id', 'localization');
  assertUniquePerformerRecords(searchIndex.performers, 'stable_actor_id', 'Search');
  const publicMasters = cards.map((card) => {
    const matches = masters.filter(({stable_movie_id: id}) => id === card.stable_movie_id);
    if (matches.length !== 1) throw new Error(`Public card ${card.catalog_code} requires exactly one matching Movie Master`);
    const master = matches[0];
    if (master.source?.catalog_code !== card.catalog_code) throw new Error(`${card.catalog_code}: public card/Movie Master identity mismatch`);
    return master;
  });
  assertUniqueMovieIds(publicMasters);

  for (const master of publicMasters) {
    const code = master.source.catalog_code;
    const relations = master.source?.performer_relations ?? [];
    const display = master.display?.performers ?? [];
    if (!Array.isArray(relations) || !Array.isArray(display)) throw new Error(`${code}: performer projections must be arrays`);
    const relationIds = [];
    for (const relation of relations) {
      if (relation.source_type !== 'actor') throw new Error(`${code}: performer relation source_type must be actor`);
      requireText(relation.source_name, `${code} performer relation source_name`);
      const parsedUrl = parsePerformerSourceUrl(relation.source_url);
      const sourceId = parsedUrl.sourceId;
      if (relation.source_id !== sourceId) throw new Error(`${code}: performer relation source ID mismatch`);
      const expectedStableId = performerStableIdFromSourceId(sourceId);
      parsePerformerStableId(relation.stable_source_id);
      if (relation.stable_source_id !== expectedStableId) throw new Error(`${code}: performer relation identity mismatch ${relation.stable_source_id}`);
      if (parsedUrl.stableId !== relation.stable_source_id) {
        throw new Error(`${code}: performer relation URL/identity mismatch ${relation.stable_source_id}`);
      }
      relationIds.push(relation.stable_source_id);
    }
    const relationSeen = new Set();
    for (const id of relationIds) {
      if (relationSeen.has(id)) throw new Error(`${code}: duplicate typed performer relation ${id}`);
      relationSeen.add(id);
    }
    const displayIds = display.map(({source_actor_id: id}) => {
      parsePerformerStableId(id);
      return id;
    });
    if (!sameOrderedValues(displayIds, relationIds)) throw new Error(`${code}: display performer order/identity differs from typed relations`);
  }

  const localizationById = buildPerformerLocalizationMap(localization);
  const searchById = new Map(searchIndex.performers.map((record) => [record.stable_actor_id, record]));
  const masterById = new Map(publicMasters.map((master) => [master.stable_movie_id, master]));
  const performerWorks = new Map();
  const typedWorkIds = [];
  const rawOnlyWorkIds = [];
  const noPerformerDataWorkIds = [];

  for (const card of cards) {
    const master = masterById.get(card.stable_movie_id);
    const relations = master.source.performer_relations;
    const display = master.display.performers;
    if (!relations.length) {
      if ((master.source.raw_performer_names ?? []).length) rawOnlyWorkIds.push(card.stable_movie_id);
      else noPerformerDataWorkIds.push(card.stable_movie_id);
      continue;
    }
    typedWorkIds.push(card.stable_movie_id);
    for (const [index, relation] of relations.entries()) {
      const id = relation.stable_source_id;
      const localized = localizationById.get(id);
      if (!localized) throw new Error(`${master.source.catalog_code}: typed performer ${id} is absent from localization`);
      if (localized.source_name !== relation.source_name) throw new Error(`${master.source.catalog_code}: source performer name mismatch for ${id}`);
      const primary = localized.primary_display_name;
      requireText(primary, `${id} primary display name`);
      const actualDisplay = display[index];
      const expectedDisplay = {
        source_actor_id: id,
        name_ja: localized.name_ja,
        display_name_zh_tw: localized.display_name_zh_tw,
        display_name: primary,
        verification_status: localized.verification_status,
      };
      for (const [field, expected] of Object.entries(expectedDisplay)) {
        if (actualDisplay[field] !== expected) throw new Error(`${master.source.catalog_code}: display performer ${field} mismatch for ${id}`);
      }
      const works = performerWorks.get(id) ?? [];
      works.push(card);
      performerWorks.set(id, works);
    }
  }

  const relationIds = [...performerWorks.keys()];
  const searchIds = searchIndex.performers.map(({stable_actor_id: id}) => id);
  const missingSearchIds = relationIds.filter((id) => !searchIds.includes(id));
  const extraSearchIds = searchIds.filter((id) => !relationIds.includes(id));
  if (missingSearchIds.length || extraSearchIds.length) {
    throw new Error(`Search performer projection mismatch; missing=${missingSearchIds.join(',') || 'none'} extra=${extraSearchIds.join(',') || 'none'}`);
  }

  const performers = [];
  for (const id of relationIds) {
    const localized = localizationById.get(id);
    const search = searchById.get(id);
    const primaryDisplayName = localized.primary_display_name;
    if (search.display_name !== primaryDisplayName
      || search.display_name_zh_tw !== localized.display_name_zh_tw
      || search.name_ja !== localized.name_ja
      || search.source_name !== localized.source_name) {
      throw new Error(`${id}: Search performer names differ from approved localization`);
    }
    const searchableAliases = localized.aliases.filter(({searchable}) => searchable === true)
      .map(({schema_eligible: _schemaEligible, ...alias}) => ({...alias}));
    const searchableAliasNames = searchableAliases.map(({name}) => name);
    if (!sameOrderedValues(search.searchable_aliases ?? [], searchableAliasNames)) {
      throw new Error(`${id}: Search aliases differ from approved localization`);
    }
    const publicWorks = performerWorks.get(id);
    const relatedMovieIds = publicWorks.map(({stable_movie_id: movieId}) => movieId);
    if (!sameUniqueValues(search.related_movie_ids, relatedMovieIds, `${id} Search related works`)) {
      throw new Error(`${id}: Search related works differ from typed performer relations`);
    }
    const sourceTitleAliases = searchableAliases.filter(({type}) => type === 'SOURCE_TITLE_ALIAS');
    const schemaAlternateNames = localized.schema_alternate_names;
    const index = performerIndexDecision(publicWorks.length);
    performers.push({
      stable_performer_id: id,
      route_segment: performerRouteSegment(id),
      href: performerHref(id),
      primary_display_name: primaryDisplayName,
      display_name_zh_tw: localized.display_name_zh_tw,
      name_ja: localized.name_ja,
      source_name: localized.source_name,
      searchable_aliases: searchableAliases,
      source_title_aliases: sourceTitleAliases,
      schema_alternate_names: schemaAlternateNames,
      public_work_count: publicWorks.length,
      public_works: publicWorks,
      index_decision: index.decision,
      index_reason: index.reason,
    });
  }

  const performersWithMetadata = addPerformerMetadataIdentityLabels(performers);
  performersWithMetadata.sort((left, right) => (
    left.primary_display_name.localeCompare(right.primary_display_name, 'zh-Hant')
    || left.stable_performer_id.localeCompare(right.stable_performer_id, 'en')
  ));
  const performerById = new Map(performersWithMetadata.map((performer) => [performer.stable_performer_id, performer]));
  const orderedPerformersByWork = publicMasters.map((master) => ({
    stable_movie_id: master.stable_movie_id,
    performers: master.source.performer_relations.map(({stable_source_id: id}) => {
      const performer = performerById.get(id);
      if (!performer) throw new Error(`${master.source.catalog_code}: ordered performer ${id} is absent from catalog`);
      return {
        stable_performer_id: performer.stable_performer_id,
        primary_display_name: performer.primary_display_name,
        href: performer.href,
      };
    }),
  }));

  return {
    public_work_count: cards.length,
    typed_work_count: typedWorkIds.length,
    raw_only_work_count: rawOnlyWorkIds.length,
    no_performer_data_work_count: noPerformerDataWorkIds.length,
    typed_work_ids: typedWorkIds,
    raw_only_work_ids: rawOnlyWorkIds,
    no_performer_data_work_ids: noPerformerDataWorkIds,
    performers: performersWithMetadata,
    ordered_performers_by_work: orderedPerformersByWork,
  };
}

export async function loadPerformerCatalog({
  loadCardCatalog = loadPublishedMovieCardCatalog,
  loadIndex = () => readJson('data/movie-master/index.json'),
  loadLocalization = () => readJson('data/localization/performers-zh-tw.json'),
  loadSearchIndex = () => readJson('data/search-index-v1.json'),
  loadMaster = readJson,
} = {}) {
  const [cardCatalog, index, localization, searchIndex] = await Promise.all([
    loadCardCatalog(),
    loadIndex(),
    loadLocalization(),
    loadSearchIndex(),
  ]);
  const cards = cardCatalog.cards;
  const allEntries = index.entries ?? [];
  validateCanonicalMovieMasterIndexEntries(allEntries);
  const bindings = cards.map((card) => {
    const matches = allEntries.filter(({stable_movie_id: id}) => id === card.stable_movie_id);
    if (matches.length !== 1) throw new Error(`Public card ${card.catalog_code} requires exactly one index entry`);
    const entry = matches[0];
    validatePublicPerformerIndexEntry(card, entry);
    return {card, entry};
  });
  const masters = await Promise.all(bindings.map(async ({card, entry}) => {
    const master = await loadMaster(entry.master_path);
    validatePublicPerformerIndexEntry(card, entry, master);
    return master;
  }));
  return buildPerformerCatalog({cards, masters, localization, searchIndex});
}
