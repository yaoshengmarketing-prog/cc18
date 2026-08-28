import {readdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const html = await readFile(resolve(dist, 'search', 'index.html'), 'utf8');
const index = JSON.parse(await readFile(resolve(dist, 'search-index.json'), 'utf8'));
const movieMasterIndex = JSON.parse(await readFile(resolve(root, 'data', 'movie-master', 'index.json'), 'utf8'));

if (!html.includes('name="robots" content="noindex,follow"')) throw new Error('Search page robots contract is missing');
if (!html.includes('rel="canonical" href="https://cc18.pages.dev/search/"')) throw new Error('Search page canonical is invalid');
if (!html.includes('action="/search/"') || !html.includes('name="q"')) throw new Error('Search form query contract is missing');
if (
  index.counts.movies !== movieMasterIndex.published_count
  || index.counts.excluded_formal_drafts !== movieMasterIndex.formal_draft_count
  || index.counts.excluded_demos !== movieMasterIndex.demo_count
) {
  throw new Error('Search index publication boundary is invalid');
}
for (const performer of index.performers) {
  if (!/^cc18\.tv:actor:\d+$/.test(performer.stable_actor_id)) throw new Error(`Invalid search performer ID: ${performer.stable_actor_id}`);
}
for (const file of (await readdir(dist)).filter((name) => /^sitemap-\d+\.xml$/.test(name))) {
  const sitemap = await readFile(resolve(dist, file), 'utf8');
  if (sitemap.includes('/search/')) throw new Error('Noindex search page remains in sitemap');
}

console.log(`Search postbuild valid: ${index.counts.movies} movies, ${index.counts.performers} performers, noindex canonical and sitemap exclusion passed.`);
