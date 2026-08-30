import {access, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadLatestAddedPromoCatalog} from '../src/lib/movie-master.mjs';
import {loadPerformerCatalog} from '../src/lib/performer-catalog.mjs';
import {
  validateCanonicalMovieMasterIndexEntries,
  validateMovieMasterAgainstIndexEntry,
} from '../src/lib/movie-master-identity.mjs';
import {workPath} from '../src/lib/work-url.mjs';

export const LEGACY_PERFORMER_REDIRECTS = [
  ['一ノ瀬ラム', 'cc18-tv-actor-27185'],
  ['池田真理奈', 'cc18-tv-actor-27777'],
  ['柚木れんか', 'cc18-tv-actor-29885'],
  ['柊もみじ', 'cc18-tv-actor-54025'],
  ['蘭華', 'cc18-tv-actor-25683'],
  ['美咲音', 'cc18-tv-actor-28932'],
  ['羽月乃蒼', 'cc18-tv-actor-28396'],
  ['相沢澪', 'cc18-tv-actor-30343'],
  ['要結愛', 'cc18-tv-actor-54414'],
  ['鷲尾めい', 'cc18-tv-actor-25064'],
  ['淺野心', 'cc18-tv-actor-28722'],
  ['七森莉莉', 'cc18-tv-actor-25389'],
  ['河北彩花', 'cc18-tv-actor-34284'],
  ['星空ねる', 'cc18-tv-actor-54454'],
];

export const expectedCloudflareRedirects = () => [
  '/reviews/:slug/ /works/:slug/ 301',
  '/reviews/:slug /works/:slug/ 301',
  ...LEGACY_PERFORMER_REDIRECTS.flatMap(([legacyName, routeSegment]) => [
    `/actresses/${legacyName}/ /actresses/${routeSegment}/ 301`,
    `/actresses/${legacyName} /actresses/${routeSegment}/ 301`,
  ]),
].join('\n') + '\n';

export const isPublicMovieCardMaster = (master) => (
  master.publishing?.is_published === true
  && master.publishing?.indexability === 'INDEX'
  && master.is_demo !== true
);

export const assertUniqueStableMovieIds = (masters) => {
  const seen = new Map();
  for (const master of masters) {
    const catalogCode = master.source?.catalog_code ?? master.catalog_code ?? 'unknown catalog';
    if (typeof master.stable_movie_id !== 'string' || !master.stable_movie_id.trim()) {
      throw new Error(`${catalogCode}: stable_movie_id must be a non-empty string`);
    }
    const stableMovieId = master.stable_movie_id.trim();
    if (seen.has(stableMovieId)) {
      throw new Error(`Duplicate stable_movie_id ${stableMovieId}: ${seen.get(stableMovieId)} and ${catalogCode}`);
    }
    seen.set(stableMovieId, catalogCode);
  }
};

