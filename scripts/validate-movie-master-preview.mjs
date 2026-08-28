import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const html = await readFile(resolve(root, 'dist/preview/movie-master-cards/index.html'), 'utf8');
const sitemap = await readFile(resolve(root, 'dist/sitemap-0.xml'), 'utf8');
const index = await readJson('data/movie-master/index.json');
const masters = await Promise.all(index.entries.map(({master_path}) => readJson(master_path)));
const expectedPublished = masters.filter((master) => master.publishing?.is_published === true && master.is_demo !== true);
const expectedExcluded = masters.filter((master) => master.publishing?.is_published !== true || master.is_demo === true);
const expectedById = new Map(expectedPublished.map((master) => [master.stable_movie_id, master]));
const renderedCards = [...html.matchAll(/<article class="movie-card-v1" data-movie-id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)]
  .map((match) => ({stableMovieId: match[1], html: match[2]}));
const renderedIds = renderedCards.map(({stableMovieId}) => stableMovieId);

if (expectedPublished.length !== index.published_count) throw new Error('Movie Master index published_count disagrees with Master states');
if (expectedExcluded.length !== index.formal_draft_count + index.demo_count) throw new Error('Movie Master index exclusion counts disagree with Master states');
if (renderedCards.length !== index.published_count || new Set(renderedIds).size !== index.published_count) {
  throw new Error(`Expected ${index.published_count} unique cards, received ${renderedCards.length}`);
}
for (const master of expectedExcluded) {
  if (renderedIds.includes(master.stable_movie_id)) throw new Error(`Excluded Movie Master rendered: ${master.stable_movie_id}`);
}
for (const {stableMovieId, html: cardHtml} of renderedCards) {
  const master = expectedById.get(stableMovieId);
  if (!master) throw new Error(`Rendered card is not an eligible published Master: ${stableMovieId}`);
  const expectedPathname = new URL(master.publishing.canonical_url).pathname;
  if (expectedPathname !== `/reviews/${master.slug}/`) throw new Error(`Canonical pathname and slug disagree for ${stableMovieId}`);
  const cardLinks = [...cardHtml.matchAll(/href="(\/reviews\/[a-z0-9-]+\/)"/g)].map((match) => match[1]);
  if (cardLinks.length !== 2 || cardLinks.some((href) => href !== expectedPathname)) {
    throw new Error(`Cover and title links disagree with Movie Master for ${stableMovieId}`);
  }
}
if (!html.includes('name="robots" content="noindex,nofollow"')) throw new Error('Preview robots contract is missing');
if (sitemap.includes('/preview/movie-master-cards/')) throw new Error('Preview URL leaked into sitemap');
if (!html.includes('data-cover-fallback="/images/movie-cover-fallback.svg"')) throw new Error('Image fallback contract is missing');
if ((html.match(/\[data-cover-fallback\]/g) ?? []).length !== 1) throw new Error('MovieCardV1 fallback handler must be emitted exactly once');
if (html.includes('待補') || html.includes('演員資料待補')) throw new Error('Missing-value placeholder leaked into preview');

console.log(`Movie Master preview valid: ${renderedCards.length} cards, ${expectedExcluded.length} dynamic exclusions, one fallback handler, noindex and sitemap exclusion passed.`);
