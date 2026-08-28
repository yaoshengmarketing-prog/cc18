import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPublishedMovieCardCatalog} from '../src/lib/movie-master.mjs';
import {searchableAliasNames} from '../src/lib/catalog-search.mjs';

const root = resolve(import.meta.dirname, '..');
const outputPath = resolve(root, 'data/search-index-v1.json');
const readText = (path) => readFile(resolve(root, path), 'utf8');
const readJson = async (path) => JSON.parse(await readText(path));
const clean = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

export async function buildSearchIndex() {
  const [movieIndexText, localizationText, taxonomyText, cardCatalog] = await Promise.all([
    readText('data/movie-master/index.json'),
    readText('data/localization/performers-zh-tw.json'),
    readText('data/taxonomy.json'),
    loadPublishedMovieCardCatalog(),
  ]);
  const movieIndex = JSON.parse(movieIndexText);
  const localization = JSON.parse(localizationText);
  const taxonomy = JSON.parse(taxonomyText);
  const cardsById = new Map(cardCatalog.cards.map((card) => [card.stable_movie_id, card]));
  const localizedById = new Map(localization.performers.map((performer) => [performer.source_actor_id, performer]));
  const taxonomyLabels = new Map(taxonomy.tags.map(({id, label}) => [id, label]));
  const performerMap = new Map();
  const movies = [];

  for (const entry of movieIndex.entries ?? []) {
    const card = cardsById.get(entry.stable_movie_id);
    if (!card) continue;
    const master = await readJson(entry.master_path);
    if (entry.is_published !== true || entry.is_demo === true || master.is_demo === true
      || master.publishing?.is_published !== true || master.publishing?.indexability !== 'INDEX') continue;

    const performerIds = [];
    for (const performer of master.display?.performers ?? []) {
      const stableActorId = clean(performer.source_actor_id);
      const localized = localizedById.get(stableActorId);
      if (!stableActorId || !localized) throw new Error(`${entry.catalog_code}: missing performer localization for ${stableActorId ?? 'unknown'}`);
      performerIds.push(stableActorId);
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
      performer_ids: [...new Set(performerIds)],
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
