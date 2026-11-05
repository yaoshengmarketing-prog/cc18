import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  buildPerformerCatalog,
  loadPerformerCatalog,
  validatePublicPerformerIndexEntry,
} from '../src/lib/performer-catalog.mjs';
import {
  parsePerformerRouteSegment,
  parsePerformerSourceId,
  parsePerformerStableId,
  performerHref,
  performerRouteSegment,
  performerStableIdFromSourceId,
  parsePerformerSourceUrl,
} from '../src/lib/performer-url.mjs';
import {buildPerformerLocalizationMap} from '../src/lib/performer-localization-policy.mjs';
import {validatePerformerIdentity} from '../src/lib/performer-identity.mjs';
import {loadPublishedMovieCardCatalog, loadPublishedMovieCardRecords} from '../src/lib/movie-master.mjs';
import {
  validateCanonicalMovieMasterIndexEntry,
  validateCanonicalMovieIdentity,
} from '../src/lib/movie-master-identity.mjs';
import {performerDictionary, validatePerformerRelations} from '../scripts/build-movie-master.mjs';
import {
  buildSearchLocalizationMap,
  loadSearchAuthorityBindings,
  validateCanonicalSearchMovieIdentity,
  validateCanonicalSearchIndexEntryIdentity,
  validateSearchDisplayPerformers,
  validateSearchMasterAuthority,
} from '../scripts/build-search-index.mjs';
import {validateSearchIndexCollections, validateSearchPerformerIds} from '../scripts/validate-search-postbuild.mjs';
import {
  APPROVED_SCHEMA_ALTERNATE_NAMES,
  FORBIDDEN_SCHEMA_ALTERNATE_NAMES,
  performerCanonical,
  validatePerformerHtmlFileSet,
  validatePerformerPageHtml,
} from '../scripts/postbuild-seo.mjs';

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const clone = (value) => structuredClone(value);

const performerPageFixture = (performer, {robots, extraHead = '', structuredData} = {}) => {
  const canonical = performerCanonical(performer);
  const records = structuredData ?? [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {'@type': 'ListItem', position: 1, name: '首頁', item: 'https://jav.com.tw/'},
        {'@type': 'ListItem', position: 2, name: '演員', item: 'https://jav.com.tw/actresses/'},
        {'@type': 'ListItem', position: 3, name: performer.primary_display_name, item: canonical},
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Person',
      '@id': canonical,
      url: canonical,
      name: performer.primary_display_name,
      ...(performer.schema_alternate_names.length ? {alternateName: performer.schema_alternate_names} : {}),
    },
  ];
  const robotsValue = robots ?? (performer.index_decision === 'INDEX_READY'
    ? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
    : 'noindex,follow');
  return [
    `<title>${performer.metadata_identity_label}作品與人物資料｜JAV 影格</title>`,
    `<meta name="description" content="整理${performer.metadata_identity_label}的日文原名、經核准別名與已發布作品，目前收錄 ${performer.public_work_count} 部。">`,
    `<meta name="robots" content="${robotsValue}">`,
    `<link rel="canonical" href="${canonical}">`,
    extraHead,
    `<article data-performer-id="${performer.stable_performer_id}"><h1>${performer.primary_display_name}</h1><code>${performer.stable_performer_id}</code></article>`,
    `<script type="application/ld+json">${JSON.stringify(records)}</script>`,
  ].join('');
};

const formalInputs = async () => {
  const [cardCatalog, index, localization, searchIndex] = await Promise.all([
    loadPublishedMovieCardCatalog(),
    readJson('data/movie-master/index.json'),
    readJson('data/localization/performers-zh-tw.json'),
    readJson('data/search-index-v1.json'),
  ]);
  const masters = await Promise.all(index.entries.map(({master_path: path}) => readJson(path)));
  return {cards: cardCatalog.cards, masters, localization, searchIndex};
};

test('strict performer codec round-trips every approved ID without normalizing input', async () => {
  const localization = await readJson('data/localization/performers-zh-tw.json');
  for (const {source_actor_id: id} of localization.performers) {
    const parsed = parsePerformerStableId(id);
    assert.equal(parsed.stableId, id);
    assert.equal(performerStableIdFromSourceId(parsed.sourceId), id);
    assert.equal(performerRouteSegment(id), parsed.routeSegment);
    assert.equal(performerHref(id), `/actresses/${parsed.routeSegment}/`);
    assert.deepEqual(parsePerformerRouteSegment(parsed.routeSegment), parsed);
  }
});

test('strict performer codec rejects loose, encoded and lookalike identities', () => {
  const invalidStableIds = [
    '', ' ', ' cc18.tv:actor:3', 'cc18.tv:actor:3 ', 'cc18.tv:actor:0', 'cc18.tv:actor:03',
    'cc18.tv:actor:+3', 'cc18.tv:actor:-3', 'cc18.tv:actor:3.0', 'CC18.tv:actor:3',
    'cc18.tv:Actor:3', 'cc18.tv:tag:3', 'cc18.tv:actor:3/', 'cc18.tv:actor:3?q=1',
    'cc18.tv:actor:3#x', 'cc18.tv%3Aactor%3A3', 'ｃｃ１８.tv:actor:3', 3, null,
  ];
  for (const value of invalidStableIds) assert.throws(() => parsePerformerStableId(value), undefined, String(value));
  const invalidSegments = [
    '', ' ', ' cc18-tv-actor-3', 'cc18-tv-actor-3 ', 'cc18-tv-actor-0', 'cc18-tv-actor-03',
    'cc18-tv-actor-+3', 'cc18-tv-actor-3.0', 'CC18-tv-actor-3', 'cc18-tv-tag-3',
    'cc18-tv-actor-3/', 'cc18-tv-actor-3?q=1', 'cc18-tv-actor-3#x', 'cc18-tv-actor-%33',
    'ｃｃ１８-tv-actor-3', 3, undefined,
  ];
  for (const value of invalidSegments) assert.throws(() => parsePerformerRouteSegment(value), undefined, String(value));
  for (const value of ['', '0', '03', '+3', '-3', '3.0', ' 3', '3 ', 3]) {
    assert.throws(() => parsePerformerSourceId(value), undefined, String(value));
  }
});

test('raw performer codec rejection remains distinct from HTTP unreserved-path equivalence', () => {
  for (const rawSegment of ['%63c18-tv-actor-27185', 'cc18-tv-actor-%32%37%31%38%35']) {
    assert.throws(() => parsePerformerRouteSegment(rawSegment));
    assert.equal(parsePerformerRouteSegment(decodeURIComponent(rawSegment)).stableId, 'cc18.tv:actor:27185');
  }
  for (const unsafe of [
    'cc18-tv-actor-%2527185',
    'cc18-tv-actor-%2F27185',
    'cc18-tv-actor-%5C27185',
    'cc18-tv-actor-%0027185',
    'cc18-tv-actor-%30%32%37%31%38%35',
  ]) {
    assert.throws(() => parsePerformerRouteSegment(unsafe));
  }
});

