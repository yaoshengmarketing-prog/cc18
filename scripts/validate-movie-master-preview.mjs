import {access, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {workPath} from '../src/lib/work-url.mjs';

const root = resolve(import.meta.dirname, '..');
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const html = await readFile(resolve(root, 'dist/preview/movie-master-cards/index.html'), 'utf8');
const homeHtml = await readFile(resolve(root, 'dist/index.html'), 'utf8');
const latestHtml = await readFile(resolve(root, 'dist/latest/index.html'), 'utf8');
const sitemap = await readFile(resolve(root, 'dist/sitemap-0.xml'), 'utf8');
const redirects = await readFile(resolve(root, 'dist/_redirects'), 'utf8');
const index = await readJson('data/movie-master/index.json');
const masters = await Promise.all(index.entries.map(({master_path}) => readJson(master_path)));
const expectedPublished = masters.filter((master) => master.publishing?.is_published === true && master.is_demo !== true);
const expectedExcluded = masters.filter((master) => master.publishing?.is_published !== true || master.is_demo === true);
const expectedById = new Map(expectedPublished.map((master) => [master.stable_movie_id, master]));
const renderedCards = [...html.matchAll(/<article class="movie-card-v1" data-movie-id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)]
  .map((match) => ({stableMovieId: match[1], html: match[2]}));
const renderedIds = renderedCards.map(({stableMovieId}) => stableMovieId);
const renderedById = new Map(renderedCards.map((card) => [card.stableMovieId, card]));
const homeCards = [...homeHtml.matchAll(/<article class="movie-card-v1" data-movie-id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)]
  .map((match) => ({stableMovieId: match[1], html: match[2]}));
const homeIds = homeCards.map(({stableMovieId}) => stableMovieId);
const homeCatalogCodes = homeCards.map(({html: cardHtml}) => (
  cardHtml.match(/<div class="movie-card-v1__identity"[^>]*><p[^>]*>([^<]+)<\/p>/)?.[1]
));
const latestCards = [...latestHtml.matchAll(/<article class="movie-card-v1" data-movie-id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)]
  .map((match) => ({stableMovieId: match[1], html: match[2]}));
const latestIds = latestCards.map(({stableMovieId}) => stableMovieId);
const pathExists = async (path) => access(path).then(() => true, () => false);
const expectedRedirects = '/reviews/:slug/ /works/:slug/ 301\n/reviews/:slug /works/:slug/ 301\n';

if (redirects.replaceAll('\r\n', '\n') !== expectedRedirects) throw new Error('Cloudflare work redirect contract is missing or changed');
if (redirects.includes('/works/:slug/ /reviews/')) throw new Error('Reverse work redirect would create a loop');

if (expectedPublished.length !== index.published_count) throw new Error('Movie Master index published_count disagrees with Master states');
if (expectedExcluded.length !== index.formal_draft_count + index.demo_count) throw new Error('Movie Master index exclusion counts disagree with Master states');
if (renderedCards.length !== index.published_count || new Set(renderedIds).size !== index.published_count) {
  throw new Error(`Expected ${index.published_count} unique cards, received ${renderedCards.length}`);
}
if (latestCards.length !== index.published_count || new Set(latestIds).size !== index.published_count) {
  throw new Error(`Latest expected ${index.published_count} unique cards, received ${latestCards.length}`);
}
if (homeCards.length !== index.published_count || new Set(homeIds).size !== index.published_count) {
  throw new Error(`Homepage expected ${index.published_count} unique cards, received ${homeCards.length}`);
}
if (homeCatalogCodes.some((catalogCode) => !catalogCode) || new Set(homeCatalogCodes).size !== index.published_count) {
  throw new Error('Homepage catalog codes are missing or duplicated');
}
if (latestIds.join('\n') !== renderedIds.join('\n')) {
  throw new Error('Latest card order differs from the neutral Movie Master catalog preview');
}
if (homeIds.join('\n') !== renderedIds.join('\n') || homeIds.join('\n') !== latestIds.join('\n')) {
  throw new Error('Homepage card order differs from the neutral Movie Master catalog and Latest');
}
for (const master of expectedExcluded) {
  if (renderedIds.includes(master.stable_movie_id)) throw new Error(`Excluded Movie Master rendered: ${master.stable_movie_id}`);
  if (homeIds.includes(master.stable_movie_id)) throw new Error(`Excluded Movie Master rendered on homepage: ${master.stable_movie_id}`);
  if (latestIds.includes(master.stable_movie_id)) throw new Error(`Excluded Movie Master rendered on Latest: ${master.stable_movie_id}`);
}
for (const {stableMovieId, html: cardHtml} of renderedCards) {
  const master = expectedById.get(stableMovieId);
  if (!master) throw new Error(`Rendered card is not an eligible published Master: ${stableMovieId}`);
  const expectedPathname = new URL(master.publishing.canonical_url).pathname;
  if (expectedPathname !== workPath(master.slug)) throw new Error(`Canonical pathname and slug disagree for ${stableMovieId}`);
  const cardLinks = [...cardHtml.matchAll(/href="(\/works\/[a-z0-9-]+\/)"/g)].map((match) => match[1]);
  if (cardLinks.length !== 2 || cardLinks.some((href) => href !== expectedPathname)) {
    throw new Error(`Cover and title links disagree with Movie Master for ${stableMovieId}`);
  }

  const workHtmlPath = resolve(root, 'dist', 'works', master.slug, 'index.html');
  const legacyHtmlPath = resolve(root, 'dist', 'reviews', master.slug, 'index.html');
  if (!await pathExists(workHtmlPath)) throw new Error(`Published work page is missing: ${expectedPathname}`);
  if (await pathExists(legacyHtmlPath)) throw new Error(`Legacy review page still renders content: /reviews/${master.slug}/`);
  const workHtml = await readFile(workHtmlPath, 'utf8');
  const canonical = workHtml.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (canonical !== master.publishing.canonical_url) throw new Error(`Rendered canonical disagrees with Movie Master for ${stableMovieId}`);
  const jsonText = workHtml.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!jsonText) throw new Error(`Structured data is missing for ${stableMovieId}`);
  const structured = JSON.parse(jsonText);
  const records = Array.isArray(structured) ? structured : [structured];
  const breadcrumb = records.find((record) => record['@type'] === 'BreadcrumbList');
  const article = records.find((record) => record['@type'] === 'Article');
  const video = records.find((record) => record['@type'] === 'VideoObject');
  if (breadcrumb?.itemListElement?.at(-1)?.item !== canonical) throw new Error(`Breadcrumb URL is stale for ${stableMovieId}`);
  if (article?.mainEntityOfPage !== canonical) throw new Error(`Article mainEntityOfPage is stale for ${stableMovieId}`);
  if (video && video.embedUrl !== canonical) throw new Error(`VideoObject embedUrl is stale for ${stableMovieId}`);
  if (!sitemap.includes(`<loc>${canonical}</loc>`)) throw new Error(`Published work is missing from sitemap: ${canonical}`);
}
for (const {stableMovieId, html: cardHtml} of latestCards) {
  const master = expectedById.get(stableMovieId);
  if (!master) throw new Error(`Latest card is not an eligible published Master: ${stableMovieId}`);
  const expectedPathname = new URL(master.publishing.canonical_url).pathname;
  const cardLinks = [...cardHtml.matchAll(/href="(\/works\/[a-z0-9-]+\/)"/g)].map((match) => match[1]);
  if (cardLinks.length !== 2 || cardLinks.some((href) => href !== expectedPathname)) {
    throw new Error(`Latest cover and title links disagree for ${stableMovieId}`);
  }
  const previewCard = renderedById.get(stableMovieId);
  if (!previewCard) throw new Error(`Latest card is missing from the neutral preview: ${stableMovieId}`);
  const previewHasPromo = previewCard.html.includes('9秒選片');
  const latestHasPromo = cardHtml.includes('9秒選片');
  if (latestHasPromo !== previewHasPromo) {
    throw new Error(`Latest and preview promo marker states disagree for ${stableMovieId}`);
  }
}
for (const {stableMovieId, html: cardHtml} of homeCards) {
  const master = expectedById.get(stableMovieId);
  if (!master) throw new Error(`Homepage card is not an eligible published Master: ${stableMovieId}`);
  const expectedPathname = new URL(master.publishing.canonical_url).pathname;
  const cardLinks = [...cardHtml.matchAll(/href="(\/works\/[a-z0-9-]+\/)"/g)].map((match) => match[1]);
  if (cardLinks.length !== 2 || cardLinks.some((href) => href !== expectedPathname)) {
    throw new Error(`Homepage cover and title links disagree for ${stableMovieId}`);
  }
  const previewCard = renderedById.get(stableMovieId);
  if (!previewCard) throw new Error(`Homepage card is missing from the neutral preview: ${stableMovieId}`);
  if (cardHtml.includes('9秒選片') !== previewCard.html.includes('9秒選片')) {
    throw new Error(`Homepage and preview promo marker states disagree for ${stableMovieId}`);
  }
  if (!cardHtml.includes('loading="lazy"') || !cardHtml.includes('fetchpriority="auto"')) {
    throw new Error(`Homepage catalog card uses high-priority image loading: ${stableMovieId}`);
  }
}
for (const master of expectedExcluded) {
  if (await pathExists(resolve(root, 'dist', 'works', master.slug, 'index.html'))) {
    throw new Error(`Draft or Demo work page was generated: ${master.stable_movie_id}`);
  }
}
if (!html.includes('name="robots" content="noindex,nofollow"')) throw new Error('Preview robots contract is missing');
if (sitemap.includes('/preview/movie-master-cards/')) throw new Error('Preview URL leaked into sitemap');
if (sitemap.includes('/reviews/')) throw new Error('Legacy review URL leaked into sitemap');
if (!html.includes('data-cover-fallback="/images/movie-cover-fallback.svg"')) throw new Error('Image fallback contract is missing');
if ((html.match(/\[data-cover-fallback\]/g) ?? []).length !== 1) throw new Error('MovieCardV1 fallback handler must be emitted exactly once');
if (html.includes('待補') || html.includes('演員資料待補')) throw new Error('Missing-value placeholder leaked into preview');
if (!latestHtml.includes('data-cover-fallback="/images/movie-cover-fallback.svg"')) throw new Error('Latest image fallback contract is missing');
if ((latestHtml.match(/\[data-cover-fallback\]/g) ?? []).length !== 1) throw new Error('Latest fallback handler must be emitted exactly once');
if (latestHtml.includes('待補') || latestHtml.includes('演員資料待補')) throw new Error('Missing-value placeholder leaked into Latest');
if (latestHtml.includes('/reviews/')) throw new Error('Legacy review URL leaked into Latest');
if (!homeHtml.includes('<section class="hero catalog-feature">')) throw new Error('Homepage Markdown featured Hero is missing');
if (!homeHtml.includes('data-cover-fallback="/images/movie-cover-fallback.svg"')) throw new Error('Homepage image fallback contract is missing');
if ((homeHtml.match(/\[data-cover-fallback\]/g) ?? []).length !== 1) throw new Error('Homepage fallback handler must be emitted exactly once');
if (homeHtml.includes('待補') || homeHtml.includes('演員資料待補')) throw new Error('Missing-value placeholder leaked into homepage');
if (homeHtml.includes('/reviews/')) throw new Error('Legacy review URL leaked into homepage');

console.log(`Movie Master surfaces valid: ${renderedCards.length} preview cards, ${homeCards.length} homepage cards, ${latestCards.length} Latest cards and work pages, ${expectedExcluded.length} dynamic exclusions, redirects, structured data, noindex and sitemap contracts passed.`);
