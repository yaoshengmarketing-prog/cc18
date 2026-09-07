import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  parseSeriesSourceId,
  parseSeriesRouteSegment,
  parseSeriesStableId,
  seriesHref,
  seriesRouteSegment,
  seriesStableIdFromSourceId,
} from '../src/lib/series-identity.mjs';
import {validateSeriesRelations} from '../scripts/build-movie-master.mjs';
import {
  buildSeriesCatalog,
  loadSeriesCatalog,
  seriesIndexDecision,
  validatePublicSeriesIndexEntry,
} from '../src/lib/series-catalog.mjs';
import {
  seriesCanonical,
  validateSeriesHtmlFileSet,
  validateSeriesPageHtml,
  validateWorkSeriesProjection,
} from '../scripts/postbuild-seo.mjs';

const relation = ({id = '20710', name = '系列甲', urlId = id, stableId = `cc18.tv:series:${id}`} = {}) => ({
  source_type: 'series',
  source_id: id,
  stable_source_id: stableId,
  source_name: name,
  source_url: `https://cc18.tv/search.php?s_type=series&s_tid=${urlId}`,
  observed_at: '2026-08-31T10:00:00.000Z',
});

const validate = ({catalogCode = 'TEST-001', series = '系列甲', relations = [relation()], names = new Map(), isPublished = true} = {}) => validateSeriesRelations({
  catalogCode,
  source: {series, source_relations: {series: relations}},
  isPublished,
  seriesNamesByStableId: names,
});

test('series identity codec accepts only canonical positive source IDs', () => {
  assert.equal(parseSeriesSourceId('20710'), '20710');
  assert.equal(seriesStableIdFromSourceId('20710'), 'cc18.tv:series:20710');
  assert.deepEqual(parseSeriesStableId('cc18.tv:series:20710'), {sourceId: '20710', stableId: 'cc18.tv:series:20710'});
  for (const value of ['0', '-1', '01', ' 1', '1 ', '1.0', 'abc', '', null]) {
    assert.throws(() => parseSeriesSourceId(value));
  }
});

test('series route codec emits only canonical stable navigation URLs', () => {
  assert.equal(seriesRouteSegment('cc18.tv:series:20710'), 'cc18-tv-series-20710');
  assert.equal(seriesHref('cc18.tv:series:20710'), '/series/cc18-tv-series-20710/');
  assert.deepEqual(parseSeriesRouteSegment('cc18-tv-series-20710'), {
    sourceId: '20710',
    stableId: 'cc18.tv:series:20710',
    routeSegment: 'cc18-tv-series-20710',
    href: '/series/cc18-tv-series-20710/',
  });
  for (const value of [
    'cc18-tv-series-0',
    'cc18-tv-series-01',
    'CC18-tv-series-20710',
    'cc18-tv-series-%32%30%37%31%30',
    ' cc18-tv-series-20710',
    'cc18-tv-series-20710 ',
    'cc18-tv-series-20710/extra',
    'cc18-tv-series-20710\\extra',
    'cc18-tv-series-20710?q=1',
    'cc18-tv-series-20710#x',
    '',
    null,
  ]) assert.throws(() => parseSeriesRouteSegment(value), undefined, String(value));
});

test('projects a valid typed series relation and preserves identity across works', () => {
  const names = new Map();
  const first = validate({catalogCode: 'ONE-001', names});
  const second = validate({catalogCode: 'TWO-002', names});
  assert.deepEqual(first, second);
  assert.equal(first[0].stable_source_id, 'cc18.tv:series:20710');
});

test('fails closed for conflicting names and preserves same-name different IDs', () => {
  const names = new Map();
  validate({catalogCode: 'ONE-001', names});
  assert.throws(() => validate({catalogCode: 'TWO-002', series: '系列乙', relations: [relation({name: '系列乙'})], names}), /conflicting names/u);
  const separate = new Map();
  validate({catalogCode: 'ONE-001', names: separate});
  validate({catalogCode: 'TWO-002', series: '系列甲', relations: [relation({id: '20711', name: '系列甲'})], names: separate});
  assert.equal(separate.size, 2);
});

test('fails closed for relation identity, URL, name and multiplicity contradictions', () => {
  assert.throws(() => validate({relations: [relation({stableId: 'cc18.tv:series:999'})]}), /invalid series relation identity/u);
  assert.throws(() => validate({relations: [relation({urlId: '999'})]}), /URL\/identity mismatch/u);
  assert.throws(() => validate({series: '系列乙'}), /typed series\/source series name mismatch/u);
  assert.throws(() => validate({relations: [relation(), relation()]}), /multiple series identities/u);
});