test('strict performer source URL parser rejects normalization and decoded-duplicate attacks', () => {
  const valid = parsePerformerSourceUrl('https://cc18.tv/search.php?s_type=actor&s_tid=3');
  assert.deepEqual(valid, {sourceId: '3', stableId: 'cc18.tv:actor:3', absoluteUrl: 'https://cc18.tv/search.php?s_type=actor&s_tid=3'});
  assert.deepEqual(
    parsePerformerSourceUrl('/search.php?s_type=actor&s_tid=3', {baseUrl: 'https://www.cc18.tv/player.php?uuid=test'}),
    {sourceId: '3', stableId: 'cc18.tv:actor:3', absoluteUrl: 'https://www.cc18.tv/search.php?s_type=actor&s_tid=3'},
  );
  const invalid = [
    ' https://cc18.tv/search.php?s_type=actor&s_tid=3',
    'https://cc18.tv/search.php?s_type=actor&s_tid=3 ',
    'https://cc18.tv/search.php?s_t\nid=3',
    'https://cc18.tv/search.php?s_type=actor&s_tid=\t3',
    'https://cc18.tv/search.php?s_type=actor&s_tid=3\r',
    'https://cc18.tv/search.php?s_type=actor&s_tid=%33',
    'https://cc18.tv/search.php?%73_type=actor&s_tid=3',
    'https://cc18.tv/search.php?s_type=actor&s_tid=3&%73_tid=4',
    'https://cc18.tv/search.php?s_type=actor&s_tid=3&s_%74id=4',
    'http://cc18.tv/search.php?s_type=actor&s_tid=3',
    'https://evil.example/search.php?s_type=actor&s_tid=3',
    'https://user@cc18.tv/search.php?s_type=actor&s_tid=3',
    'https://@cc18.tv/search.php?s_type=actor&s_tid=3',
    'https://cc18.tv:443/search.php?s_type=actor&s_tid=3',
    'https://cc18.tv:0443/search.php?s_type=actor&s_tid=3',
    'https://cc18.tv:444/search.php?s_type=actor&s_tid=3',
    'https://cc18.tv/foo/../search.php?s_type=actor&s_tid=3',
    'https://cc18.tv\\search.php?s_type=actor&s_tid=3',
    'https://%63c18.tv/search.php?s_type=actor&s_tid=3',
    'https://ｃｃ１８.tv/search.php?s_type=actor&s_tid=3',
    'https://cc18.tv/other.php?s_type=actor&s_tid=3',
    'https://cc18.tv/search.php?s_type=actor&s_tid=3#x',
    'https://cc18.tv/search.php?s_type=actor&s_tid=3&extra=x',
  ];
  for (const value of invalid) assert.throws(() => parsePerformerSourceUrl(value), undefined, JSON.stringify(value));
  assert.throws(() => parsePerformerSourceUrl('/search.php?s_type=actor&s_tid=3'), /Non-canonical raw CC18 search relation URL/u);
});

test('syntax validity remains independent from catalog existence', async () => {
  const unknown = parsePerformerStableId('cc18.tv:actor:999999999');
  assert.equal(unknown.href, '/actresses/cc18-tv-actor-999999999/');
  const catalog = await loadPerformerCatalog();
  assert.equal(catalog.performers.some(({stable_performer_id: id}) => id === unknown.stableId), false);
});

test('formal performer catalog cross-checks published cards, typed relations, display and Search', async () => {
  const [catalog, inputs] = await Promise.all([loadPerformerCatalog(), formalInputs()]);
  const cardIds = inputs.cards.map(({stable_movie_id: id}) => id);
  const publicMasters = inputs.masters.filter(({stable_movie_id: id}) => cardIds.includes(id));
  const expectedTyped = publicMasters.filter(({source}) => source.performer_relations.length > 0);
  const expectedRawOnly = publicMasters.filter(({source}) => source.performer_relations.length === 0 && source.raw_performer_names.length > 0);
  const expectedNoData = publicMasters.filter(({source}) => source.performer_relations.length === 0 && source.raw_performer_names.length === 0);
  const expectedPerformerIds = [...new Set(expectedTyped.flatMap(({source}) => (
    source.performer_relations.map(({stable_source_id: id}) => id)
  )))];
  assert.equal(catalog.public_work_count, inputs.cards.length);
  assert.equal(catalog.typed_work_count, expectedTyped.length);
  assert.equal(catalog.raw_only_work_count, expectedRawOnly.length);
  assert.equal(catalog.no_performer_data_work_count, expectedNoData.length);
  assert.equal(catalog.performers.length, expectedPerformerIds.length);
  assert.deepEqual([...catalog.raw_only_work_ids].sort(), expectedRawOnly.map(({stable_movie_id: id}) => id).sort());
  assert.deepEqual([...catalog.no_performer_data_work_ids].sort(), expectedNoData.map(({stable_movie_id: id}) => id).sort());
  assert.equal(new Set(catalog.performers.map(({stable_performer_id: id}) => id)).size, catalog.performers.length);
  const typedCatalogWorkIds = catalog.performers.flatMap(({public_works: works}) => works.map(({stable_movie_id: id}) => id));
  for (const rawOnlyId of catalog.raw_only_work_ids) assert.ok(!typedCatalogWorkIds.includes(rawOnlyId));
  for (const performer of catalog.performers) {
    const expectedWorkCount = expectedTyped.filter(({source}) => source.performer_relations
      .some(({stable_source_id: id}) => id === performer.stable_performer_id)).length;
    assert.equal(performer.public_work_count, expectedWorkCount);
    assert.equal(performer.public_works.length, expectedWorkCount);
    assert.equal(performer.index_decision, expectedWorkCount >= 2 ? 'INDEX_READY' : 'NOINDEX_THIN');
    assert.equal(performer.index_reason, expectedWorkCount >= 2 ? 'HAS_MULTIPLE_PUBLIC_WORKS' : 'ONLY_ONE_PUBLIC_WORK');
    assert.equal(performer.href, `/actresses/${performer.route_segment}/`);
  }
  const expectedOrder = [...catalog.performers].sort((left, right) => (
    left.primary_display_name.localeCompare(right.primary_display_name, 'zh-Hant')
    || left.stable_performer_id.localeCompare(right.stable_performer_id, 'en')
  ));
  assert.deepEqual(catalog.performers.map(({stable_performer_id: id}) => id), expectedOrder.map(({stable_performer_id: id}) => id));
  const dsodPerformers = catalog.ordered_performers_by_work
    .find(({stable_movie_id: id}) => id === 'cc18:DSOD-006').performers;
  assert.deepEqual(dsodPerformers.map(({stable_performer_id: id}) => id), [
    'cc18.tv:actor:27185',
    'cc18.tv:actor:27777',
    'cc18.tv:actor:29885',
    'cc18.tv:actor:54025',
  ]);
});