export async function validateMovieMasterSurfaces() {
const root = resolve(import.meta.dirname, '..');
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const html = await readFile(resolve(root, 'dist/preview/movie-master-cards/index.html'), 'utf8');
const homeHtml = await readFile(resolve(root, 'dist/index.html'), 'utf8');
const latestHtml = await readFile(resolve(root, 'dist/latest/index.html'), 'utf8');
const sitemap = await readFile(resolve(root, 'dist/sitemap-0.xml'), 'utf8');
const redirects = await readFile(resolve(root, 'dist/_redirects'), 'utf8');
const searchIndex = await readJson('data/search-index-v1.json');
const performerCatalog = await loadPerformerCatalog();
const index = await readJson('data/movie-master/index.json');
validateCanonicalMovieMasterIndexEntries(index.entries);
const masters = await Promise.all(index.entries.map(async (entry) => {
  const master = await readJson(entry.master_path);
  validateMovieMasterAgainstIndexEntry(entry, master);
  return master;
}));
const promoCatalog = await loadLatestAddedPromoCatalog({limit: 3});
const expectedPublished = masters.filter(isPublicMovieCardMaster);
const isValidDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

for (const master of expectedPublished) {
  if (!isValidDate(master.publishing?.published_at)) {
    throw new Error(`${master.catalog_code}: latest_added requires a valid published_at`);
  }
}
const expectedExcluded = masters.filter((master) => !isPublicMovieCardMaster(master));
const expectedById = new Map(expectedPublished.map((master) => [master.stable_movie_id, master]));
const expectedReleaseIds = [...expectedPublished]
  .sort((left, right) => (
    (right.source?.release_date ?? '').localeCompare(left.source?.release_date ?? '')
    || left.source.catalog_code.localeCompare(right.source.catalog_code, 'en')
  ))
  .map(({stable_movie_id: stableMovieId}) => stableMovieId);
const expectedLatestAddedIds = [...expectedPublished]
  .sort((left, right) => (
    right.publishing.published_at.localeCompare(left.publishing.published_at)
    || left.source.catalog_code.localeCompare(right.source.catalog_code, 'en')
  ))
  .map(({stable_movie_id: stableMovieId}) => stableMovieId);
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
const promoSection = homeHtml.match(/<section class="promo-picks" data-promo-picks[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? '';
const performerExploreSections = [...homeHtml.matchAll(/<section class="home-performer-explore"[^>]*data-home-performer-explore[^>]*>([\s\S]*?)<\/section>/g)];
const promoCards = [...promoSection.matchAll(/<article class="promo-video-card" data-promo-card data-movie-id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)]
  .map((match) => ({stableMovieId: match[1], html: match[2]}));
const latestCards = [...latestHtml.matchAll(/<article class="movie-card-v1" data-movie-id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)]
  .map((match) => ({stableMovieId: match[1], html: match[2]}));
const latestIds = latestCards.map(({stableMovieId}) => stableMovieId);
const pathExists = async (path) => access(path).then(() => true, () => false);
const expectedRedirects = expectedCloudflareRedirects();

if (redirects.replaceAll('\r\n', '\n') !== expectedRedirects) throw new Error('Cloudflare redirect contract is missing or changed');
if (redirects.includes('/works/:slug/ /reviews/')) throw new Error('Reverse work redirect would create a loop');
if (/\/actresses\/[^\s:*?]+\*|\/actresses\/:/u.test(redirects)) throw new Error('Wildcard performer redirect is not allowed');
for (const [, routeSegment] of LEGACY_PERFORMER_REDIRECTS) {
  if (redirects.includes(`/actresses/${routeSegment}/ /actresses/`)) throw new Error(`Reverse performer redirect would create a loop: ${routeSegment}`);
}

assertUniqueStableMovieIds(masters);
const allIds = new Set(masters.map(({stable_movie_id: stableMovieId}) => stableMovieId.trim()));
const publishedIds = new Set(expectedPublished.map(({stable_movie_id: stableMovieId}) => stableMovieId.trim()));
const excludedIds = new Set(expectedExcluded.map(({stable_movie_id: stableMovieId}) => stableMovieId.trim()));
if (expectedPublished.length + expectedExcluded.length !== masters.length) throw new Error('Published and excluded card sets do not cover every Master');
if ([...publishedIds].some((stableMovieId) => excludedIds.has(stableMovieId))) throw new Error('Published and excluded card sets overlap');
if (new Set([...publishedIds, ...excludedIds]).size !== allIds.size || [...allIds].some((stableMovieId) => !publishedIds.has(stableMovieId) && !excludedIds.has(stableMovieId))) {
  throw new Error('Published and excluded card sets do not equal all Master stable IDs');
}
if (expectedPublished.length !== index.published_count) throw new Error('Movie Master index published_count disagrees with Master states');
if (masters.filter((master) => master.is_demo === true).length !== index.demo_count) throw new Error('Movie Master index demo_count disagrees with Master states');
if (masters.filter((master) => master.is_demo !== true && master.publishing?.is_published !== true).length !== index.formal_draft_count) {
  throw new Error('Movie Master index formal_draft_count disagrees with Master states');
}
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
if (promoCards.length !== promoCatalog.cards.length || promoCards.length !== 3) {
  throw new Error(`Homepage promo module expected 3 cards, received ${promoCards.length}`);
}
if (new Set(promoCards.map(({stableMovieId}) => stableMovieId)).size !== promoCards.length) {
  throw new Error('Homepage promo stable movie IDs are duplicated');
}
if (renderedIds.join('\n') !== expectedReleaseIds.join('\n')) {
  throw new Error('Preview card order differs from release_date DESC + catalog_code ASC');
}
if (latestIds.join('\n') !== expectedLatestAddedIds.join('\n')) {
  throw new Error('Latest card order differs from published_at DESC + catalog_code ASC');
}
if (homeIds.join('\n') !== expectedLatestAddedIds.join('\n') || homeIds.join('\n') !== latestIds.join('\n')) {
  throw new Error('Homepage and Latest do not share latest_added ordering');
}
for (const master of expectedExcluded) {
  if (renderedIds.includes(master.stable_movie_id)) throw new Error(`Excluded Movie Master rendered: ${master.stable_movie_id}`);
  if (homeIds.includes(master.stable_movie_id)) throw new Error(`Excluded Movie Master rendered on homepage: ${master.stable_movie_id}`);
  if (latestIds.includes(master.stable_movie_id)) throw new Error(`Excluded Movie Master rendered on Latest: ${master.stable_movie_id}`);
  if (promoCards.some(({stableMovieId}) => stableMovieId === master.stable_movie_id)) throw new Error(`Excluded Movie Master rendered in homepage promo: ${master.stable_movie_id}`);
  if (searchIndex.movies.some(({card}) => card?.stable_movie_id === master.stable_movie_id)) {
    throw new Error(`Excluded Movie Master leaked into Search index: ${master.stable_movie_id}`);
  }
}
for (const [index, {stableMovieId, html: promoHtml}] of promoCards.entries()) {
  const expected = promoCatalog.cards[index];
  if (stableMovieId !== expected.stableMovieId) throw new Error(`Homepage promo order differs at position ${index + 1}`);
  const code = promoHtml.match(/<p class="promo-video-card__code"[^>]*>([^<]+)<\/p>/)?.[1];
  if (code !== expected.catalogCode) throw new Error(`Homepage promo catalog code differs for ${stableMovieId}`);
  const title = promoHtml.match(/<h3[^>]*><a[^>]*>([^<]+)<\/a><\/h3>/)?.[1];
  if (title !== expected.title) throw new Error(`Homepage promo title differs for ${stableMovieId}`);
  const links = [...promoHtml.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  if (links.length !== 2 || links.some((href) => href !== expected.href || !href.startsWith('/works/'))) {
    throw new Error(`Homepage promo links disagree for ${stableMovieId}`);
  }
  const videoTag = promoHtml.match(/<video\b[^>]*data-promo-video[^>]*>/)?.[0] ?? '';
  if (!videoTag || !videoTag.includes(`data-src="${expected.videoUrl}"`)) throw new Error(`Homepage promo video URL differs for ${stableMovieId}`);
  if (/(?:^|\s)src=/u.test(videoTag) || /<source\b[^>]*\ssrc=/u.test(promoHtml)) {
    throw new Error(`Homepage promo eagerly exposes a video source for ${stableMovieId}`);
  }
  if (!videoTag.includes('controls') || !videoTag.includes('playsinline') || !videoTag.includes('preload="none"')) {
    throw new Error(`Homepage promo video playback contract is incomplete for ${stableMovieId}`);
  }
  if (!videoTag.includes('tabindex="0"')) throw new Error(`Homepage promo video is not keyboard focusable for ${stableMovieId}`);
  if (!promoHtml.includes('data-promo-error role="status" tabindex="-1"')) {
    throw new Error(`Homepage promo error target is not programmatically focusable for ${stableMovieId}`);
  }
  const posterTag = promoHtml.match(/<img\b[^>]*data-promo-poster[^>]*>/)?.[0] ?? '';
  if (!posterTag.includes(`src="${expected.posterUrl}"`) || !posterTag.includes('loading="lazy"') || !posterTag.includes('decoding="async"')) {
    throw new Error(`Homepage promo poster projection differs for ${stableMovieId}`);
  }
  if (!promoHtml.includes('播放9秒選片短影音') || !promoHtml.includes('查看作品資料與影評 →')) {
    throw new Error(`Homepage promo controls or CTA are missing for ${stableMovieId}`);
  }
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
  const performerById = new Map(performerCatalog.performers.map((performer) => [performer.stable_performer_id, performer]));
  const expectedPerformers = master.source.performer_relations.map(({stable_source_id: stablePerformerId}) => {
    const performer = performerById.get(stablePerformerId);
    if (!performer) throw new Error(`Typed performer is absent from catalog for ${stableMovieId}: ${stablePerformerId}`);
    return performer;
  });
  const actualPerformerLinks = [...workHtml.matchAll(/<a href="(\/actresses\/cc18-tv-actor-[1-9][0-9]*\/)" data-performer-id="([^"]+)">/g)]
    .map((match) => ({href: match[1], stablePerformerId: match[2]}));
  const expectedPerformerLinks = [...expectedPerformers, ...expectedPerformers].map((performer) => ({
    href: performer.href,
    stablePerformerId: performer.stable_performer_id,
  }));
  if (JSON.stringify(actualPerformerLinks) !== JSON.stringify(expectedPerformerLinks)) {
    throw new Error(`Visible performer links disagree with typed relations for ${stableMovieId}`);
  }
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
const performerIndexHtml = await readFile(resolve(root, 'dist/actresses/index.html'), 'utf8');
const performerIndexLinks = [...performerIndexHtml.matchAll(/<a href="(\/actresses\/cc18-tv-actor-[1-9][0-9]*\/)" data-performer-id="([^"]+)">/g)]
  .map((match) => ({href: match[1], stablePerformerId: match[2]}));
const expectedPerformerIndexLinks = performerCatalog.performers.map((performer) => ({
  href: performer.href,
  stablePerformerId: performer.stable_performer_id,
}));
if (JSON.stringify(performerIndexLinks) !== JSON.stringify(expectedPerformerIndexLinks)) {
  throw new Error('Performer index links do not exactly match the stable Performer Catalog');
}
if (!Number.isInteger(performerCatalog.performers.length) || performerCatalog.performers.length < 1) {
  throw new Error('Homepage performer exploration requires a non-empty Performer Catalog');
}
if (performerCatalog.performers.length !== performerIndexLinks.length) {
  throw new Error('Homepage performer count disagrees with the rendered performer index');
}
if (performerExploreSections.length !== 1) throw new Error('Homepage performer exploration must render exactly once');
const performerExploreHtml = performerExploreSections[0][1];
if (!performerExploreSections[0][0].includes('aria-labelledby="home-performer-explore-title"')) {
  throw new Error('Homepage performer exploration heading relationship is missing');
}
if (!/<h2\s+id="home-performer-explore-title"[^>]*>從演員找作品<\/h2>/u.test(performerExploreHtml)) {
  throw new Error('Homepage performer exploration heading is missing');
}
if (!performerExploreHtml.includes('EXPLORE PERFORMERS')) throw new Error('Homepage performer exploration eyebrow is missing');
if (!performerExploreHtml.includes(`依演員姓名瀏覽本站收錄的人物與已發布作品。目前收錄 ${performerCatalog.performers.length} 位人物。`)) {
  throw new Error('Homepage performer exploration count or approved copy disagrees with the catalog');
}
const performerExploreLinks = [...performerExploreHtml.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
if (performerExploreLinks.length !== 1 || performerExploreLinks[0][1] !== '/actresses/' || performerExploreLinks[0][2] !== '查看全部演員 →') {
  throw new Error('Homepage performer exploration must contain only the approved performer index CTA');
}
if (/\/actresses\/cc18-tv-actor-|<img\b|<picture\b|<video\b|<script\b/u.test(performerExploreHtml)) {
  throw new Error('Homepage performer exploration leaked a person link, media element or script');
}
if (performerCatalog.performers.some((performer) => performerExploreHtml.includes(performer.primary_display_name))) {
  throw new Error('Homepage performer exploration leaked an individual performer name');
}
if (/熱門|人氣|排行|推薦|趨勢|精選/u.test(performerExploreHtml)) {
  throw new Error('Homepage performer exploration uses unsupported ranking or recommendation language');
}
const promoPosition = homeHtml.indexOf('class="promo-picks"');
const performerExplorePosition = homeHtml.indexOf('class="home-performer-explore"');
const topicExplorePosition = homeHtml.indexOf('class="explore-grid"');
if (!(promoPosition >= 0 && performerExplorePosition > promoPosition && topicExplorePosition > performerExplorePosition)) {
  throw new Error('Homepage performer exploration is not between promo picks and topic exploration');
}
if (/"@type"\s*:\s*"Person"/u.test(homeHtml)) throw new Error('Homepage performer entry must not add Person structured data');
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
if (!latestHtml.includes('依本站收錄時間排序；卡片日期為作品發行日。')) throw new Error('Latest date semantics are unclear');
if (!homeHtml.includes('<section class="hero catalog-feature">')) throw new Error('Homepage Markdown featured Hero is missing');
if (!homeHtml.includes('data-cover-fallback="/images/movie-cover-fallback.svg"')) throw new Error('Homepage image fallback contract is missing');
if ((homeHtml.match(/\[data-cover-fallback\]/g) ?? []).length !== 1) throw new Error('Homepage fallback handler must be emitted exactly once');
if (homeHtml.includes('待補') || homeHtml.includes('演員資料待補')) throw new Error('Missing-value placeholder leaked into homepage');
if (homeHtml.includes('/reviews/')) throw new Error('Legacy review URL leaked into homepage');
if (!homeHtml.includes('依本站收錄時間排序；卡片日期為作品發行日。')) throw new Error('Homepage date semantics are unclear');
if (!homeHtml.includes('9-SECOND PICKS') || !homeHtml.includes('<h2>9秒看重點</h2>')) throw new Error('Homepage promo heading is missing');
if (!homeHtml.includes('9秒選片短影音為本站原創編輯視覺，不是官方預告、原片摘要或觀看證據。')) throw new Error('Homepage promo disclosure is missing');
if (promoSection.includes('cc18.tv') || promoSection.includes('Evidence')) throw new Error('Homepage promo leaked source CTA or Evidence text');
if (/"@type":"VideoObject"/u.test(homeHtml) || /property="og:video"/u.test(homeHtml)) throw new Error('Homepage promo must not add video metadata');
const moduleScripts = [...homeHtml.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)].map((match) => match[1]);
if (new Set(moduleScripts).size !== moduleScripts.length) throw new Error('Homepage emits a duplicate component controller script');
if ((homeHtml.match(/\[data-promo-picks\]/g) ?? []).length !== 1) throw new Error('Homepage promo controller must be emitted exactly once');
if ((homeHtml.match(/promoPosterFallback/g) ?? []).length !== 1) throw new Error('Homepage promo poster fallback handler must be emitted exactly once');
if ((homeHtml.match(/\.complete&&[^;]*\.naturalWidth===0/g) ?? []).length !== 1) throw new Error('Homepage promo controller must recover an already-failed poster');
if ((homeHtml.match(/\.focus\(\{preventScroll:!0\}\)/g) ?? []).length < 2) throw new Error('Homepage promo controller must transfer focus on playback and failure');

console.log(`Movie Master surfaces valid: ${renderedCards.length} preview cards, ${homeCards.length} homepage cards, ${promoCards.length} homepage promo cards, ${performerCatalog.performers.length} homepage performer-index entries, ${latestCards.length} Latest cards and work pages, ${expectedExcluded.length} dynamic exclusions, redirects, structured data, noindex and sitemap contracts passed.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await validateMovieMasterSurfaces();
}