test('does not infer a typed relation from a legacy series string', () => {
  const input = (isPublished) => validateSeriesRelations({
    catalogCode: 'TEST-001',
    source: {series: '系列甲', source_relations: {}},
    isPublished,
    seriesNamesByStableId: new Map(),
  });
  assert.deepEqual(input(false), []);
  assert.throws(() => input(true), /published series relations must be an array/u);
});

const card = ({code = 'TEST-001', releaseDate = '2026-08-25'} = {}) => ({
  stable_movie_id: `cc18:${code}`,
  catalog_code: code,
  release_date: releaseDate,
  href: `/works/${code.toLowerCase()}/`,
  title: `${code} short title`,
  source_cover: '/cover.jpg',
  performers: [],
  canonical_topics: [],
  has_remotion_promo: false,
});

const master = ({code = 'TEST-001', relations = [relation()], rawNames} = {}) => ({
  stable_movie_id: `cc18:${code}`,
  source: {
    catalog_code: code,
    series_relations: relations,
    raw_series_names: rawNames ?? relations.map(({source_name: name}) => name),
  },
});

const indexEntry = (code = 'TEST-001') => ({
  stable_movie_id: `cc18:${code}`,
  catalog_code: code,
  master_path: `data/movie-master/${code.toLowerCase()}.json`,
});

test('series catalog preserves stable identity, source display fallback and per-work release ordering', () => {
  const cards = [
    card({code: 'ONE-001', releaseDate: '2026-08-24'}),
    card({code: 'TWO-002', releaseDate: '2026-08-25'}),
    card({code: 'AAA-003', releaseDate: '2026-08-25'}),
  ];
  const masters = cards.map(({catalog_code: code}) => master({code}));
  const catalog = buildSeriesCatalog({cards, masters});
  assert.equal(catalog.series.length, 1);
  assert.equal(catalog.series[0].stable_series_id, 'cc18.tv:series:20710');
  assert.equal(catalog.series[0].display_name, '系列甲');
  assert.equal(catalog.series[0].source_name, '系列甲');
  assert.equal(catalog.series[0].index_decision, 'INDEX_READY');
  assert.deepEqual(catalog.series[0].public_works.map(({catalog_code: code}) => code), ['AAA-003', 'TWO-002', 'ONE-001']);
  assert.equal(catalog.ordered_series_by_work.every(({series}) => series[0].href === '/series/cc18-tv-series-20710/'), true);
});

test('series catalog does not merge same-name identities and fails closed on rename or missing typed identity', () => {
  const cards = [card({code: 'ONE-001'}), card({code: 'TWO-002'})];
  const sameNameDifferentIds = buildSeriesCatalog({
    cards,
    masters: [
      master({code: 'ONE-001'}),
      master({code: 'TWO-002', relations: [relation({id: '20711'})]}),
    ],
  });
  assert.equal(sameNameDifferentIds.series.length, 2);
  assert.equal(new Set(sameNameDifferentIds.series.map(({stable_series_id: id}) => id)).size, 2);
  assert.equal(new Set(sameNameDifferentIds.series.map(({metadata_identity_label: label}) => label)).size, 2);
  assert.throws(() => buildSeriesCatalog({
    cards,
    masters: [
      master({code: 'ONE-001'}),
      master({code: 'TWO-002', relations: [relation({name: '系列乙'})]}),
    ],
  }), /conflicting source names/u);
  assert.throws(() => buildSeriesCatalog({
    cards: [card()],
    masters: [master({relations: [], rawNames: ['系列甲']})],
  }), /typed series\/raw series name count mismatch/u);
});

test('series index policy uses three public works without claiming an ordering within a day', () => {
  assert.deepEqual(seriesIndexDecision(1), {decision: 'NOINDEX_THIN', reason: 'HAS_FEWER_THAN_THREE_PUBLIC_WORKS'});
  assert.deepEqual(seriesIndexDecision(2), {decision: 'NOINDEX_THIN', reason: 'HAS_FEWER_THAN_THREE_PUBLIC_WORKS'});
  assert.deepEqual(seriesIndexDecision(3), {decision: 'INDEX_READY', reason: 'HAS_AT_LEAST_THREE_PUBLIC_WORKS'});
  for (const value of [0, -1, 1.5, '3']) assert.throws(() => seriesIndexDecision(value));
});