test('stable performer page SEO contract is derived from the catalog and fails closed for thin-page indexing', async () => {
  const catalog = await loadPerformerCatalog();
  const performer = catalog.performers.find(({index_decision: decision}) => decision === 'NOINDEX_THIN');
  assert.ok(performer);
  const canonical = performerCanonical(performer);
  const structured = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {'@type': 'ListItem', position: 1, name: '首頁', item: 'https://jav.com.tw/'},
        {'@type': 'ListItem', position: 2, name: '演員', item: 'https://jav.com.tw/actresses/'},
        {'@type': 'ListItem', position: 3, name: performer.primary_display_name, item: canonical},
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Person',
      '@id': canonical,
      url: canonical,
      name: performer.primary_display_name,
      alternateName: performer.schema_alternate_names,
    },
  ];
  const html = (robots = 'noindex,follow', records = structured, extraHead = '') => performerPageFixture(performer, {
    robots,
    structuredData: records,
    extraHead,
  });

  assert.equal(performer.index_decision, 'NOINDEX_THIN');
  assert.doesNotThrow(() => validatePerformerPageHtml({performer, html: html()}));
  assert.throws(() => validatePerformerPageHtml({performer, html: html('index,follow')}), /thin performer must render noindex,follow/u);
  assert.throws(
    () => validatePerformerPageHtml({performer, html: html('noindex,follow', structured, '<link rel="canonical" href="https://example.invalid/">')}),
    /exactly one canonical/u,
  );
  assert.throws(
    () => validatePerformerPageHtml({performer, html: html('noindex,follow', structured, '<meta name="robots" content="index,follow">')}),
    /thin performer must render noindex,follow/u,
  );
  const indexReady = {...performer, index_decision: 'INDEX_READY'};
  const conflictingIndexRobots = performerPageFixture(indexReady, {
    extraHead: '<meta name="robots" content="noindex,follow">',
  });
  assert.throws(
    () => validatePerformerPageHtml({performer: indexReady, html: conflictingIndexRobots}),
    /duplicate robots metadata/u,
  );
  const wrongAlternate = clone(structured);
  wrongAlternate[1].alternateName = ['星空音琉'];
  assert.throws(() => validatePerformerPageHtml({performer, html: html('noindex,follow', wrongAlternate)}), /alternateName differs/u);
  const withVideo = clone(structured);
  withVideo.push({'@context': 'https://schema.org', '@type': 'VideoObject'});
  assert.throws(() => validatePerformerPageHtml({performer, html: html('noindex,follow', withVideo)}), /must not emit VideoObject/u);
  const withSameAs = clone(structured);
  withSameAs[1].sameAs = 'https://example.invalid/person';
  assert.throws(() => validatePerformerPageHtml({performer, html: html('noindex,follow', withSameAs)}), /sameAs/u);
});

test('performer postbuild file set rejects flat or otherwise unapproved HTML outputs', async () => {
  const catalog = await loadPerformerCatalog();
  const valid = [
    'actresses/index.html',
    ...catalog.performers.map(({route_segment: segment}) => `actresses/${segment}/index.html`),
  ];
  assert.doesNotThrow(() => validatePerformerHtmlFileSet({allHtmlPaths: valid, performers: catalog.performers}));
  assert.throws(
    () => validatePerformerHtmlFileSet({
      allHtmlPaths: [...valid, 'actresses/legacy-name.html'],
      performers: catalog.performers,
    }),
    /extra=actresses\/legacy-name\.html/u,
  );
});

test('Person Schema alternate names remain the exact approved union', async () => {
  const catalog = await loadPerformerCatalog();
  const actual = [...new Set(catalog.performers.flatMap(({schema_alternate_names: names}) => names))].sort();
  assert.deepEqual(actual, [...APPROVED_SCHEMA_ALTERNATE_NAMES].sort());
  for (const forbidden of FORBIDDEN_SCHEMA_ALTERNATE_NAMES) assert.ok(!actual.includes(forbidden));
});

test('primary display and alias channels preserve approved localization boundaries', async () => {
  const catalog = await loadPerformerCatalog();
  const byId = new Map(catalog.performers.map((performer) => [performer.stable_performer_id, performer]));
  const approved = new Map([
    ['cc18.tv:actor:30343', '相澤澪'], ['cc18.tv:actor:25064', '鷲尾芽衣'],
    ['cc18.tv:actor:28722', '淺野心'], ['cc18.tv:actor:25389', '七森莉莉'],
  ]);
  for (const [id, name] of approved) assert.equal(byId.get(id).primary_display_name, name);
  const sourceTitleAliases = new Map([
    ['cc18.tv:actor:27185', '一之瀨蘭'], ['cc18.tv:actor:29885', '柚木蓮花'],
    ['cc18.tv:actor:54025', '柊紅葉'], ['cc18.tv:actor:54454', '星空音琉'],
  ]);
  for (const [id, alias] of sourceTitleAliases) {
    const performer = byId.get(id);
    assert.deepEqual(performer.source_title_aliases.map(({name}) => name), [alias]);
    assert.ok(performer.searchable_aliases.some(({name}) => name === alias));
    assert.ok(!performer.schema_alternate_names.includes(alias));
    assert.notEqual(performer.primary_display_name, alias);
  }
  const saika = byId.get('cc18.tv:actor:34284');
  assert.ok(saika.searchable_aliases.some(({name}) => name === '河北彩伽'));
  assert.ok(!saika.schema_alternate_names.includes('河北彩伽'));
  assert.deepEqual(byId.get('cc18.tv:actor:30343').schema_alternate_names, ['相沢澪']);
});

test('a second typed public work changes index policy without a hardcoded performer exception', async () => {
  const inputs = clone(await formalInputs());
  const targetId = 'cc18.tv:actor:25064';
  const baseline = buildPerformerCatalog(clone(inputs)).performers
    .find(({stable_performer_id: id}) => id === targetId);
  assert.ok(baseline);
  const targetMaster = inputs.masters.find(({source}) => source.catalog_code === 'ENDS-322');
  assert.ok(!baseline.public_works.some(({stable_movie_id: id}) => id === targetMaster.stable_movie_id));
  targetMaster.source.performer_relations = [{
    source_type: 'actor', source_id: '25064', stable_source_id: targetId, source_name: '鷲尾めい',
    source_url: 'https://cc18.tv/search.php?s_type=actor&s_tid=25064', observed_at: '2026-08-01T00:00:00.000Z',
  }];
  targetMaster.display.performers = [{
    source_actor_id: targetId, name_ja: '鷲尾めい', display_name_zh_tw: '鷲尾芽衣',
    display_name: '鷲尾芽衣', verification_status: 'VERIFIED_TW_MARKET',
  }];
  inputs.searchIndex.performers.find(({stable_actor_id: id}) => id === targetId).related_movie_ids.push(targetMaster.stable_movie_id);
  const catalog = buildPerformerCatalog(inputs);
  const performer = catalog.performers.find(({stable_performer_id: id}) => id === targetId);
  assert.equal(performer.public_work_count, baseline.public_work_count + 1);
  assert.equal(performer.index_decision, 'INDEX_READY');
  assert.deepEqual(
    new Set(performer.public_works.map(({catalog_code: code}) => code)),
    new Set([...baseline.public_works.map(({catalog_code: code}) => code), 'ENDS-322']),
  );
});

