import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadMovieMasterCardPreview, resolveInternalReviewHref} from '../src/lib/movie-master.mjs';

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

test('Movie Master preview follows the index publication and exclusion counts', async () => {
  const preview = await loadMovieMasterCardPreview();
  assert.equal(preview.cards.length, preview.index.published_count);
  assert.equal(preview.exclusions.length, preview.index.formal_draft_count + preview.index.demo_count);
  assert.equal(preview.exclusions.filter(({is_demo}) => is_demo).length, preview.index.demo_count);
  assert.equal(
    preview.exclusions.filter(({is_demo, is_published}) => !is_demo && !is_published).length,
    preview.index.formal_draft_count,
  );
  assert.equal(preview.exclusions.filter(({is_published}) => is_published).length, 0);
});

test('basic cards expose only qualified Movie Master projections', async () => {
  const {cards} = await loadMovieMasterCardPreview();
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
    assert.equal(card.href, `/reviews/${master.slug}/`);
    assert.match(card.href, /^\/reviews\/[a-z0-9-]+\/$/);
    assert.ok(card.canonical_topics.length <= 2);
    assert.ok(!JSON.stringify(card).includes('待補'));
  }
});

test('review href resolution treats slug and catalog code as independent fields', () => {
  const canonicalUrl = 'https://cc18.pages.dev/reviews/editorial-slug/';
  assert.equal(resolveInternalReviewHref(canonicalUrl, 'editorial-slug'), '/reviews/editorial-slug/');
  assert.equal(resolveInternalReviewHref(canonicalUrl, 'catalog-999'), null);
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