test('series loader rejects invalid index authority before Movie Master reads', async () => {
  let reads = 0;
  const publicCard = card();
  const invalidEntries = [
    {...indexEntry(), master_path: undefined},
    {...indexEntry(), master_path: '../test.json'},
    {...indexEntry(), stable_movie_id: 'cc18:EVIL'},
  ];
  for (const entry of invalidEntries) {
    reads = 0;
    await assert.rejects(() => loadSeriesCatalog({
      loadCardCatalog: async () => ({cards: [publicCard], index: {}, exclusions: []}),
      loadIndex: async () => ({entries: [entry]}),
      loadMaster: async () => { reads += 1; return master({}); },
    }));
    assert.equal(reads, 0);
  }
  assert.equal(validatePublicSeriesIndexEntry(publicCard, indexEntry(), master({})), true);
});

const seriesPageFixture = (series, {robots, records, extraHead = ''} = {}) => {
  const canonical = seriesCanonical(series);
  const robotsValue = robots ?? (series.index_decision === 'INDEX_READY' ? 'index,follow' : 'noindex,follow');
  const schema = records ?? [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {'@type': 'ListItem', position: 1, name: '首頁', item: 'https://cc18.pages.dev/'},
        {'@type': 'ListItem', position: 2, name: '系列', item: 'https://cc18.pages.dev/series/'},
        {'@type': 'ListItem', position: 3, name: series.display_name, item: canonical},
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': canonical,
      url: canonical,
      name: series.display_name,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: series.public_work_count,
        itemListElement: series.public_works.map((work, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: work.catalog_code,
          item: `https://cc18.pages.dev${work.href}`,
        })),
      },
    },
  ];
  const description = `整理${series.metadata_identity_label}在本站已發布的作品，目前收錄 ${series.public_work_count} 部；卡片依作品發行日新到舊。`;
  return [
    `<title>${series.metadata_identity_label}系列作品整理｜CC18 影格</title>`,
    `<meta name="description" content="${description}">`,
    `<meta name="robots" content="${robotsValue}">`,
    `<link rel="canonical" href="${canonical}">`,
    extraHead,
    `<article data-series-id="${series.stable_series_id}"><h1>${series.display_name}</h1><b>${series.source_name}</b><code>${series.stable_series_id}</code></article>`,
    `<script type="application/ld+json">${JSON.stringify(schema)}</script>`,
  ].join('');
};

test('series SEO contract enforces canonical, robots, schema identity and exact work order', () => {
  const catalog = buildSeriesCatalog({cards: [card()], masters: [master({})]});
  const thin = catalog.series[0];
  assert.deepEqual(validateSeriesPageHtml({series: thin, html: seriesPageFixture(thin)}), {
    canonical: 'https://cc18.pages.dev/series/cc18-tv-series-20710/',
    shouldIndex: false,
  });
  assert.throws(() => validateSeriesPageHtml({series: thin, html: seriesPageFixture(thin, {
    extraHead: `<link rel="canonical" href="${seriesCanonical(thin)}">`,
  })}), /exactly one canonical/u);
  assert.throws(() => validateSeriesPageHtml({series: thin, html: seriesPageFixture(thin, {
    extraHead: '<meta name="robots" content="index,follow">',
  })}), /exactly one robots/u);
  const wrongOrder = JSON.parse(seriesPageFixture(thin).match(/<script type="application\/ld\+json">([^<]+)/u)[1]);
  wrongOrder[1].mainEntity.itemListElement[0].position = 2;
  assert.throws(() => validateSeriesPageHtml({series: thin, html: seriesPageFixture(thin, {records: wrongOrder})}), /ItemList differs/u);
  assert.throws(() => validateSeriesPageHtml({series: thin, html: seriesPageFixture(thin, {records: [...wrongOrder, {'@type': 'CreativeWorkSeries'}]})}), /unapproved Schema/u);

  const indexReady = buildSeriesCatalog({
    cards: [card({code: 'ONE-001'}), card({code: 'TWO-002'}), card({code: 'THREE-003'})],
    masters: [master({code: 'ONE-001'}), master({code: 'TWO-002'}), master({code: 'THREE-003'})],
  }).series[0];
  assert.equal(validateSeriesPageHtml({series: indexReady, html: seriesPageFixture(indexReady)}).shouldIndex, true);
  assert.throws(() => validateSeriesPageHtml({
    series: indexReady,
    html: seriesPageFixture(indexReady, {robots: 'noindex,follow'}),
  }), /INDEX series rendered noindex/u);
});