test('a later source spelling does not replace the existing performer name without approved localization', async () => {
  const inputs = clone(await formalInputs());
  const actorId = 'cc18.tv:actor:25186';
  const oldMaster = inputs.masters.find(({source}) => source.catalog_code === 'DSOD-074');
  const oldCard = inputs.cards.find(({catalog_code: code}) => code === 'DSOD-074');
  const newMaster = clone(oldMaster);
  newMaster.stable_movie_id = 'cc18:DSOD-117';
  newMaster.source.catalog_code = 'DSOD-117';
  newMaster.source.performer_relations[0].source_name = '姬咲華';
  newMaster.display.performers[0].display_name = '姬咲華';
  const newCard = {...clone(oldCard), stable_movie_id: newMaster.stable_movie_id, catalog_code: 'DSOD-117'};
  inputs.masters.push(newMaster);
  inputs.cards.unshift(newCard);
  const search = inputs.searchIndex.performers.find(({stable_actor_id: id}) => id === actorId);
  search.related_movie_ids.push(newMaster.stable_movie_id);
  const performer = buildPerformerCatalog(inputs).performers.find(({stable_performer_id: id}) => id === actorId);
  assert.equal(performer.primary_display_name, '姫咲華');
  assert.equal(performer.public_work_count, 2);
  search.source_name = '未見於任何來源的姓名';
  assert.throws(() => buildPerformerCatalog(inputs), /Search source name is absent from typed performer relations/u);
});

test('a future typed performer is data-driven and same-name identities remain separate', async () => {
  const inputs = clone(await formalInputs());
  const baselinePerformerCount = buildPerformerCatalog(clone(inputs)).performers.length;
  const targetMaster = inputs.masters.find(({source}) => source.catalog_code === 'ENDS-322');
  const id = 'cc18.tv:actor:999999';
  const name = '美咲音';
  targetMaster.source.performer_relations = [{
    source_type: 'actor', source_id: '999999', stable_source_id: id, source_name: name,
    source_url: 'https://cc18.tv/search.php?s_type=actor&s_tid=999999', observed_at: '2026-08-01T00:00:00.000Z',
  }];
  targetMaster.display.performers = [{source_actor_id: id, name_ja: name, display_name_zh_tw: null, display_name: name, verification_status: 'SOURCE_NAME_UNCHANGED'}];
  inputs.localization.performers.push({
    source_actor_id: id, source_name: name, name_ja: name, display_name_zh_tw: null, aliases: [],
    verification_status: 'SOURCE_NAME_UNCHANGED', source_references: [{type: 'TEST', url: 'https://cc18.tv/'}],
  });
  inputs.searchIndex.performers.push({
    stable_actor_id: id, display_name: name, display_name_zh_tw: null, name_ja: name,
    source_name: name, searchable_aliases: [], related_movie_ids: [targetMaster.stable_movie_id],
  });
  const catalog = buildPerformerCatalog(inputs);
  assert.equal(catalog.performers.length, baselinePerformerCount + 1);
  const sameNamePerformers = catalog.performers.filter(({primary_display_name: primary}) => primary === name);
  assert.equal(sameNamePerformers.length, 2);
  assert.equal(catalog.performers.some(({stable_performer_id: performerId}) => performerId === id), true);
  assert.equal(new Set(sameNamePerformers.map(({metadata_identity_label: label}) => label)).size, 2);
  for (const performer of sameNamePerformers) {
    assert.equal(performer.metadata_identity_label, `${name}（${performer.stable_performer_id}）`);
    assert.doesNotThrow(() => validatePerformerPageHtml({
      performer,
      html: performerPageFixture(performer),
    }));
  }
  const unrelated = catalog.performers.find(({primary_display_name: primary}) => primary !== name);
  assert.equal(unrelated.metadata_identity_label, unrelated.primary_display_name);
});

test('a new typed performer uses the source name until localization exists', async () => {
  const inputs = clone(await formalInputs());
  const targetMaster = inputs.masters.find(({source}) => source.catalog_code === 'ENDS-322');
  const id = 'cc18.tv:actor:999998';
  const name = '來源新人物';
  targetMaster.source.performer_relations = [{
    source_type: 'actor', source_id: '999998', stable_source_id: id, source_name: name,
    source_url: 'https://cc18.tv/search.php?s_type=actor&s_tid=999998', observed_at: '2026-08-01T00:00:00.000Z',
  }];
  targetMaster.display.performers = [{
    source_actor_id: id, name_ja: null, display_name_zh_tw: null,
    display_name: name, verification_status: 'SOURCE_NAME_FALLBACK',
  }];
  inputs.searchIndex.performers.push({
    stable_actor_id: id, display_name: name, display_name_zh_tw: null, name_ja: null,
    source_name: name, searchable_aliases: [], related_movie_ids: [targetMaster.stable_movie_id],
  });
  const catalog = buildPerformerCatalog(inputs);
  const performer = catalog.performers.find(({stable_performer_id: performerId}) => performerId === id);
  assert.equal(performer.primary_display_name, name);
  assert.equal(performer.verification_status, undefined);
  assert.deepEqual(performer.searchable_aliases, []);
  assert.deepEqual(performer.schema_alternate_names, []);
  const projection = validatePerformerRelations({
    catalogCode: 'TEST-001',
    source: {
      actress: [name], fetched_at: '2026-08-01T00:00:00.000Z',
      source_relations: {performers: [{...targetMaster.source.performer_relations[0]}]},
    },
    isPublished: true,
    localizations: new Map(),
    usedPerformerIds: new Set(),
  });
  assert.equal(projection.displayProjection[0].display_name, name);
  assert.equal(projection.displayProjection[0].verification_status, 'SOURCE_NAME_FALLBACK');
});

test('catalog fails closed before deduplication on duplicate and mismatched identity data', async () => {
  const base = await formalInputs();
  const duplicateRelation = clone(base);
  const master = duplicateRelation.masters.find(({source}) => source.performer_relations.length > 0);
  master.source.performer_relations.push(clone(master.source.performer_relations[0]));
  master.display.performers.push(clone(master.display.performers[0]));
  assert.throws(() => buildPerformerCatalog(duplicateRelation), /duplicate typed performer relation/);

  const displayMismatch = clone(base);
  displayMismatch.masters.find(({display}) => display.performers.length).display.performers[0].display_name = '錯誤姓名';
  assert.throws(() => buildPerformerCatalog(displayMismatch), /display performer display_name mismatch/);

  const wrongSearchWork = clone(base);
  wrongSearchWork.searchIndex.performers[0].related_movie_ids = ['cc18:NOT-REAL'];
  assert.throws(() => buildPerformerCatalog(wrongSearchWork), /Search related works differ/);

  const duplicateDictionary = clone(base);
  duplicateDictionary.localization.performers.push(clone(duplicateDictionary.localization.performers[0]));
  assert.throws(() => buildPerformerCatalog(duplicateDictionary), /Duplicate localization performer ID/);

  const duplicateMovie = clone(base);
  const duplicateTarget = duplicateMovie.masters.find(({stable_movie_id: id}) => id === duplicateMovie.cards[0].stable_movie_id);
  duplicateMovie.masters.push(clone(duplicateTarget));
  assert.throws(() => buildPerformerCatalog(duplicateMovie), /exactly one matching Movie Master/);

  const missingMovieId = clone(base);
  const missingTarget = missingMovieId.masters.find(({stable_movie_id: id}) => id === missingMovieId.cards[0].stable_movie_id);
  delete missingTarget.stable_movie_id;
  assert.throws(() => buildPerformerCatalog(missingMovieId), /exactly one matching Movie Master/);
});

