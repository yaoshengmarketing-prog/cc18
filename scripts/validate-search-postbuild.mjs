import {existsSync} from 'node:fs';
import {readdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {load} from 'cheerio';
import {parsePerformerStableId} from '../src/lib/performer-url.mjs';
import {loadPublishedMovieCardCatalog} from '../src/lib/movie-master.mjs';
import {validateCanonicalMovieIdentity} from '../src/lib/movie-master-identity.mjs';
import {PUBLIC_SITE_ORIGIN} from '../src/lib/site-origin.mjs';

const validateSearchMovieIdentity = (stableMovieId, catalogCode, label) => (
  validateCanonicalMovieIdentity({stableMovieId, catalogCode, label})
);

export const validateSearchIndexCollections = (index, publicCards) => {
  if (!Array.isArray(index?.movies)) throw new Error('Search index movies must be an array');
  if (!Array.isArray(index?.performers)) throw new Error('Search index performers must be an array');
  if (!Number.isInteger(index?.counts?.movies) || index.movies.length !== index.counts.movies) {
    throw new Error('Search movie count does not match movies array');
  }
  if (!Number.isInteger(index?.counts?.performers) || index.performers.length !== index.counts.performers) {
    throw new Error('Search performer count does not match performers array');
  }
  if (!Array.isArray(publicCards)) throw new Error('Published Movie Master cards must be an array');
  const publicMovieMap = new Map();
  for (const card of publicCards) {
    const id = card?.stable_movie_id;
    const catalogCode = card?.catalog_code;
    validateSearchMovieIdentity(id, catalogCode, 'Published Movie Master card');
    if (publicMovieMap.has(id)) throw new Error(`Duplicate published Movie Master stable ID: ${id}`);
    publicMovieMap.set(id, catalogCode);
  }
  if (index.movies.length !== publicMovieMap.size) throw new Error('Search movie count differs from published Movie Master count');
  const ids = index.performers.map((performer) => {
    parsePerformerStableId(performer.stable_actor_id);
    return performer.stable_actor_id;
  });
  for (const [position, id] of ids.entries()) {
    if (ids.indexOf(id) !== position) throw new Error(`Duplicate search performer ID: ${id}`);
  }
  const expectedWorks = new Map(ids.map((id) => [id, []]));
  const movieStableIds = new Set();
  for (const movie of index.movies) {
    const movieId = movie.card?.stable_movie_id;
    validateSearchMovieIdentity(movieId, movie.card?.catalog_code, 'Search movie');
    if (movieStableIds.has(movieId)) throw new Error(`Duplicate Search movie ID: ${movieId}`);
    movieStableIds.add(movieId);
    if (!publicMovieMap.has(movieId)) throw new Error(`Extra or orphan Search movie ID: ${movieId}`);
    if (movie.card?.catalog_code !== publicMovieMap.get(movieId)) {
      throw new Error(`${movieId}: Search catalog code differs from published Movie Master`);
    }
    if (!Array.isArray(movie.performer_ids)) throw new Error(`${movie.card?.catalog_code ?? 'Search movie'}: performer_ids must be an array`);
    const movieIds = movie.performer_ids.map((id) => {
      parsePerformerStableId(id);
      return id;
    });
    for (const [position, id] of movieIds.entries()) {
      if (movieIds.indexOf(id) !== position) throw new Error(`${movie.card?.catalog_code ?? 'Search movie'}: duplicate performer ID ${id}`);
      if (!ids.includes(id)) throw new Error(`${movie.card?.catalog_code ?? 'Search movie'}: unknown performer ID ${id}`);
      expectedWorks.get(id).push(movieId);
    }
  }
  const missingMovieIds = [...publicMovieMap.keys()].filter((id) => !movieStableIds.has(id));
  if (missingMovieIds.length > 0) throw new Error(`Missing Search movie IDs: ${missingMovieIds.join(', ')}`);
  for (const performer of index.performers) {
    const id = performer.stable_actor_id;
    if (!Array.isArray(performer.related_movie_ids)) throw new Error(`${id}: related_movie_ids must be an array`);
    const related = performer.related_movie_ids;
    if (new Set(related).size !== related.length) throw new Error(`${id}: duplicate related work`);
    if (related.length === 0) throw new Error(`${id}: orphan performer`);
    if (related.some((movieId) => !movieStableIds.has(movieId))) throw new Error(`${id}: unknown related work`);
    const expected = expectedWorks.get(id);
    if (expected.length === 0) throw new Error(`${id}: orphan performer`);
    if (related.length !== expected.length || related.some((movieId) => !expected.includes(movieId))) {
      throw new Error(`${id}: related works are not bidirectional with movies`);
    }
  }
};

export const validateSearchPerformerIds = (performers, movies = []) => {
  if (!Array.isArray(performers)) throw new Error('Search performers must be an array');
  const ids = performers.map(({stable_actor_id: id}) => {
    parsePerformerStableId(id);
    return id;
  });
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate search performer ID');
  for (const movie of movies) {
    for (const id of movie.performer_ids ?? []) {
      parsePerformerStableId(id);
      if (!ids.includes(id)) throw new Error(`${movie.card?.catalog_code ?? 'Search movie'}: unknown performer ID ${id}`);
    }
  }
};

export async function validateSearchPostbuild() {
  const root = resolve(import.meta.dirname, '..');
  const dist = resolve(root, 'dist');
  const html = await readFile(resolve(dist, 'search', 'index.html'), 'utf8');
  const index = JSON.parse(await readFile(resolve(dist, 'search-index.json'), 'utf8'));
  const [movieMasterIndex, cardCatalog] = await Promise.all([
    readFile(resolve(root, 'data', 'movie-master', 'index.json'), 'utf8').then((text) => JSON.parse(text)),
    loadPublishedMovieCardCatalog(),
  ]);

  if (!html.includes('name="robots" content="noindex,follow"')) throw new Error('Search page robots contract is missing');
  if (!html.includes(`rel="canonical" href="${PUBLIC_SITE_ORIGIN}/search/"`)) throw new Error('Search page canonical is invalid');
  if (!html.includes('action="/search/"') || !html.includes('name="q"')) throw new Error('Search form query contract is missing');
  if (
    index.counts.movies !== movieMasterIndex.published_count
    || index.counts.excluded_formal_drafts !== movieMasterIndex.formal_draft_count
    || index.counts.excluded_demos !== movieMasterIndex.demo_count
  ) {
    throw new Error('Search index publication boundary is invalid');
  }
  validateSearchIndexCollections(index, cardCatalog.cards);
  let linkedSourceTags = 0;
  for (const movie of index.movies) {
    const workHtml = await readFile(resolve(dist, 'works', movie.search.slug, 'index.html'), 'utf8');
    const work = load(workHtml);
    const sourceItems = work('.source-tag-label').next('.tag-list').find('li');
    const expected = [...new Set((movie.search.source_tags ?? []).map((label) => label.normalize('NFKC').trim()))];
    const actual = sourceItems.map((_, item) => work(item).text().replace(/^#/, '').trim()).get();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${movie.card.catalog_code}: public source tags differ from Movie Master search projection`);
    }
    sourceItems.each((_, item) => {
      const href = work(item).find('a').attr('href');
      if (!/^\/tags\/[a-z0-9-]+\/$/.test(href ?? '') || !existsSync(resolve(dist, href.slice(1), 'index.html'))) {
        throw new Error(`${movie.card.catalog_code}: source tag has no working collection link: ${work(item).text()}`);
      }
      linkedSourceTags += 1;
    });
  }
  for (const file of (await readdir(dist)).filter((name) => /^sitemap-\d+\.xml$/.test(name))) {
    const sitemap = await readFile(resolve(dist, file), 'utf8');
    if (sitemap.includes('/search/')) throw new Error('Noindex search page remains in sitemap');
  }

  console.log(`Search postbuild valid: ${index.counts.movies} movies, ${index.counts.performers} performers, ${linkedSourceTags} source tag links, noindex canonical and sitemap exclusion passed.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateSearchPostbuild().catch((error) => { console.error(error.message); process.exit(1); });
}
