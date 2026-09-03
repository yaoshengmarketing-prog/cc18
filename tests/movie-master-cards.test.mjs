import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {access, cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {
  loadLatestAddedMovieCardCatalog,
  loadLatestAddedPromoCatalog,
  loadPublishedMovieCardCatalog,
  projectLatestAddedPromoRecords,
  sortLatestAddedMovieCardRecords,
} from '../src/lib/movie-master.mjs';
import {loadPerformerCatalog} from '../src/lib/performer-catalog.mjs';
import {
  assertUniqueStableMovieIds,
  expectedCloudflareRedirects,
  isPublicMovieCardMaster,
  LEGACY_PERFORMER_REDIRECTS,
  LEGACY_SERIES_REDIRECTS,
} from '../scripts/validate-movie-master-preview.mjs';
import {normalizeWorkSlug, resolveInternalWorkHref, workCanonicalUrl, workPath} from '../src/lib/work-url.mjs';
import {resolveProjectRoot} from '../src/lib/project-root.mjs';
import {firstPublishAuthorityPaths, selectMovieMasterReviewInputs} from '../scripts/build-movie-master.mjs';

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const execFileAsync = promisify(execFile);

const promoRecord = ({
  catalogCode = 'TEST-001',
  publishedAt = '2026-08-29',
  ref = `data/media-manifests/${catalogCode}.json#/video`,
  stableMovieId = `cc18:${catalogCode}`,
} = {}) => ({
  published_at: publishedAt,
  remotion_promo_ref: ref,
  card: {
    stable_movie_id: stableMovieId,
    catalog_code: catalogCode,
    title: `${catalogCode} short title`,
    href: `/works/${catalogCode.toLowerCase()}/`,
  },
});

const promoManifest = (id = 'TEST-001') => ({
  id,
  assets: [
    {role: 'article_hero', path: `/media/works/2026/08/${id}/hero.jpg`},
    {role: 'vertical_scene', path: `/media/works/2026/08/${id}/vertical.jpg`},
  ],
  video: {
    status: 'rendered_and_uploaded',
    duration_seconds: 9,
    width: 1080,
    height: 1920,
    codec: 'h264',
    public_path: `/media/works/2026/08/${id}/vertical.mp4`,
  },
});

test('Movie Master admits only one explicitly named untracked first-publish authority bundle', () => {
  const selected = selectMovieMasterReviewInputs({
    trackedPaths: ['content/reviews/OLD-001.md'],
    untrackedPaths: ['content/reviews/NEW-001.md', 'content/reviews/DRAFT-002.md'],
    includeWorkId: 'NEW-001',
  });
  assert.deepEqual(selected, ['content/reviews/NEW-001.md', 'content/reviews/OLD-001.md']);
  const authority = firstPublishAuthorityPaths('NEW-001');
  assert.ok(authority.has('content/reviews/NEW-001.md'));
  assert.ok(authority.has('data/source-records/NEW-001.json'));
  assert.ok(authority.has('data/media-manifests/NEW-001.json'));
  assert.equal([...authority].some((path) => path.includes('DRAFT-002')), false);
  assert.throws(
    () => selectMovieMasterReviewInputs({trackedPaths: [], untrackedPaths: ['content/reviews/DRAFT-002.md'], includeWorkId: 'NEW-001'}),
    /exact first-publish review input not found/,
  );
  assert.throws(() => firstPublishAuthorityPaths('../NEW-001'), /Invalid --include-work/);
});

test('one exact untracked work reaches Movie Master, public cards and Search before its first commit', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'cc18-first-publish-'));
  const projectRoot = fileURLToPath(new URL('..', import.meta.url));
  try {
    await execFileAsync('git', ['clone', '--quiet', '--no-hardlinks', projectRoot, fixture]);
    await cp(
      fileURLToPath(new URL('../scripts/build-movie-master.mjs', import.meta.url)),
      join(fixture, 'scripts', 'build-movie-master.mjs'),
    );
    await cp(
      fileURLToPath(new URL('../scripts/build-search-index.mjs', import.meta.url)),
      join(fixture, 'scripts', 'build-search-index.mjs'),
    );
    await cp(
      fileURLToPath(new URL('../src/lib/performer-localization-policy.mjs', import.meta.url)),
      join(fixture, 'src', 'lib', 'performer-localization-policy.mjs'),
    );
    await cp(
      fileURLToPath(new URL('../src/lib/series-identity.mjs', import.meta.url)),
      join(fixture, 'src', 'lib', 'series-identity.mjs'),
    );
    await cp(
      fileURLToPath(new URL('../src/lib/tag-identity.mjs', import.meta.url)),
      join(fixture, 'src', 'lib', 'tag-identity.mjs'),
    );
    await cp(
      fileURLToPath(new URL('../src/lib/fac-identity.mjs', import.meta.url)),
      join(fixture, 'src', 'lib', 'fac-identity.mjs'),
    );
    const registryPath = join(fixture, 'data', 'movie-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    for (const {id, review_status: reviewStatus} of registry.records) {
      if (reviewStatus !== 'published') continue;
      await cp(
        join(projectRoot, 'data', 'source-records', `${id}.json`),
        join(fixture, 'data', 'source-records', `${id}.json`),
      );
    }
    registry.records.push({
      id: 'TEST-999', actress: ['來源新演員'], release_date: '2026-08-31', source_url: 'https://cc18.tv/player.php?uuid=test999&cat=19',
      source_site: 'cc18.tv', review_status: 'published', cover_status: 'remote_source', image_status: 'rendered',
      video_status: 'pending', template: 'story', published_at: '2026-08-31',
    });
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    await writeFile(join(fixture, 'content', 'reviews', 'TEST-999.md'), `---
id: TEST-999
sourceTitle: "測試來源標題"
title: "TEST-999｜首次發布閉環"
displayShortTitle: "首次發布閉環"
seoTitle: "TEST-999｜首次發布閉環"
socialTitle: "TEST-999｜首次發布閉環"
titleSignals:
  - "首次發布"
titleVersion: 1
actress:
  - 來源新演員
releaseDate: 2026-08-31
publishedAt: 2026-08-31
studio: ""
series: ""
sourceUrl: https://cc18.tv/player.php?uuid=test999&cat=19
sourceSite: cc18.tv
coverUrl: https://cc18.tv/preview/test-999.jpg
heroUrl: /media/works/2026/08/TEST-999/hero-v1.jpg
shortReview: "用於隔離測試首次發布投影。"
sourceTags:
  []
canonicalTagIds:
  []
editorialTagIds:
  []
status: published
imageStatus: rendered
videoStatus: pending
featured: false
---

## 作品資料

隔離測試內容。
`);
    await writeFile(join(fixture, 'content', 'reviews', 'DO-NOT-READ.md'), 'this unrelated draft must never be parsed\n');
    await writeFile(join(fixture, 'data', 'source-records', 'TEST-999.json'), `${JSON.stringify({
      id: 'TEST-999', title: '測試來源標題', original_title_ja: null, translated_title_zh_tw: null,
      release_date: '2026-08-31', actress: ['來源新演員'], studio: null, series: null, source_tags: [],
      description: '隔離測試來源資料。', cover_source_url: 'https://cc18.tv/preview/test-999.jpg',
      source_url: 'https://cc18.tv/player.php?uuid=test999&cat=19', source_site: 'cc18.tv',
      fetched_at: '2026-08-31T00:00:00.000Z', source_relations: {performers: [{
        source_type: 'actor', source_id: '999998', stable_source_id: 'cc18.tv:actor:999998', source_name: '來源新演員',
        source_url: 'https://cc18.tv/search.php?s_type=actor&s_tid=999998', observed_at: '2026-08-31T00:00:00.000Z',
      }], series: [], tags: [], fac: []},
    }, null, 2)}\n`);
    const before = JSON.parse(await readFile(join(fixture, 'data', 'movie-master', 'index.json'), 'utf8'));
    await execFileAsync(process.execPath, ['scripts/build-movie-master.mjs', '--write', '--include-work=TEST-999'], {cwd: fixture});
    await execFileAsync(process.execPath, ['scripts/build-search-index.mjs', '--write'], {cwd: fixture});
    const [index, master, search] = await Promise.all([
      readFile(join(fixture, 'data', 'movie-master', 'index.json'), 'utf8').then(JSON.parse),
      readFile(join(fixture, 'data', 'movie-master', 'test-999.json'), 'utf8').then(JSON.parse),
      readFile(join(fixture, 'data', 'search-index-v1.json'), 'utf8').then(JSON.parse),
    ]);
    assert.equal(index.published_count, before.published_count + 1);
    assert.equal(master.stable_movie_id, 'cc18:TEST-999');
    assert.equal(master.publishing.is_published, true);
    assert.equal(master.media.remotion_promo_ref, null);
    assert.equal(master.display.performers[0].display_name, '來源新演員');
    assert.equal(search.movies.find(({card}) => card.stable_movie_id === 'cc18:TEST-999')?.card.title, '首次發布閉環');
    assert.equal(search.movies.find(({card}) => card.stable_movie_id === 'cc18:TEST-999')?.card.href, '/works/test-999/');
    assert.deepEqual(search.performers.find(({stable_actor_id: id}) => id === 'cc18.tv:actor:999998'), {
      stable_actor_id: 'cc18.tv:actor:999998',
      display_name: '來源新演員',
      display_name_zh_tw: null,
      name_ja: null,
      source_name: '來源新演員',
      searchable_aliases: [],
      related_movie_ids: ['cc18:TEST-999'],
    });
    assert.equal(index.entries.some(({catalog_code}) => catalog_code === 'DO-NOT-READ'), false);
  } finally {
    await rm(fixture, {recursive: true, force: true});
  }
});

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