test('catalog cross-checks every approved display field', async () => {
  const base = await formalInputs();
  for (const field of ['source_actor_id', 'name_ja', 'display_name_zh_tw', 'display_name', 'verification_status']) {
    const inputs = clone(base);
    const display = inputs.masters.find(({display: value}) => value.performers.length).display.performers[0];
    display[field] = field === 'display_name_zh_tw' ? '錯誤繁中' : '錯誤值';
    assert.throws(() => buildPerformerCatalog(inputs), field === 'source_actor_id' ? /Invalid performer stable ID/u : new RegExp(`display performer ${field} mismatch`), field);
  }
});

test('localization policy enforces aliases, schema boundaries and all fallback layers', async () => {
  const localization = await readJson('data/localization/performers-zh-tw.json');
  const map = buildPerformerLocalizationMap(localization);
  const schema = new Set([...map.values()].flatMap(({schema_alternate_names: names}) => names));
  assert.deepEqual([...schema].sort(), ['七ツ森りり', '浅野こころ', '相沢澪', '鷲尾めい'].sort());
  for (const name of ['一之瀨蘭', '柚木蓮花', '柊紅葉', '星空音琉', '河北彩伽']) assert.ok(!schema.has(name), name);

  const base = {source_actor_id: 'cc18.tv:actor:3', source_name: '來源名', name_ja: null, display_name_zh_tw: null, aliases: [], verification_status: 'SOURCE_NAME_UNCHANGED', source_references: [{}]};
  assert.equal(buildPerformerLocalizationMap({performers: [base]}).get(base.source_actor_id).primary_display_name, '來源名');
  assert.equal(buildPerformerLocalizationMap({performers: [{...base, name_ja: '日文名'}]}).get(base.source_actor_id).primary_display_name, '日文名');
  assert.equal(buildPerformerLocalizationMap({performers: [{...base, name_ja: '日文名', display_name_zh_tw: '繁中名', verification_status: 'VERIFIED_TW_MARKET'}]}).get(base.source_actor_id).primary_display_name, '繁中名');

  const official = {...base, aliases: [{name: '未核准', type: 'OFFICIAL_JA_NAME', verification_status: 'UNVERIFIED', searchable: true}]};
  assert.throws(() => buildPerformerLocalizationMap({performers: [official]}), /approved verification status/u);
  const unknown = {...base, aliases: [{name: '未知', type: 'UNKNOWN', verification_status: 'UNVERIFIED', searchable: false}]};
  assert.throws(() => buildPerformerLocalizationMap({performers: [unknown]}), /unknown alias type/u);
  const duplicate = {...base, aliases: [
    {name: '重複', type: 'OFFICIAL_JA_NAME', verification_status: 'VERIFIED_ORTHOGRAPHIC', searchable: true},
    {name: '重複', type: 'VERIFIED_FORMER_STAGE_NAME', verification_status: 'VERIFIED_TW_MARKET', searchable: true},
  ]};
  assert.throws(() => buildPerformerLocalizationMap({performers: [duplicate]}), /duplicate or NFKC-conflicting alias/u);

  const sourceConflict = {...base, aliases: [{name: '來源名', type: 'SOURCE_TITLE_ALIAS', verification_status: 'SOURCE_ATTESTED', searchable: true, display_as_primary: false, source_references: ['fixture']}]};
  assert.throws(() => buildPerformerLocalizationMap({performers: [sourceConflict]}), /conflicts with source_name/u);
  const nfkcConflict = {...base, source_name: 'ＡＢＣ', name_ja: null, aliases: [{name: 'ABC', type: 'VERIFIED_FORMER_STAGE_NAME', verification_status: 'VERIFIED_TW_MARKET', searchable: true}]};
  assert.throws(() => buildPerformerLocalizationMap({performers: [nfkcConflict]}), /conflicts with source_name/u);
  const primaryAlias = {...base, aliases: [{name: '別名', type: 'OFFICIAL_JA_NAME', verification_status: 'VERIFIED_ORTHOGRAPHIC', searchable: true, display_as_primary: true}]};
  assert.throws(() => buildPerformerLocalizationMap({performers: [primaryAlias]}), /cannot be a primary display name/u);
  const formerLeak = {...base, name_ja: '舊藝名', aliases: [{name: '舊藝名', type: 'VERIFIED_FORMER_STAGE_NAME', verification_status: 'VERIFIED_TW_MARKET', searchable: true}]};
  assert.throws(() => buildPerformerLocalizationMap({performers: [formerLeak]}), /conflicts with name_ja/u);
  const officialMirror = {...base, source_name: '正式日文', name_ja: '正式日文', aliases: [{name: '正式日文', type: 'OFFICIAL_JA_NAME', verification_status: 'VERIFIED_ORTHOGRAPHIC', searchable: true}]};
  assert.equal(buildPerformerLocalizationMap({performers: [officialMirror]}).get(base.source_actor_id).primary_display_name, '正式日文');
  const marketMirror = {...base, name_ja: '日文名', display_name_zh_tw: '繁中名', verification_status: 'VERIFIED_TW_MARKET', aliases: [{name: '繁中名', type: 'VERIFIED_TW_MARKET_NAME', verification_status: 'VERIFIED_TW_MARKET', searchable: true}]};
  assert.equal(buildPerformerLocalizationMap({performers: [marketMirror]}).get(base.source_actor_id).primary_display_name, '繁中名');
});

test('Search builder validates the complete Movie Master authority chain', async () => {
  const inputs = await formalInputs();
  const card = inputs.cards.find(({catalog_code: code}) => code === 'SNOS-345');
  const index = await readJson('data/movie-master/index.json');
  const entry = index.entries.find(({stable_movie_id: id}) => id === card.stable_movie_id);
  const master = inputs.masters.find(({stable_movie_id: id}) => id === card.stable_movie_id);
  assert.deepEqual(validateSearchMasterAuthority({entry, card, master}), master.display.performers.map(({source_actor_id: id}) => id));

  const swappedPath = {...entry, master_path: 'data/movie-master/dsod-006.json'};
  assert.throws(() => validateSearchMasterAuthority({entry: swappedPath, card, master}), /master path must equal/u);
  const wrongStableId = clone(master);
  wrongStableId.stable_movie_id = 'cc18:OTHER-001';
  assert.throws(() => validateSearchMasterAuthority({entry, card, master: wrongStableId}), /stable movie ID must equal/u);
  assert.throws(() => validateSearchMasterAuthority({entry, card: {...card, stable_movie_id: 'cc18:OTHER-001'}, master}), /stable movie ID must equal/u);
  const wrongCatalog = clone(master);
  wrongCatalog.source.catalog_code = 'OTHER-001';
  assert.throws(() => validateSearchMasterAuthority({entry, card, master: wrongCatalog}), /stable movie ID must equal/u);
  const missingDisplay = clone(master);
  delete missingDisplay.display.performers;
  assert.throws(() => validateSearchMasterAuthority({entry, card, master: missingDisplay}), /display performers must be an array/u);
  const wrongOrder = clone(inputs.masters.find(({source}) => source.performer_relations.length > 1));
  const wrongOrderCard = inputs.cards.find(({stable_movie_id: id}) => id === wrongOrder.stable_movie_id);
  const wrongOrderEntry = index.entries.find(({stable_movie_id: id}) => id === wrongOrder.stable_movie_id);
  wrongOrder.display.performers.reverse();
  assert.throws(() => validateSearchMasterAuthority({entry: wrongOrderEntry, card: wrongOrderCard, master: wrongOrder}), /identity, order or multiplicity/u);
  const wrongMultiplicity = clone(master);
  wrongMultiplicity.source.performer_relations.push(clone(wrongMultiplicity.source.performer_relations[0]));
  assert.throws(() => validateSearchMasterAuthority({entry, card, master: wrongMultiplicity}), /identity, order or multiplicity/u);
});

