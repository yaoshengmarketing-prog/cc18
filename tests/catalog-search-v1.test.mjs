import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildSearchIndex} from '../scripts/build-search-index.mjs';
import {
  classifySearchQuery,
  compactSearchText,
  normalizeCatalogCode,
  searchCatalog,
  searchableAliasNames,
} from '../src/lib/catalog-search.mjs';

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

test('a CC18 source tag finds its published work even without a canonical mapping', async () => {
  const index = await buildSearchIndex();
  const result = searchCatalog(index, '女同性戀');
  const bban = result.movies.find(({card}) => card.catalog_code === 'BBAN-614');
  assert.ok(bban);
  assert.equal(bban.match_reason, '來源標籤：女同性戀');
  assert.ok(bban.search.source_tags.includes('女同性戀'));
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

test('SNOS-345 search keeps source and localized performer names on one actor and approved short title', async () => {
  const index = await buildSearchIndex();
  for (const query of ['鷲尾芽衣', '鷲尾めい']) {
    const result = searchCatalog(index, query);
    assert.deepEqual(result.people.map(({stable_actor_id: id}) => id), ['cc18.tv:actor:25064']);
    const movies = result.movies.filter(({card}) => card.catalog_code === 'SNOS-345');
    assert.equal(movies.length, 1);
    assert.equal(movies[0].card.title, '鷲尾芽衣的美容院乳頭開發');
  }
});

test('single Han and kana characters search performers only with field-priority ordering and stable ID deduplication', async () => {
  const index = await buildSearchIndex();
  const expectedMatches = (query) => index.performers.map((person) => {
    const fields = [
      ['display_name_zh_tw', person.display_name_zh_tw, 4],
      ['name_ja', person.name_ja, 3],
      ['source_name', person.source_name, 2],
      ...(person.searchable_aliases ?? []).map((name) => ['searchable_alias', name, 1]),
    ].filter(([, name]) => Boolean(name));
    let best = null;
    for (const [field, name, priority] of fields) {
      const normalizedName = compactSearchText(name);
      const normalizedQuery = compactSearchText(query);
      const kind = normalizedName === normalizedQuery ? 'exact'
        : normalizedName.startsWith(normalizedQuery) ? 'prefix'
          : normalizedName.includes(normalizedQuery) ? 'partial'
            : null;
      if (!kind) continue;
      const score = priority * 1000 + {exact: 300, prefix: 200, partial: 100}[kind];
      if (!best || score > best.score) best = {field, score};
    }
    return best ? {...person, ...best} : null;
  }).filter(Boolean)
    .sort((left, right) => right.score - left.score || left.display_name.localeCompare(right.display_name, 'zh-Hant'));

  for (const query of ['音', '星', '空', 'ね', '澪']) {
    const result = searchCatalog(index, query);
    const people = expectedMatches(query);
    const byId = new Map(people.map((person) => [person.stable_actor_id, person]));
    const movies = index.movies.filter((movie) => movie.performer_ids.some((id) => byId.has(id)))
      .map((movie) => ({
        ...movie,
        score: Math.max(...movie.performer_ids.map((id) => byId.get(id)?.score ?? 0)),
      }))
      .sort((left, right) => right.score - left.score
        || (right.card.release_date ?? '').localeCompare(left.card.release_date ?? '')
        || left.card.catalog_code.localeCompare(right.card.catalog_code, 'en'));
    assert.equal(result.valid, true, query);
    assert.equal(result.performerOnly, true, query);
    assert.deepEqual(result.people.map(({stable_actor_id}) => stable_actor_id), people.map(({stable_actor_id}) => stable_actor_id), query);
    assert.deepEqual(result.movies.map(({card}) => card.stable_movie_id), movies.map(({card}) => card.stable_movie_id), query);
    assert.equal(new Set(result.people.map(({stable_actor_id}) => stable_actor_id)).size, result.people.length, query);
    assert.equal(new Set(result.movies.map(({card}) => card.stable_movie_id)).size, result.movies.length, query);
  }
  const sound = searchCatalog(index, '音');
  const jaMatchIndex = sound.people.findIndex(({stable_actor_id: id}) => id === 'cc18.tv:actor:28932');
  const aliasMatchIndex = sound.people.findIndex(({stable_actor_id: id}) => id === 'cc18.tv:actor:54454');
  assert.equal(sound.people[jaMatchIndex].match_field, 'name_ja');
  assert.equal(sound.people[aliasMatchIndex].match_field, 'searchable_alias');
  assert.ok(jaMatchIndex < aliasMatchIndex, 'name_ja field priority must outrank searchable_alias');
});

test('single-character performer search never scans movie fields', () => {
  const index = {
    performers: [],
    movies: [{
      card: {stable_movie_id: 'cc18:TEST-001', catalog_code: '音', release_date: null, canonical_topics: [{label: '音'}]},
      performer_ids: [],
      search: {display_short_title: '音', article_title: '音', source_title: '音', slug: '音'},
    }],
  };
  const result = searchCatalog(index, '音');
  assert.equal(result.performerOnly, true);
  assert.deepEqual(result.movies, []);
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
  for (const query of ['S', '4', '-', '.', '🙂']) assert.equal(searchCatalog(index, query).reason, 'too_short', query);
  for (const query of ['音', '星', 'ね', 'ミ']) assert.equal(classifySearchQuery(query).performerOnly, true, query);
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
  assert.match(page, /人物姓名可輸入一個中文或日文字/);
  assert.doesNotMatch(page, /innerHTML|insertAdjacentHTML/);
  assert.match(layout, /class="search-link" href="\/search\/"/);
  assert.match(home, /form action="\/search\/" method="get"/);
});
