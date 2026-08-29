import test from 'node:test';
import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';
import {loadPublishedMovieCardCatalog} from '../src/lib/movie-master.mjs';
import {normalizeWorkSlug, resolveInternalWorkHref, workCanonicalUrl, workPath} from '../src/lib/work-url.mjs';

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

test('published Movie Master card catalog follows index publication and exclusion counts', async () => {
  const catalog = await loadPublishedMovieCardCatalog();
  assert.equal(catalog.cards.length, catalog.index.published_count);
  assert.equal(catalog.exclusions.length, catalog.index.formal_draft_count + catalog.index.demo_count);
  assert.equal(catalog.exclusions.filter(({is_demo}) => is_demo).length, catalog.index.demo_count);
  assert.equal(
    catalog.exclusions.filter(({is_demo, is_published}) => !is_demo && !is_published).length,
    catalog.index.formal_draft_count,
  );
  assert.equal(catalog.exclusions.filter(({is_published}) => is_published).length, 0);
});

test('basic cards expose only qualified Movie Master projections', async () => {
  const {cards} = await loadPublishedMovieCardCatalog();
  const index = await readJson('data/movie-master/index.json');
  const masters = await Promise.all(index.entries.map(({master_path}) => readJson(master_path)));
  const mastersById = new Map(masters.map((master) => [master.stable_movie_id, master]));
  const allowedKeys = [
    'canonical_topics', 'catalog_code', 'has_remotion_promo', 'href', 'performers',
    'release_date', 'source_cover', 'stable_movie_id', 'title',
  ];
  for (const card of cards) {
    assert.deepEqual(Object.keys(card).sort(), allowedKeys);
    assert.match(card.stable_movie_id, /^cc18:[A-Z0-9-]+$/);
    assert.ok(card.source_cover);
    assert.ok(card.title);
    const master = mastersById.get(card.stable_movie_id);
    assert.ok(master);
    assert.equal(card.href, new URL(master.publishing.canonical_url).pathname);
    assert.equal(card.href, workPath(master.slug));
    assert.match(card.href, /^\/works\/[a-z0-9-]+\/$/);
    assert.ok(card.canonical_topics.length <= 2);
    assert.ok(!JSON.stringify(card).includes('待補'));
  }
});