test('Search builder validates canonical movie identity before reading a Master path', async () => {
  const valid = {stableMovieId: 'cc18:TEST-001', catalogCode: 'TEST-001', masterPath: 'data/movie-master/test-001.json'};
  assert.deepEqual(validateCanonicalSearchMovieIdentity(valid), {stableMovieId: valid.stableMovieId, catalogCode: valid.catalogCode});
  for (const catalogCode of ['test-001', ' TEST-001', 'TEST-001 ', 'TEST/001', 'TEST\\001', 'TEST..-001', 'TEST%2D001']) {
    assert.throws(() => validateCanonicalSearchMovieIdentity({...valid, catalogCode}), /invalid canonical catalog code/u, catalogCode);
  }
  assert.throws(() => validateCanonicalSearchMovieIdentity({...valid, stableMovieId: 'cc18:test-001'}), /stable movie ID must equal/u);
  for (const masterPath of ['data/movie-master/TEST-001.json', 'data/movie-master/../test-001.json', 'data\\movie-master\\test-001.json', 'data/movie-master/test%2D001.json']) {
    assert.throws(() => validateCanonicalSearchIndexEntryIdentity({stable_movie_id: valid.stableMovieId, catalog_code: valid.catalogCode, master_path: masterPath}), /master path must equal/u, masterPath);
  }
  let reads = 0;
  const invalidEntry = {stable_movie_id: valid.stableMovieId, catalog_code: valid.catalogCode, master_path: '../test-001.json', is_published: true, is_demo: false};
  await assert.rejects(
    loadSearchAuthorityBindings({entries: [invalidEntry]}, {cards: []}, {loadMaster: async () => { reads += 1; }}),
    /master path must equal/u,
  );
  assert.equal(reads, 0);

  for (const {label, include, masterPath} of [
    {label: 'missing', include: false},
    {label: 'undefined', include: true, masterPath: undefined},
    {label: 'null', include: true, masterPath: null},
    {label: 'empty', include: true, masterPath: ''},
    {label: 'blank', include: true, masterPath: '   '},
  ]) {
    reads = 0;
    const missingPathEntry = {stable_movie_id: valid.stableMovieId, catalog_code: valid.catalogCode, is_published: true, is_demo: false};
    if (include) missingPathEntry.master_path = masterPath;
    await assert.rejects(
      loadSearchAuthorityBindings(
        {entries: [missingPathEntry]},
        {cards: [{stable_movie_id: valid.stableMovieId, catalog_code: valid.catalogCode}]},
        {loadMaster: async () => {
          reads += 1;
          return {stable_movie_id: valid.stableMovieId, source: {catalog_code: valid.catalogCode, performer_relations: []}, display: {performers: []}, publishing: {is_published: true, indexability: 'INDEX'}};
        }},
      ),
      /master path must equal/u,
    );
    assert.equal(reads, 0, label);
  }
});

test('Search builder enforces an exact entry, Master and card bijection', async () => {
  const entry = (code) => ({stable_movie_id: `cc18:${code}`, catalog_code: code, master_path: `data/movie-master/${code.toLowerCase()}.json`, is_published: true, is_demo: false});
  const master = (code, relations = [], performers = []) => ({stable_movie_id: `cc18:${code}`, is_demo: false, source: {catalog_code: code, performer_relations: relations}, display: {performers}, publishing: {is_published: true, indexability: 'INDEX'}});
  const card = (code) => ({stable_movie_id: `cc18:${code}`, catalog_code: code});
  const entries = [entry('TEST-001'), entry('TEST-002')];
  const cards = [card('TEST-001'), card('TEST-002')];
  const masterMap = new Map(entries.map((item) => [item.master_path, master(item.catalog_code)]));
  assert.equal((await loadSearchAuthorityBindings({entries}, {cards}, {loadMaster: async (path) => clone(masterMap.get(path))})).length, 2);

  const copied = new Map(masterMap);
  copied.set(entries[1].master_path, master('TEST-001'));
  await assert.rejects(loadSearchAuthorityBindings({entries}, {cards}, {loadMaster: async (path) => clone(copied.get(path))}), /TEST-002 Movie Master/u);

  const duplicateEntries = [entries[0], clone(entries[0])];
  await assert.rejects(loadSearchAuthorityBindings({entries: duplicateEntries}, {cards: [cards[0]]}, {loadMaster: async (path) => clone(masterMap.get(path))}), /Duplicate Movie Master index identity/u);

  await assert.rejects(loadSearchAuthorityBindings({entries}, {cards: [cards[0], clone(cards[0])]}, {loadMaster: async (path) => clone(masterMap.get(path))}), /Duplicate published MovieCard identity/u);

  const actorRelation = {source_type: 'actor', stable_source_id: 'cc18.tv:actor:3'};
  const invalidRelations = new Map(masterMap);
  invalidRelations.set(entries[1].master_path, master('TEST-002', [actorRelation], []));
  await assert.rejects(loadSearchAuthorityBindings({entries}, {cards}, {loadMaster: async (path) => clone(invalidRelations.get(path))}), /identity, order or multiplicity/u);
  await assert.rejects(loadSearchAuthorityBindings({entries}, {cards: [cards[0], clone(cards[0])]}, {loadMaster: async (path) => clone(invalidRelations.get(path))}), /identity, order or multiplicity/u);
});