test('default Movie Master loaders resolve repository data independently from process cwd', async () => {
  const foreignCwd = await mkdtemp(join(tmpdir(), 'cc18-movie-master-cwd-'));
  const fakeData = join(foreignCwd, 'data', 'movie-master');
  await mkdir(fakeData, {recursive: true});
  await writeFile(join(fakeData, 'index.json'), JSON.stringify({marker: 'must-not-be-read', entries: []}), 'utf8');
  const movieMasterUrl = new URL('../src/lib/movie-master.mjs', import.meta.url).href;
  const performerCatalogUrl = new URL('../src/lib/performer-catalog.mjs', import.meta.url).href;
  const source = `
    const {loadPublishedMovieCardCatalog, loadLatestAddedPromoCatalog} = await import(${JSON.stringify(movieMasterUrl)});
    const {loadPerformerCatalog} = await import(${JSON.stringify(performerCatalogUrl)});
    const cards = await loadPublishedMovieCardCatalog();
    const promos = await loadLatestAddedPromoCatalog({limit: 3});
    const performers = await loadPerformerCatalog();
    process.stdout.write(JSON.stringify({
      cards: cards.cards.length,
      published: cards.index.published_count,
      promos: promos.cards.length,
      performers: performers.performers.length,
      firstMaster: cards.cards[0]?.stable_movie_id,
    }));
  `;
  try {
    const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', source], {cwd: foreignCwd});
    const result = JSON.parse(stdout);
    assert.equal(result.cards, result.published);
    assert.ok(result.cards > 0);
    assert.equal(result.promos, 3);
    assert.ok(result.performers > 0);
    assert.match(result.firstMaster, /^cc18:[A-Z0-9-]+$/u);
  } finally {
    await rm(foreignCwd, {recursive: true, force: true});
  }
});

