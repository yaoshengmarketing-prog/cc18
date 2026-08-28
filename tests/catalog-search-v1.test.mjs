import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildSearchIndex} from '../scripts/build-search-index.mjs';
import {normalizeCatalogCode, searchCatalog, searchableAliasNames} from '../src/lib/catalog-search.mjs';

const expectedPeople = new Map([
  ['cc18.tv:actor:54454', {movie: 'cc18:SNOS-409', queries: ['星空ねる', '星空音琉', 'ねる', '音琉', '星空']}],
  ['cc18.tv:actor:27185', {movie: 'cc18:DSOD-006', queries: ['一ノ瀬ラム', '一之瀨蘭', 'ラム', '瀨蘭']}],
  ['cc18.tv:actor:29885', {movie: 'cc18:DSOD-006', queries: ['柚木れんか', '柚木蓮花', 'れんか', '蓮花']}],
  ['cc18.tv:actor:54025', {movie: 'cc18:DSOD-006', queries: ['柊もみじ', '柊紅葉', 'もみじ', '紅葉']}],
  ['cc18.tv:actor:30343', {movie: 'cc18:SDAB-358', queries: ['相沢澪', '相澤澪']}],
  ['cc18.tv:actor:25064', {movie: 'cc18:SNOS-345', queries: ['鷲尾めい', '鷲尾芽衣']}],
  ['cc18.tv:actor:28722', {movie: 'cc18:SNOS-360', queries: ['浅野こころ', '淺野心']}],
  ['cc18.tv:actor:25389', {movie: 'cc18:SNOS-369', queries: ['七ツ森りり', '七森莉莉']}],
]);

test('search index follows Movie Master publication boundaries and excludes every draft and demo', async () => {
  const [index, movieMasterIndex] = await Promise.all([
    buildSearchIndex(),
    readFile(new URL('../data/movie-master/index.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  assert.equal(index.counts.movies, movieMasterIndex.published_count);
  assert.equal(index.counts.excluded_formal_drafts, movieMasterIndex.formal_draft_count);
  assert.equal(index.counts.excluded_demos, movieMasterIndex.demo_count);
  assert.equal(new Set(index.movies.map(({card}) => card.stable_movie_id)).size, movieMasterIndex.published_count);
  const includedIds = new Set(index.movies.map(({card}) => card.stable_movie_id));
  for (const entry of movieMasterIndex.entries) {
    assert.equal(includedIds.has(entry.stable_movie_id), entry.is_published === true && entry.is_demo !== true, entry.catalog_code);
  }
});

test('all approved performer names, aliases and partials resolve to one actor and related published work', async () => {
  const index = await buildSearchIndex();
  for (const [actorId, {movie, queries}] of expectedPeople) {
    for (const query of queries) {
      const result = searchCatalog(index, query);
      assert.deepEqual(result.people.map(({stable_actor_id: id}) => id), [actorId], query);
      assert.ok(result.movies.some(({card}) => card.stable_movie_id === movie), query);
      assert.equal(new Set(result.movies.map(({card}) => card.stable_movie_id)).size, result.movies.length, query);
    }
  }
});

test('catalog normalization handles case, width, spaces and common hyphens without duplicate works', async () => {
  const index = await buildSearchIndex();
  for (const query of ['SNOS-409', 'snos-409', 'ＳＮＯＳ－４０９', 'SNOS 409', 'SNOS—409']) {
    assert.equal(normalizeCatalogCode(query), 'snos409');
    const result = searchCatalog(index, query);
    assert.deepEqual(result.movies.map(({card}) => card.stable_movie_id), ['cc18:SNOS-409'], query);
  }
});

test('unsearchable aliases are excluded and blank, short and missing queries have safe states', async () => {
  const index = await buildSearchIndex();
  assert.deepEqual(searchableAliasNames([
    {name: '有來源別名', searchable: true},
    {name: '純推測候選', searchable: false},
  ]), ['有來源別名']);
  assert.equal(searchCatalog(index, ' ').reason, 'empty');
  assert.equal(searchCatalog(index, '星').reason, 'too_short');
  assert.deepEqual(searchCatalog(index, '完全不存在的查詢').movies, []);
  assert.deepEqual(searchCatalog(index, '<script>alert(1)</script>').people, []);
});

test('build-time search index is deterministic and current on disk', async () => {
  const first = await buildSearchIndex();
  const second = await buildSearchIndex();
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const onDisk = JSON.parse(await readFile(new URL('../data/search-index-v1.json', import.meta.url), 'utf8'));
  assert.deepEqual(onDisk, first);
});

test('search page uses safe DOM output, preserves query URLs, and header/home entries target formal search', async () => {
  const [page, layout, home] = await Promise.all([
    readFile(new URL('../src/pages/search/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/layouts/BaseLayout.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /robots="noindex,follow"/);
  assert.match(page, /action="\/search\/" method="get"/);
  assert.match(page, /new URLSearchParams\(location\.search\)\.get\('q'\)/);
  assert.match(page, /encodeURIComponent\(query\)/);
  assert.match(page, /textContent = value/);
  assert.doesNotMatch(page, /innerHTML|insertAdjacentHTML/);
  assert.match(layout, /class="search-link" href="\/search\/"/);
  assert.match(home, /form action="\/search\/" method="get"/);
});