test('content identity uses ordered stable relations and rejects malformed URLs', () => {
  const localizations = buildPerformerLocalizationMap({performers: [1, 2].map((n) => ({
    source_actor_id: `cc18.tv:actor:${n}`, source_name: '同名', name_ja: '同名', display_name_zh_tw: null,
    aliases: [], verification_status: 'SOURCE_NAME_UNCHANGED', source_references: [{}],
  }))});
  const relation = (id, url = `https://cc18.tv/search.php?s_type=actor&s_tid=${id}`) => ({
    source_type: 'actor', source_id: id, stable_source_id: `cc18.tv:actor:${id}`, source_name: '同名', source_url: url,
  });
  assert.equal(validatePerformerIdentity({catalogCode: 'TEST', registryNames: ['同名', '同名'], sourceNames: ['同名', '同名'], relations: [relation('1'), relation('2')], localizations}), true);
  assert.throws(() => validatePerformerIdentity({catalogCode: 'TEST', registryNames: ['同名', '同名'], sourceNames: ['同名', '同名'], relations: [relation('1'), relation('1')], localizations}), /duplicate stable actor ID/u);
  assert.throws(() => validatePerformerIdentity({catalogCode: 'TEST', registryNames: ['同名'], sourceNames: ['同名', '同名'], relations: [relation('1'), relation('2')], localizations}), /Registry\/source/u);
  for (const url of ['https://evil.example/search.php?s_type=actor&s_tid=1', 'https://cc18.tv/search.php?s_type=actor&s_tid=01', 'https://cc18.tv/search.php?s_type=actor&s_tid=%31', 'https://cc18.tv/search.php?s_type=actor&s_tid=1&s_tid=2']) {
    assert.throws(() => validatePerformerIdentity({catalogCode: 'TEST', registryNames: ['同名'], sourceNames: ['同名'], relations: [relation('1', url)], localizations}));
  }
});

test('catalog ignores excluded incomplete masters and distinguishes raw-only from no-data', async () => {
  const formal = await formalInputs();
  const withoutExcluded = buildPerformerCatalog(clone(formal));
  const baselineInputs = clone(formal);
  baselineInputs.masters.push({stable_movie_id: 'bad excluded draft', source: {catalog_code: 'DRAFT', performer_relations: 'invalid'}});
  const baseline = buildPerformerCatalog(baselineInputs);
  assert.equal(baseline.raw_only_work_count, withoutExcluded.raw_only_work_count);
  assert.equal(baseline.no_performer_data_work_count, withoutExcluded.no_performer_data_work_count);

  const inputs = clone(baselineInputs);
  const publicIds = new Set(inputs.cards.map(({stable_movie_id: id}) => id));
  const publicMaster = inputs.masters.find(({stable_movie_id: id, source}) => (
    publicIds.has(id)
    && source.performer_relations.length === 0
    && source.raw_performer_names.length === 0
  ));
  assert.ok(publicMaster, 'fixture must include a public work with no performer data');
  publicMaster.source.raw_performer_names = ['來源人物'];
  const catalog = buildPerformerCatalog(inputs);
  assert.equal(catalog.raw_only_work_count, baseline.raw_only_work_count + 1);
  assert.equal(catalog.no_performer_data_work_count, baseline.no_performer_data_work_count - 1);
  const unused = clone(inputs);
  unused.localization.performers.push({source_actor_id: 'cc18.tv:actor:999999', source_name: '未公開', name_ja: null, display_name_zh_tw: null, aliases: [], verification_status: 'SOURCE_NAME_UNCHANGED', source_references: [{}]});
  assert.equal(buildPerformerCatalog(unused).performers.some(({stable_performer_id: id}) => id === 'cc18.tv:actor:999999'), false);
});

test('public index entry cannot bind a card to a different master', () => {
  const card = {stable_movie_id: 'cc18:TEST-001', catalog_code: 'TEST-001'};
  const entry = {stable_movie_id: card.stable_movie_id, catalog_code: card.catalog_code, master_path: 'data/movie-master/test-001.json'};
  assert.equal(validatePublicPerformerIndexEntry(card, entry, {stable_movie_id: card.stable_movie_id, source: {catalog_code: card.catalog_code}}), true);
  assert.throws(() => validatePublicPerformerIndexEntry(card, entry, {stable_movie_id: 'cc18:OTHER-001', source: {catalog_code: 'OTHER-001'}}), /identity/u);
});

test('Movie Master consumers validate canonical entry authority before every Master read', async () => {
  const validEntry = {stable_movie_id: 'cc18:TEST-001', catalog_code: 'TEST-001', master_path: 'data/movie-master/test-001.json', is_published: true, is_demo: false};
  const invalidEntries = [
    ['missing', Object.fromEntries(Object.entries(validEntry).filter(([key]) => key !== 'master_path'))],
    ['undefined', {...validEntry, master_path: undefined}],
    ['null', {...validEntry, master_path: null}],
    ['empty', {...validEntry, master_path: ''}],
    ['blank', {...validEntry, master_path: '   '}],
    ['number', {...validEntry, master_path: 7}],
    ['absolute', {...validEntry, master_path: 'C:/tmp/test-001.json'}],
    ['parent', {...validEntry, master_path: '../test-001.json'}],
    ['dot segment', {...validEntry, master_path: 'data/movie-master/./test-001.json'}],
    ['backslash', {...validEntry, master_path: 'data\\movie-master\\test-001.json'}],
    ['percent', {...validEntry, master_path: 'data/movie-master/test%2D001.json'}],
    ['query', {...validEntry, master_path: 'data/movie-master/test-001.json?x=1'}],
    ['fragment', {...validEntry, master_path: 'data/movie-master/test-001.json#x'}],
    ['catalog', {...validEntry, catalog_code: 'TEST/001'}],
    ['stable ID', {...validEntry, stable_movie_id: 'cc18:EVIL'}],
  ];
  const matchingMaster = {stable_movie_id: validEntry.stable_movie_id, source: {catalog_code: validEntry.catalog_code}, publishing: {is_published: true, indexability: 'INDEX'}, display: {performers: []}};
  for (const [label, entry] of invalidEntries) {
    let reads = 0;
    await assert.rejects(loadPublishedMovieCardRecords({
      loadIndex: async () => ({entries: [entry]}),
      loadTaxonomy: async () => ({tags: []}),
      loadMaster: async () => { reads += 1; return clone(matchingMaster); },
    }), undefined, label);
    assert.equal(reads, 0, `MovieCard loader read for ${label}`);

    reads = 0;
    await assert.rejects(loadPerformerCatalog({
      loadCardCatalog: async () => ({cards: [{stable_movie_id: validEntry.stable_movie_id, catalog_code: validEntry.catalog_code}]}),
      loadIndex: async () => ({entries: [entry]}),
      loadLocalization: async () => ({performers: []}),
      loadSearchIndex: async () => ({performers: []}),
      loadMaster: async () => { reads += 1; return clone(matchingMaster); },
    }), undefined, label);
    assert.equal(reads, 0, `Performer Catalog loader read for ${label}`);
  }
});