test('package-scoped project anchor resolves from source and a synthetic prerender chunk', async () => {
  const expected = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\\/]$/u, '');
  const syntheticChunk = new URL('../dist/.prerender/chunks/probe.mjs', import.meta.url);
  assert.equal(resolveProjectRoot(), expected);
  assert.equal(resolveProjectRoot(syntheticChunk), expected);
});

test('public card qualification excludes NOINDEX, drafts and Demo records as one complement set', () => {
  const master = (isPublished, indexability, isDemo = false) => ({
    is_demo: isDemo,
    publishing: {is_published: isPublished, indexability},
  });

  assert.equal(isPublicMovieCardMaster(master(true, 'INDEX')), true);
  assert.equal(isPublicMovieCardMaster(master(true, 'NOINDEX')), false);
  assert.equal(isPublicMovieCardMaster(master(false, 'INDEX')), false);
  assert.equal(isPublicMovieCardMaster(master(true, 'INDEX', true)), false);
  assert.equal(isPublicMovieCardMaster(master(true, undefined)), false);
});

test('Master stable movie IDs are present and globally unique before set construction', () => {
  const master = (stableMovieId, catalogCode, publishing = {is_published: true, indexability: 'INDEX'}) => ({
    stable_movie_id: stableMovieId,
    source: {catalog_code: catalogCode},
    publishing,
  });

  assert.doesNotThrow(() => assertUniqueStableMovieIds([
    master('cc18:one-001', 'ONE-001'),
    master('cc18:two-002', 'TWO-002'),
  ]));
  assert.throws(
    () => assertUniqueStableMovieIds([master(undefined, 'MISSING-001')]),
    /MISSING-001: stable_movie_id must be a non-empty string/,
  );
  assert.throws(
    () => assertUniqueStableMovieIds([master('   ', 'BLANK-001')]),
    /BLANK-001: stable_movie_id must be a non-empty string/,
  );
  assert.throws(
    () => assertUniqueStableMovieIds([
      master('cc18:duplicate-001', 'FIRST-001'),
      master('cc18:duplicate-001', 'SECOND-001'),
    ]),
    /Duplicate stable_movie_id cc18:duplicate-001: FIRST-001 and SECOND-001/,
  );
  assert.throws(
    () => assertUniqueStableMovieIds([
      master('cc18:excluded-001', 'NOINDEX-001', {is_published: true, indexability: 'NOINDEX'}),
      master('cc18:excluded-001', 'DRAFT-001', {is_published: false, indexability: 'INDEX'}),
    ]),
    /Duplicate stable_movie_id cc18:excluded-001: NOINDEX-001 and DRAFT-001/,
  );
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
  assert.equal(redirects.replaceAll('\r\n', '\n'), expectedCloudflareRedirects());
  assert.equal(redirects.trimEnd().split(/\r?\n/u).length, 38);
  assert.equal(LEGACY_PERFORMER_REDIRECTS.length, 14);
  for (const [legacyName, routeSegment] of LEGACY_PERFORMER_REDIRECTS) {
    assert.match(redirects, new RegExp(`^/actresses/${legacyName}/ /actresses/${routeSegment}/ 301$`, 'mu'));
    assert.match(redirects, new RegExp(`^/actresses/${legacyName} /actresses/${routeSegment}/ 301$`, 'mu'));
  }
  assert.equal(LEGACY_SERIES_REDIRECTS.length, 4);
  for (const [legacyName, routeSegment] of LEGACY_SERIES_REDIRECTS) {
    assert.match(redirects, new RegExp(`^/series/${legacyName}/ /series/${routeSegment}/ 301$`, 'mu'));
    assert.match(redirects, new RegExp(`^/series/${legacyName} /series/${routeSegment}/ 301$`, 'mu'));
  }
  assert.doesNotMatch(redirects, /\/works\/:slug\/?\s+\/reviews\//);
  assert.doesNotMatch(redirects, /\/actresses\/[^\s:*?]+\*|\/actresses\/:/u);
  assert.doesNotMatch(redirects, /\/series\/[^\s:*?]+\*|\/series\/:/u);
  assert.deepEqual(routes.include, ['/media/*']);
});

test('stable performer routes and public surfaces use the shared performer authority', async () => {
  const [detailRoute, indexRoute, workRoute, facts, searchRoute] = await Promise.all([
    readFile(new URL('../src/pages/actresses/[id].astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/actresses/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/works/[id].astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/WorkFacts.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/search/index.astro', import.meta.url), 'utf8'),
  ]);
  await assert.rejects(access(new URL('../src/pages/actresses/[name].astro', import.meta.url)));
  assert.match(detailRoute, /loadPerformerCatalog\(\)/u);
  assert.match(detailRoute, /params:\s*\{id:\s*performer\.route_segment\}/u);
  assert.match(detailRoute, /<MovieCardV1 card=\{card\}/u);
  assert.doesNotMatch(detailRoute, /getCollection\(['"]reviews['"]\)|encodeURIComponent/u);
  assert.match(indexRoute, /loadPerformerCatalog\(\)/u);
  assert.match(indexRoute, /href=\{performer\.href\}/u);
  assert.doesNotMatch(indexRoute, /getCollection\(['"]reviews['"]\)|encodeURIComponent/u);
  assert.match(workRoute, /loadPerformerCatalog\(\)/u);
  assert.match(workRoute, /ordered_performers_by_work/u);
  assert.match(workRoute, /stable_movie_id:\s*stableMovieId/u);
  assert.match(workRoute, /<WorkFacts[^>]*performers=\{performers\}/u);
  assert.match(workRoute, /hasPerformerNames && <div>/u);
  assert.match(facts, /href=\{performer\.href\}/u);
  assert.match(facts, /data-performer-id=\{performer\.stable_performer_id\}/u);
  assert.match(facts, /hasPerformerNames && <div>/u);
  assert.doesNotMatch(workRoute, /來源未列出<\/dd>/u);
  assert.doesNotMatch(facts, /來源未列出演員/u);
  assert.match(searchRoute, /performerHref\(person\.stable_actor_id\)/u);
  assert.doesNotMatch(searchRoute, /encodeURIComponent\(person\.(?:name|primary_display_name)/u);
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

test('Latest renders latest_added while the neutral catalog retains release-date ordering', async () => {
  const [latestPage, latestAdded, neutral, index] = await Promise.all([
    readFile(new URL('../src/pages/latest/index.astro', import.meta.url), 'utf8'),
    loadLatestAddedMovieCardCatalog(),
    loadPublishedMovieCardCatalog(),
    readJson('data/movie-master/index.json'),
  ]);
  const masters = await Promise.all(index.entries.map(({master_path: masterPath}) => readJson(masterPath)));
  const publishedMasters = masters.filter((master) => (
    master.publishing?.is_published === true
    && master.publishing?.indexability === 'INDEX'
    && master.is_demo !== true
  ));
  const expectedReleaseOrder = [...publishedMasters]
    .sort((left, right) => (
      (right.source?.release_date ?? '').localeCompare(left.source?.release_date ?? '')
      || left.source.catalog_code.localeCompare(right.source.catalog_code, 'en')
    ))
    .map(({source}) => source.catalog_code);
  const expectedLatestAddedOrder = [...publishedMasters]
    .sort((left, right) => (
      right.publishing.published_at.localeCompare(left.publishing.published_at)
      || left.source.catalog_code.localeCompare(right.source.catalog_code, 'en')
    ))
    .map(({source}) => source.catalog_code);

  assert.deepEqual(neutral.cards.map(({catalog_code: catalogCode}) => catalogCode), expectedReleaseOrder);
  assert.deepEqual(latestAdded.cards.map(({catalog_code: catalogCode}) => catalogCode), expectedLatestAddedOrder);
  assert.equal(latestAdded.cards.length, index.published_count);
  assert.equal(new Set(latestAdded.cards.map(({stable_movie_id: stableMovieId}) => stableMovieId)).size, latestAdded.cards.length);
  assert.equal(new Set(latestAdded.cards.map(({catalog_code: catalogCode}) => catalogCode)).size, latestAdded.cards.length);
  assert.ok(latestAdded.cards.every(({title}) => title.trim()));
  assert.match(latestPage, /loadLatestAddedMovieCardCatalog\(\)/);
  assert.match(latestPage, /<MovieCardV1 card=\{card\}/);
  assert.doesNotMatch(latestPage, /loadPublishedMovieCardCatalog|ReviewCard|getCollection\('reviews'\)|byNewest/);
});

test('latest_added fails instead of falling back when a published date is missing or invalid', () => {
  const card = {catalog_code: 'TEST-001'};
  for (const publishedAt of [null, '', '2026-02-30', '08/29/2026']) {
    assert.throws(
      () => sortLatestAddedMovieCardRecords([{card, published_at: publishedAt}]),
      /latest_added requires a valid published_at/,
    );
  }
});

test('promo catalog uses the latest-added public projection without hard-coded work IDs', async () => {
  const [promoCatalog, latestAdded] = await Promise.all([
    loadLatestAddedPromoCatalog({limit: 3}),
    loadLatestAddedMovieCardCatalog(),
  ]);
  const expectedIds = latestAdded.cards
    .filter(({has_remotion_promo: hasPromo}) => hasPromo)
    .slice(0, 3)
    .map(({stable_movie_id: stableMovieId}) => stableMovieId);
  assert.deepEqual(promoCatalog.cards.map(({stableMovieId}) => stableMovieId), expectedIds);
  assert.equal(new Set(promoCatalog.cards.map(({stableMovieId}) => stableMovieId)).size, promoCatalog.cards.length);
  assert.ok(promoCatalog.cards.every(({href}) => /^\/works\/[a-z0-9-]+\/$/u.test(href)));
  assert.ok(promoCatalog.cards.every(({durationSeconds}) => durationSeconds === 9));
});

test('promo selection skips missing refs and automatically admits a newer qualified record', async () => {
  const older = promoRecord({catalogCode: 'OLDER-001', publishedAt: '2026-08-20'});
  const newerWithoutRef = promoRecord({catalogCode: 'SKIP-001', publishedAt: '2026-08-22', ref: null});
  const newest = promoRecord({catalogCode: 'NEWER-001', publishedAt: '2026-08-23'});
  const loadManifest = async (path) => promoManifest(path.match(/([A-Z0-9-]+)\.json/u)?.[1]);
  const cards = await projectLatestAddedPromoRecords([older, newerWithoutRef, newest], {limit: 2, loadManifest});
  assert.deepEqual(cards.map(({catalogCode}) => catalogCode), ['NEWER-001', 'OLDER-001']);
});

test('promo projection fails closed for unreadable or malformed Media Manifests', async () => {
  const record = promoRecord();
  await assert.rejects(
    projectLatestAddedPromoRecords([record], {limit: 1, loadManifest: async () => { throw new Error('ENOENT'); }}),
    /cannot read Media Manifest.*ENOENT/,
  );
  await assert.rejects(
    projectLatestAddedPromoRecords([record], {limit: 1, loadManifest: async () => { throw new SyntaxError('Unexpected token'); }}),
    /cannot read Media Manifest.*Unexpected token/,
  );
});

test('promo projection validates reference identity, stable IDs and every media contract', async () => {
  const validRecord = promoRecord();
  const invalidCases = [
    ['ref format', promoRecord({ref: 'data/media-manifests/TEST-001.json'}), promoManifest(), /invalid remotion_promo_ref/],
    ['ref ID', promoRecord({ref: 'data/media-manifests/OTHER-001.json#\/video'}), promoManifest(), /promo ref identifies OTHER-001/],
    ['manifest ID', validRecord, promoManifest('OTHER-001'), /Media Manifest ID must equal TEST-001/],
    ['stable ID', promoRecord({stableMovieId: 'cc18:OTHER-001'}), promoManifest(), /stable_movie_id and catalog_code contract disagree/],
    ['status', validRecord, {...promoManifest(), video: {...promoManifest().video, status: 'rendered'}}, /not rendered_and_uploaded/],
    ['duration', validRecord, {...promoManifest(), video: {...promoManifest().video, duration_seconds: 10}}, /duration must be 9 seconds/],
    ['width', validRecord, {...promoManifest(), video: {...promoManifest().video, width: 720}}, /must be 1080x1920/],
    ['height', validRecord, {...promoManifest(), video: {...promoManifest().video, height: 1080}}, /must be 1080x1920/],
    ['codec', validRecord, {...promoManifest(), video: {...promoManifest().video, codec: 'vp9'}}, /codec must be h264/],
    ['extension', validRecord, {...promoManifest(), video: {...promoManifest().video, public_path: '/media/works/test/video.webm'}}, /internal mp4 path/],
    ['external video', validRecord, {...promoManifest(), video: {...promoManifest().video, public_path: 'https:\/\/example.com\/video.mp4'}}, /internal mp4 path/],
    ['traversal video', validRecord, {...promoManifest(), video: {...promoManifest().video, public_path: '/media/works/..\/secret.mp4'}}, /internal mp4 path/],
    ['cross-work video', validRecord, {...promoManifest(), video: {...promoManifest().video, public_path: '/media/works/2026/08/OTHER-001/vertical.mp4'}}, /identifies another work/],
  ];
  for (const [name, record, manifest, pattern] of invalidCases) {
    await assert.rejects(
      projectLatestAddedPromoRecords([record], {limit: 1, loadManifest: async () => manifest}),
      pattern,
      name,
    );
  }
  await assert.rejects(
    projectLatestAddedPromoRecords([validRecord, promoRecord({catalogCode: 'OTHER-001', stableMovieId: validRecord.card.stable_movie_id})], {
      limit: 1,
      loadManifest: async () => promoManifest(),
    }),
    /Duplicate promo stable_movie_id/,
  );
});

test('promo poster prefers vertical_scene, falls back to original article hero and otherwise fails', async () => {
  const record = promoRecord();
  const vertical = await projectLatestAddedPromoRecords([record], {limit: 1, loadManifest: async () => promoManifest()});
  assert.match(vertical[0].posterUrl, /vertical\.jpg$/u);

  const heroOnly = promoManifest();
  heroOnly.assets = heroOnly.assets.filter(({role}) => role === 'article_hero');
  const hero = await projectLatestAddedPromoRecords([record], {limit: 1, loadManifest: async () => heroOnly});
  assert.match(hero[0].posterUrl, /hero\.jpg$/u);

  const noOriginalPoster = promoManifest();
  noOriginalPoster.assets = [{role: 'source_cover', path: '/media/works/test/source.jpg'}];
  await assert.rejects(
    projectLatestAddedPromoRecords([record], {limit: 1, loadManifest: async () => noOriginalPoster}),
    /requires an internal vertical_scene or article_hero image/,
  );
  const crossWorkPoster = promoManifest();
  crossWorkPoster.assets = [{role: 'vertical_scene', path: '/media/works/2026/08/OTHER-001/vertical.jpg'}];
  await assert.rejects(
    projectLatestAddedPromoRecords([record], {limit: 1, loadManifest: async () => crossWorkPoster}),
    /requires an internal vertical_scene or article_hero image/,
  );
});

test('promo projection fails when qualified candidates cannot satisfy the requested limit', async () => {
  await assert.rejects(
    projectLatestAddedPromoRecords([promoRecord()], {limit: 2, loadManifest: async () => promoManifest()}),
    /requires 2 qualified works; received 1/,
  );
});

test('homepage keeps its Markdown featured Hero and shares latest_added with Latest', async () => {
  const [homePage, latestPage, latestAdded] = await Promise.all([
    readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/latest/index.astro', import.meta.url), 'utf8'),
    loadLatestAddedMovieCardCatalog(),
  ]);

  assert.equal(latestAdded.cards.length, latestAdded.index.published_count);
  assert.equal(new Set(latestAdded.cards.map(({stable_movie_id: stableMovieId}) => stableMovieId)).size, latestAdded.cards.length);
  assert.equal(new Set(latestAdded.cards.map(({catalog_code: catalogCode}) => catalogCode)).size, latestAdded.cards.length);
  assert.ok(latestAdded.cards.every(({title}) => title.trim()));
  assert.match(homePage, /getCollection\('reviews'/);
  assert.match(homePage, /reviews\.find\(\(\{data\}\) => data\.featured\)/);
  assert.match(homePage, /<section class="hero catalog-feature">/);
  assert.match(homePage, /featured\.data\.title/);
  assert.match(homePage, /featured\.data\.shortReview/);
  assert.match(homePage, /featured\.data\.sourceUrl/);
  assert.match(homePage, /loadLatestAddedMovieCardCatalog\(\)/);
  assert.match(homePage, /catalog\.cards\.map\(\(card\) =>/);
  assert.match(homePage, /<MovieCardV1 card=\{card\} \/>/);
  assert.match(homePage, /依本站收錄時間排序；卡片日期為作品發行日。/);
  assert.match(latestPage, /依本站收錄時間排序；卡片日期為作品發行日。/);
  assert.doesNotMatch(homePage, /<ReviewCard|const latest = reviews\.slice|loadPublishedMovieCardCatalog/);
  assert.doesNotMatch(homePage, /<MovieCardV1 card=\{card\} priority=/);
  assert.match(latestPage, /<MovieCardV1 card=\{card\} priority=\{index < 3\}/);
});

test('homepage performer exploration is a dynamic CTA-only catalog entry', async () => {
  const [homePage, component, performerCatalog] = await Promise.all([
    readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/HomePerformerExplore.astro', import.meta.url), 'utf8'),
    loadPerformerCatalog(),
  ]);

  assert.ok(performerCatalog.performers.length > 0);
  assert.match(homePage, /loadPerformerCatalog\(\)/);
  assert.match(homePage, /performerCatalog\.performers\.length/);
  assert.match(homePage, /<HomePerformerExplore count=\{performerCount\} \/>/);
  assert.ok(homePage.indexOf('<HomePerformerExplore') > homePage.indexOf('class="promo-picks"'));
  assert.ok(homePage.indexOf('<HomePerformerExplore') < homePage.indexOf('class="explore-grid"'));
  assert.doesNotMatch(homePage, /performerCount\s*=\s*14\b/);
  assert.equal((component.match(/<section\b/g) ?? []).length, 1);
  assert.equal((component.match(/<h2\b/g) ?? []).length, 1);
  assert.match(component, /aria-labelledby="home-performer-explore-title"/);
  assert.match(component, /<h2 id="home-performer-explore-title">從演員找作品<\/h2>/);
  assert.match(component, /EXPLORE PERFORMERS/);
  assert.match(component, /依演員姓名瀏覽本站收錄的人物與已發布作品。目前收錄 \{count\} 位人物。/);
  assert.equal((component.match(/<a\b/g) ?? []).length, 1);
  assert.match(component, /<a href="\/actresses\/">查看全部演員 →<\/a>/);
  assert.doesNotMatch(component, /\/actresses\/cc18-tv-actor-|<img\b|<picture\b|<video\b|<script\b|client:/);
  assert.doesNotMatch(component, /熱門|人氣|排行|推薦|趨勢|精選/);
  assert.doesNotMatch(component, /\b14\b/);
  for (const performer of performerCatalog.performers) {
    assert.doesNotMatch(component, new RegExp(performer.primary_display_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  }
});

test('homepage promo cards defer video loading and keep one reusable controller', async () => {
  const [homePage, component] = await Promise.all([
    readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/PromoVideoCard.astro', import.meta.url), 'utf8'),
  ]);
  assert.match(homePage, /loadLatestAddedPromoCatalog\(\{limit: 3\}\)/);
  assert.match(homePage, /<section class="promo-picks" data-promo-picks>/);
  assert.match(homePage, /9秒選片短影音為本站原創編輯視覺，不是官方預告、原片摘要或觀看證據。/);
  assert.ok(homePage.indexOf('class="promo-picks"') > homePage.indexOf('class="reel-section"'));
  assert.ok(homePage.indexOf('class="promo-picks"') < homePage.indexOf('class="explore-grid"'));
  assert.equal((component.match(/<script>/g) ?? []).length, 1);
  assert.match(component, /data-src=\{videoUrl\}/);
  assert.match(component, /controls\s+playsinline\s+preload="none"/);
  assert.match(component, /tabindex="0"/);
  assert.doesNotMatch(component, /tabindex="[1-9]\d*"/);
  assert.doesNotMatch(component, /<video[^>]*\s(?:src|autoplay|loop|muted)=/);
  assert.match(component, /video\.focus\(\{preventScroll: true\}\);\s*video\.play\(\)/);
  assert.match(component, /video\.play\(\)\.catch/);
  assert.match(component, /video !== active && !video\.paused/);
  assert.match(component, /短影音暫時無法播放/);
  assert.match(component, /data-promo-error role="status" tabindex="-1"/);
  assert.match(component, /message\.focus\(\{preventScroll: true\}\)/);
  assert.match(component, /promo-video-card__cta'\)\?\.focus\(\{preventScroll: true\}\)/);
  assert.equal((component.match(/const applyPosterFallback =/g) ?? []).length, 1);
  assert.match(component, /applyPosterFallback\(target\)/);
  assert.match(component, /poster\.complete && poster\.naturalWidth === 0/);
  assert.match(component, /applyPosterFallback\(poster\)/);
  assert.match(component, /fallbackApplied === 'true'/);
  assert.doesNotMatch(component, /cc18\.tv|Evidence/);
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

test('preview and formal search keep the neutral catalog while home and Latest share latest_added', async () => {
  const [library, homePage, previewPage, latestPage, searchBuilder] = await Promise.all([
    readFile(new URL('../src/lib/movie-master.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/preview/movie-master-cards/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/latest/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/build-search-index.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(library, /export async function loadPublishedMovieCardCatalog\(\)/);
  assert.match(library, /export async function loadLatestAddedMovieCardCatalog\(\)/);
  assert.match(homePage, /loadLatestAddedMovieCardCatalog\(\)/);
  assert.match(latestPage, /loadLatestAddedMovieCardCatalog\(\)/);
  assert.match(previewPage, /loadPublishedMovieCardCatalog\(\)/);
  assert.match(searchBuilder, /loadPublishedMovieCardCatalog\(\)/);
  assert.doesNotMatch(searchBuilder, /loadLatestAddedMovieCardCatalog|loadMovieMasterCardPreview|preview\/movie-master-cards|preview\./);
});