test('work URL helper normalizes IDs deterministically and preserves the trailing-slash contract', () => {
  assert.equal(normalizeWorkSlug(' SNOS-345 '), 'snos-345');
  assert.equal(normalizeWorkSlug('ＳＮＯＳ－３４５'), 'snos-345');
  assert.equal(workPath('SNOS-345'), '/works/snos-345/');
  assert.equal(workPath('SNOS-345'), workPath('snos-345'));
  assert.equal(workCanonicalUrl('https://cc18.pages.dev/base/', 'SNOS-345'), 'https://cc18.pages.dev/works/snos-345/');
  assert.doesNotMatch(workPath('SNOS-345'), /\/reviews\//);
  assert.throws(() => workPath('../SNOS-345'), /Invalid work slug or ID/);
});

test('work href resolution treats slug and catalog code as independent fields', () => {
  const canonicalUrl = 'https://cc18.pages.dev/works/editorial-slug/';
  assert.equal(resolveInternalWorkHref(canonicalUrl, 'editorial-slug'), '/works/editorial-slug/');
  assert.equal(resolveInternalWorkHref(canonicalUrl, 'catalog-999'), null);
});

test('public work route replaces the review renderer and Cloudflare redirects are exact', async () => {
  await access(new URL('../src/pages/works/[id].astro', import.meta.url));
  await assert.rejects(access(new URL('../src/pages/reviews/[id].astro', import.meta.url)));
  const [redirects, routes] = await Promise.all([
    readFile(new URL('../public/_redirects', import.meta.url), 'utf8'),
    readFile(new URL('../public/_routes.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  assert.equal(redirects.replaceAll('\r\n', '\n'), '/reviews/:slug/ /works/:slug/ 301\n/reviews/:slug /works/:slug/ 301\n');
  assert.doesNotMatch(redirects, /\/works\/:slug\/?\s+\/reviews\//);
  assert.deepEqual(routes.include, ['/media/*']);
});

test('cards receive resolved performer display names without adopting unverified candidates', async () => {
  const {cards} = await loadPublishedMovieCardCatalog();
  const byCatalogCode = new Map(cards.map((card) => [card.catalog_code, card]));
  assert.deepEqual(byCatalogCode.get('SDAB-358').performers, ['相澤澪', '要結愛']);
  assert.deepEqual(byCatalogCode.get('SNOS-345').performers, ['鷲尾芽衣']);
  assert.deepEqual(byCatalogCode.get('SNOS-360').performers, ['淺野心']);
  assert.deepEqual(byCatalogCode.get('SNOS-369').performers, ['七森莉莉']);
  assert.deepEqual(byCatalogCode.get('DSOD-006').performers, ['一ノ瀬ラム', '池田真理奈', '柚木れんか', '柊もみじ']);
  assert.deepEqual(byCatalogCode.get('SNOS-409').performers, ['星空ねる']);
  for (const candidate of ['一之瀨蘭', '柚木蓮花', '柊紅葉', '星空音琉']) {
    assert.ok(cards.every(({performers}) => !performers.includes(candidate)));
  }
  for (const catalogCode of ['ENDS-322', 'GAREA-627', 'HUNTC-568', 'MCSR-639', 'SIRO-5722']) {
    assert.deepEqual(byCatalogCode.get(catalogCode).performers, []);
  }
});

test('SNOS-345 card uses the approved short title projected by Movie Master', async () => {
  const {cards} = await loadPublishedMovieCardCatalog();
  const card = cards.find(({catalog_code: catalogCode}) => catalogCode === 'SNOS-345');
  assert.equal(card.title, '鷲尾芽衣的美容院乳頭開發');
});

test('Latest renders the neutral published card catalog in its established deterministic order', async () => {
  const [latestPage, {cards}, index] = await Promise.all([
    readFile(new URL('../src/pages/latest/index.astro', import.meta.url), 'utf8'),
    loadPublishedMovieCardCatalog(),
    readJson('data/movie-master/index.json'),
  ]);
  const masters = await Promise.all(index.entries.map(({master_path: masterPath}) => readJson(masterPath)));
  const expectedOrder = masters
    .filter((master) => master.publishing?.is_published === true && master.is_demo !== true)
    .sort((left, right) => (
      (right.source?.release_date ?? '').localeCompare(left.source?.release_date ?? '')
      || left.source.catalog_code.localeCompare(right.source.catalog_code, 'en')
    ))
    .map(({source}) => source.catalog_code);

  assert.deepEqual(cards.map(({catalog_code: catalogCode}) => catalogCode), expectedOrder);
  assert.equal(cards.length, index.published_count);
  assert.equal(new Set(cards.map(({stable_movie_id: stableMovieId}) => stableMovieId)).size, cards.length);
  assert.equal(new Set(cards.map(({catalog_code: catalogCode}) => catalogCode)).size, cards.length);
  assert.ok(cards.every(({title}) => title.trim()));
  assert.match(latestPage, /loadPublishedMovieCardCatalog\(\)/);
  assert.match(latestPage, /<MovieCardV1 card=\{card\}/);
  assert.doesNotMatch(latestPage, /ReviewCard|getCollection\('reviews'\)|byNewest/);
});

test('homepage keeps its Markdown featured Hero and renders the neutral published card catalog lazily', async () => {
  const [homePage, latestPage, {cards, index}] = await Promise.all([
    readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/latest/index.astro', import.meta.url), 'utf8'),
    loadPublishedMovieCardCatalog(),
  ]);

  assert.equal(cards.length, index.published_count);
  assert.equal(new Set(cards.map(({stable_movie_id: stableMovieId}) => stableMovieId)).size, cards.length);
  assert.equal(new Set(cards.map(({catalog_code: catalogCode}) => catalogCode)).size, cards.length);
  assert.ok(cards.every(({title}) => title.trim()));
  assert.match(homePage, /getCollection\('reviews'/);
  assert.match(homePage, /reviews\.find\(\(\{data\}\) => data\.featured\)/);
  assert.match(homePage, /<section class="hero catalog-feature">/);
  assert.match(homePage, /featured\.data\.title/);
  assert.match(homePage, /featured\.data\.shortReview/);
  assert.match(homePage, /featured\.data\.sourceUrl/);
  assert.match(homePage, /loadPublishedMovieCardCatalog\(\)/);
  assert.match(homePage, /catalog\.cards\.map\(\(card\) =>/);
  assert.match(homePage, /<MovieCardV1 card=\{card\} \/>/);
  assert.doesNotMatch(homePage, /<ReviewCard|const latest = reviews\.slice/);
  assert.doesNotMatch(homePage, /<MovieCardV1 card=\{card\} priority=/);
  assert.match(latestPage, /<MovieCardV1 card=\{card\} priority=\{index < 3\}/);
});

test('fallback behavior belongs to MovieCardV1 rather than the preview page', async () => {
  const [component, previewPage] = await Promise.all([
    readFile(new URL('../src/components/MovieCardV1.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/preview/movie-master-cards/index.astro', import.meta.url), 'utf8'),
  ]);
  assert.match(component, /querySelectorAll<HTMLImageElement>\('\[data-cover-fallback\]'\)/);
  assert.match(component, /fallbackApplied === 'true'/);
  assert.match(component, /\{once: true\}/);
  assert.doesNotMatch(previewPage, /fallbackApplied|data-cover-fallback/);
});

test('preview, Latest and formal search share the neutral published card catalog', async () => {
  const [library, homePage, previewPage, latestPage, searchBuilder] = await Promise.all([
    readFile(new URL('../src/lib/movie-master.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/preview/movie-master-cards/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/latest/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/build-search-index.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(library, /export async function loadPublishedMovieCardCatalog\(\)/);
  assert.match(homePage, /loadPublishedMovieCardCatalog\(\)/);
  assert.match(previewPage, /loadPublishedMovieCardCatalog\(\)/);
  assert.match(latestPage, /loadPublishedMovieCardCatalog\(\)/);
  assert.match(searchBuilder, /loadPublishedMovieCardCatalog\(\)/);
  assert.doesNotMatch(searchBuilder, /loadMovieMasterCardPreview|preview\/movie-master-cards|preview\./);
});