test('Performer Catalog binds canonical catalog codes, stable IDs and Master identities', () => {
  const card = {stable_movie_id: 'cc18:TEST-001', catalog_code: 'TEST-001'};
  const entry = {stable_movie_id: card.stable_movie_id, catalog_code: card.catalog_code, master_path: 'data/movie-master/test-001.json'};
  const master = {stable_movie_id: card.stable_movie_id, source: {catalog_code: card.catalog_code, performer_relations: []}, display: {performers: []}};
  assert.deepEqual(validateCanonicalMovieIdentity({stableMovieId: card.stable_movie_id, catalogCode: card.catalog_code}), {stableMovieId: card.stable_movie_id, catalogCode: card.catalog_code});
  assert.equal(validateCanonicalMovieMasterIndexEntry(entry).masterPath, entry.master_path);
  assert.equal(validatePublicPerformerIndexEntry(card, entry, master), true);
  assert.equal(buildPerformerCatalog({cards: [card], masters: [master], localization: {performers: []}, searchIndex: {performers: []}}).public_work_count, 1);

  const selfConsistentWrongId = 'cc18:EVIL';
  const wrongCard = {...card, stable_movie_id: selfConsistentWrongId};
  const wrongEntry = {...entry, stable_movie_id: selfConsistentWrongId};
  const wrongMaster = {...master, stable_movie_id: selfConsistentWrongId};
  assert.throws(() => validatePublicPerformerIndexEntry(wrongCard, wrongEntry, wrongMaster), /stable movie ID must equal/u);
  assert.throws(
    () => buildPerformerCatalog({cards: [wrongCard], masters: [wrongMaster], localization: {performers: []}, searchIndex: {performers: []}}),
    /stable movie ID must equal/u,
  );
});

test('Search postbuild enforces complete bidirectional collections', () => {
  const valid = {counts: {movies: 1, performers: 1}, movies: [{card: {stable_movie_id: 'cc18:TEST-001', catalog_code: 'TEST-001'}, performer_ids: ['cc18.tv:actor:3']}], performers: [{stable_actor_id: 'cc18.tv:actor:3', related_movie_ids: ['cc18:TEST-001']}]};
  const cards = [{stable_movie_id: 'cc18:TEST-001', catalog_code: 'TEST-001'}];
  assert.equal(validateSearchIndexCollections(valid, cards), undefined);
  const cases = [
    [Object.fromEntries(Object.entries(valid).filter(([key]) => key !== 'movies')), /movies must be an array/u],
    [Object.fromEntries(Object.entries(valid).filter(([key]) => key !== 'performers')), /performers must be an array/u],
    [{...clone(valid), counts: {movies: 2, performers: 1}}, /movie count/u],
    [{...clone(valid), performers: [{stable_actor_id: 'cc18.tv:actor:3', related_movie_ids: []}]}, /orphan/u],
    [{...clone(valid), performers: [{stable_actor_id: 'cc18.tv:actor:3', related_movie_ids: ['cc18:OTHER']}]}, /unknown related work/u],
    [{...clone(valid), performers: [{stable_actor_id: 'cc18.tv:actor:3', related_movie_ids: ['cc18:TEST-001', 'cc18:TEST-001']}]}, /duplicate related work/u],
    [{...clone(valid), movies: [{...valid.movies[0], performer_ids: ['cc18.tv:actor:03']}]}, /Invalid performer stable ID/u],
  ];
  for (const [input, expected] of cases) assert.throws(() => validateSearchIndexCollections(input, cards), expected);

  const invalidId = clone(valid);
  invalidId.movies[0].card.stable_movie_id = 'totally-not-a-cc18-id';
  assert.throws(() => validateSearchIndexCollections(invalidId, cards), /stable movie ID must equal/u);
  const differentId = clone(valid);
  differentId.movies[0].card = {stable_movie_id: 'cc18:OTHER-001', catalog_code: 'OTHER-001'};
  assert.throws(() => validateSearchIndexCollections(differentId, cards), /Extra or orphan Search movie ID/u);
  const wrongCatalog = clone(valid);
  wrongCatalog.movies[0].card.catalog_code = 'WRONG-001';
  assert.throws(() => validateSearchIndexCollections(wrongCatalog, cards), /stable movie ID must equal/u);
  const illegalCatalog = clone(valid);
  illegalCatalog.movies[0].card = {stable_movie_id: 'cc18:TEST/001', catalog_code: 'TEST/001'};
  assert.throws(() => validateSearchIndexCollections(illegalCatalog, [{stable_movie_id: 'cc18:TEST/001', catalog_code: 'TEST/001'}]), /invalid canonical catalog code/u);
  const extra = clone(valid);
  extra.counts.movies = 2;
  extra.movies.push({card: {stable_movie_id: 'cc18:EXTRA-001', catalog_code: 'EXTRA-001'}, performer_ids: []});
  assert.throws(() => validateSearchIndexCollections(extra, cards), /count differs/u);
});

test('Movie Master and Search consumers reject loose performer IDs behaviorally', async () => {
  assert.throws(() => performerDictionary({performers: [{source_actor_id: ' cc18.tv:actor:3'}]}), /Invalid performer stable ID/);
  assert.throws(() => buildSearchLocalizationMap({performers: [{source_actor_id: 'cc18.tv:actor:03'}]}), /Invalid performer stable ID/);
  assert.throws(() => validateSearchDisplayPerformers([{source_actor_id: 'cc18.tv:actor:0'}], 'TEST-001'), /Invalid performer stable ID/);
  assert.throws(() => validateSearchPerformerIds([{stable_actor_id: 'cc18.tv:actor:3 '}]), /Invalid performer stable ID/);
  assert.throws(() => validateSearchPerformerIds(
    [{stable_actor_id: 'cc18.tv:actor:3'}],
    [{card: {catalog_code: 'TEST-001'}, performer_ids: ['cc18.tv:actor:03']}],
  ), /Invalid performer stable ID/);

  const localizations = new Map([['cc18.tv:actor:3', {source_name: '測試', name_ja: '測試', display_name_zh_tw: null}]]);
  assert.throws(() => validatePerformerRelations({
    catalogCode: 'TEST-001',
    source: {
      actress: ['測試'], fetched_at: '2026-08-01T00:00:00.000Z',
      source_relations: {performers: [{
        source_type: 'actor', source_id: '03', stable_source_id: 'cc18.tv:actor:03', source_name: '測試',
        source_url: 'https://cc18.tv/search.php?s_type=actor&s_tid=03', observed_at: '2026-08-01T00:00:00.000Z',
      }]},
    },
    isPublished: true,
    localizations,
    usedPerformerIds: new Set(),
  }), /Invalid performer source ID/);

  assert.throws(() => validatePerformerRelations({
    catalogCode: 'TEST-002',
    source: {
      actress: ['測試'], fetched_at: '2026-08-01T00:00:00.000Z',
      source_relations: {performers: [{
        source_type: 'actor', source_id: '3', stable_source_id: 'cc18.tv:actor:3', source_name: '測試',
        source_url: 'https://cc18.tv/search.php?s_type=actor&s_tid=%33', observed_at: '2026-08-01T00:00:00.000Z',
      }]},
    },
    isPublished: true,
    localizations,
    usedPerformerIds: new Set(),
  }), /invalid performer relation URL/);
});

test('performer identity validation accepts an exact source-name fallback without a localization record', () => {
  const relation = {
    source_type: 'actor', source_id: '999998', stable_source_id: 'cc18.tv:actor:999998', source_name: '來源新人物',
    source_url: 'https://cc18.tv/search.php?s_type=actor&s_tid=999998',
  };
  assert.equal(validatePerformerIdentity({
    catalogCode: 'TEST-001',
    registryNames: ['來源新人物'],
    sourceNames: ['來源新人物'],
    relations: [relation],
    localizations: new Map(),
  }), true);
});