test('series postbuild file set rejects legacy and otherwise unapproved HTML outputs', () => {
  const series = [{route_segment: 'cc18-tv-series-20710'}];
  const valid = ['series/index.html', 'series/cc18-tv-series-20710/index.html'];
  assert.equal(validateSeriesHtmlFileSet({allHtmlPaths: valid, series}), true);
  assert.throws(() => validateSeriesHtmlFileSet({allHtmlPaths: [...valid, 'series/legacy-name/index.html'], series}), /extra=series\/legacy-name/u);
});

test('work page series links and Article Schema share the exact typed catalog projection', () => {
  const work = {
    stable_movie_id: 'cc18:TEST-001',
    href: '/works/test-001/',
    series: [{
      stable_series_id: 'cc18.tv:series:20710',
      display_name: '系列甲',
      href: '/series/cc18-tv-series-20710/',
    }],
  };
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    about: ['TEST-001', {
      '@type': 'Thing',
      name: '系列甲',
      url: 'https://cc18.pages.dev/series/cc18-tv-series-20710/',
    }],
  };
  const html = `<a href="/series/cc18-tv-series-20710/" data-series-id="cc18.tv:series:20710">系列甲</a><script type="application/ld+json">${JSON.stringify(article)}</script>`;
  assert.equal(validateWorkSeriesProjection({work, html}), true);
  assert.throws(() => validateWorkSeriesProjection({work, html: html.replace('20710/" data', '999/" data')}), /typed series links differ/u);
  assert.throws(() => validateWorkSeriesProjection({work, html: html.replace('"name":"系列甲"', '"name":"系列乙"')}), /Article series identity differs/u);
  assert.equal(validateWorkSeriesProjection({
    work: {...work, series: []},
    html: '<script type="application/ld+json">{"@type":"Article","about":["TEST-001"]}</script>',
  }), true);
});

test('formal series catalog matches the current published Registry and typed Movie Master relations', async () => {
  const catalog = await loadSeriesCatalog();
  const [registry, index] = await Promise.all([
    readFile(new URL('../data/movie-registry.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../data/movie-master/index.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const publishedCodes = new Set(registry.records
    .filter(({review_status: status}) => status === 'published')
    .map(({id}) => id));
  const publicMasters = [];
  for (const entry of index.entries.filter(({catalog_code: code, is_demo: demo}) => publishedCodes.has(code) && !demo)) {
    const master = JSON.parse(await readFile(new URL(`../${entry.master_path}`, import.meta.url), 'utf8'));
    if (master.publishing?.indexability === 'INDEX') publicMasters.push(master);
  }
  const workCountBySeries = new Map();
  let explicitNoSeries = 0;
  for (const master of publicMasters) {
    const relations = master.source?.series_relations;
    assert.ok(Array.isArray(relations), `${master.source?.catalog_code}: missing explicit series relation array`);
    if (relations.length === 0) explicitNoSeries += 1;
    for (const relation of relations) {
      workCountBySeries.set(relation.stable_source_id, (workCountBySeries.get(relation.stable_source_id) ?? 0) + 1);
    }
  }
  const expectedSeriesIds = [...workCountBySeries.keys()].sort();
  const expectedThin = [...workCountBySeries.values()].filter((count) => count < 3).length;
  const expectedIndexReady = workCountBySeries.size - expectedThin;
  assert.deepEqual(catalog.counts, {
    public_works: publicMasters.length,
    stable_series: workCountBySeries.size,
    thin_series: expectedThin,
    index_ready_series: expectedIndexReady,
  });
  assert.deepEqual(catalog.series.map(({stable_series_id: id}) => id).sort(), expectedSeriesIds);
  assert.equal(catalog.ordered_series_by_work.filter(({series}) => series.length === 0).length, explicitNoSeries);
  assert.equal(catalog.series.every(({display_name: display, source_name: source, index_decision: decision, public_work_count: count}) => (
    display === source && decision === (count >= 3 ? 'INDEX_READY' : 'NOINDEX_THIN')
  )), true);
});

test('series redirects are exact name compatibility rules with no wildcard or reverse target', async () => {
  const text = await import('node:fs/promises').then(({readFile}) => readFile(new URL('../public/_redirects', import.meta.url), 'utf8'));
  const seriesLines = text.split(/\r?\n/u).filter((line) => line.startsWith('/series/'));
  assert.equal(seriesLines.length, 8);
  assert.equal(seriesLines.every((line) => / \/series\/cc18-tv-series-[1-9][0-9]*\/ 301$/u.test(line)), true);
  assert.equal(seriesLines.some((line) => line.includes('*') || /^\/series\/cc18-tv-series-/u.test(line)), false);
});
