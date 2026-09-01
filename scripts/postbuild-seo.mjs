import {readdir, readFile, writeFile} from 'node:fs/promises';
import {relative, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadPerformerCatalog} from '../src/lib/performer-catalog.mjs';
import {parsePerformerRouteSegment} from '../src/lib/performer-url.mjs';
import {WORK_ROUTE_PREFIX} from '../src/lib/work-url.mjs';
import {loadSeriesCatalog} from '../src/lib/series-catalog.mjs';
import {parseSeriesRouteSegment} from '../src/lib/series-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const defaultDist = resolve(root, 'dist');
const siteOrigin = 'https://cc18.pages.dev';

export const APPROVED_SCHEMA_ALTERNATE_NAMES = [
  '相沢澪',
  '鷲尾めい',
  '浅野こころ',
  '七ツ森りり',
];

export const FORBIDDEN_SCHEMA_ALTERNATE_NAMES = [
  '一之瀨蘭',
  '柚木蓮花',
  '柊紅葉',
  '星空音琉',
  '河北彩伽',
];

async function filesUnder(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const output = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(path));
    else output.push(path);
  }
  return output;
}

const recordsFromHtml = (html, label) => {
  const records = [];
  for (const match of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let parsed;
    try { parsed = JSON.parse(match[1]); } catch { throw new Error(`Invalid JSON-LD in ${label}`); }
    records.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  }
  return records;
};

const asNameArray = (value) => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

const sameOrderedValues = (actual, expected) => (
  actual.length === expected.length && actual.every((value, index) => value === expected[index])
);

export const performerCanonical = (performer) => new URL(performer.href, siteOrigin).href;
export const seriesCanonical = (series) => new URL(series.href, siteOrigin).href;

const tagsWithAttribute = (html, tagName, attribute, expectedValue) => (
  [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'giu'))]
    .map(([tag]) => ({tag, value: tag.match(new RegExp(`\\b${attribute}="([^"]*)"`, 'iu'))?.[1]}))
    .filter(({value}) => value !== undefined && (expectedValue === undefined || value.toLowerCase() === expectedValue))
);

export function validatePerformerHtmlFileSet({allHtmlPaths, performers}) {
  const expected = new Set([
    'actresses/index.html',
    ...performers.map(({route_segment: segment}) => `actresses/${segment}/index.html`),
  ]);
  const actual = allHtmlPaths.filter((path) => path.startsWith('actresses/'));
  const missing = [...expected].filter((path) => !actual.includes(path));
  const extra = actual.filter((path) => !expected.has(path));
  if (actual.length !== expected.size || missing.length || extra.length) {
    throw new Error(`Stable performer page set mismatch; missing=${missing.join(',') || 'none'} extra=${extra.join(',') || 'none'}`);
  }
  return true;
}

export function validateSeriesHtmlFileSet({allHtmlPaths, series}) {
  const expected = new Set([
    'series/index.html',
    ...series.map(({route_segment: segment}) => `series/${segment}/index.html`),
  ]);
  const actual = allHtmlPaths.filter((path) => path.startsWith('series/'));
  const missing = [...expected].filter((path) => !actual.includes(path));
  const extra = actual.filter((path) => !expected.has(path));
  if (actual.length !== expected.size || missing.length || extra.length) {
    throw new Error(`Stable series page set mismatch; missing=${missing.join(',') || 'none'} extra=${extra.join(',') || 'none'}`);
  }
  return true;
}

export function validatePerformerPageHtml({performer, html, file = performer.href}) {
  const canonicalTags = tagsWithAttribute(html, 'link', 'rel', 'canonical');
  if (canonicalTags.length !== 1) {
    throw new Error(`${performer.stable_performer_id}: performer page requires exactly one canonical link in ${file}`);
  }
  const canonical = canonicalTags[0].tag.match(/\bhref="([^"]+)"/iu)?.[1];
  const expectedCanonical = performerCanonical(performer);
  if (canonical !== expectedCanonical) throw new Error(`${performer.stable_performer_id}: stable performer canonical mismatch in ${file}`);

  const robotsTags = tagsWithAttribute(html, 'meta', 'name', 'robots');
  const robotsValues = robotsTags.map(({tag}) => tag.match(/\bcontent="([^"]*)"/iu)?.[1] ?? '');
  const shouldIndex = performer.index_decision === 'INDEX_READY';
  if (shouldIndex && robotsValues.length > 1) {
    throw new Error(`${performer.stable_performer_id}: INDEX performer rendered duplicate robots metadata`);
  }
  if (shouldIndex && robotsValues.some((robots) => /(?:^|,)\s*noindex(?:,|$)/iu.test(robots))) {
    throw new Error(`${performer.stable_performer_id}: INDEX performer rendered noindex`);
  }
  if (!shouldIndex && (robotsValues.length !== 1 || robotsValues[0] !== 'noindex,follow')) {
    throw new Error(`${performer.stable_performer_id}: thin performer must render noindex,follow`);
  }

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
  if (h1 !== performer.primary_display_name) throw new Error(`${performer.stable_performer_id}: H1 differs from primary display name`);
  if (!html.includes(`data-performer-id="${performer.stable_performer_id}"`)
    || !new RegExp(`<code(?:\\s[^>]*)?>${performer.stable_performer_id}</code>`, 'u').test(html)) {
    throw new Error(`${performer.stable_performer_id}: visible stable performer identity is missing`);
  }

  const expectedTitle = `${performer.metadata_identity_label}作品與人物資料｜CC18 影格`;
  const expectedDescription = `整理${performer.metadata_identity_label}的日文原名、經核准別名與已發布作品，目前收錄 ${performer.public_work_count} 部。`;
  if (!html.includes(`<title>${expectedTitle}</title>`)) throw new Error(`${performer.stable_performer_id}: performer title is not neutral and deterministic`);
  if (!html.includes(`<meta name="description" content="${expectedDescription}">`)) {
    throw new Error(`${performer.stable_performer_id}: performer description is not neutral and deterministic`);
  }

  const records = recordsFromHtml(html, file);
  const people = records.filter((record) => record?.['@type'] === 'Person');
  const breadcrumbs = records.filter((record) => record?.['@type'] === 'BreadcrumbList');
  if (people.length !== 1 || breadcrumbs.length !== 1) {
    throw new Error(`${performer.stable_performer_id}: requires exactly one Person and one BreadcrumbList`);
  }
  if (records.some((record) => record?.['@type'] === 'VideoObject')) {
    throw new Error(`${performer.stable_performer_id}: performer page must not emit VideoObject`);
  }
  const person = people[0];
  if (person.name !== performer.primary_display_name || person.url !== expectedCanonical || person['@id'] !== expectedCanonical) {
    throw new Error(`${performer.stable_performer_id}: Person identity differs from visible stable identity`);
  }
  if (Object.hasOwn(person, 'sameAs')) throw new Error(`${performer.stable_performer_id}: unapproved Person sameAs is not allowed`);
  const alternateNames = asNameArray(person.alternateName);
  if (!sameOrderedValues(alternateNames, performer.schema_alternate_names)) {
    throw new Error(`${performer.stable_performer_id}: Person alternateName differs from approved catalog projection`);
  }
  const breadcrumb = breadcrumbs[0];
  if (breadcrumb.itemListElement?.at(-1)?.item !== expectedCanonical) {
    throw new Error(`${performer.stable_performer_id}: performer Breadcrumb canonical mismatch`);
  }
  if (breadcrumb.itemListElement?.at(-1)?.name !== performer.primary_display_name) {
    throw new Error(`${performer.stable_performer_id}: performer Breadcrumb name mismatch`);
  }
  return {canonical: expectedCanonical, shouldIndex, alternateNames};
}

export function validateSeriesPageHtml({series, html, file = series.href}) {
  const canonicalTags = tagsWithAttribute(html, 'link', 'rel', 'canonical');
  if (canonicalTags.length !== 1) {
    throw new Error(`${series.stable_series_id}: series page requires exactly one canonical link in ${file}`);
  }
  const canonical = canonicalTags[0].tag.match(/\bhref="([^"]+)"/iu)?.[1];
  const expectedCanonical = seriesCanonical(series);
  if (canonical !== expectedCanonical) throw new Error(`${series.stable_series_id}: stable series canonical mismatch in ${file}`);

  const robotsTags = tagsWithAttribute(html, 'meta', 'name', 'robots');
  const robotsValues = robotsTags.map(({tag}) => tag.match(/\bcontent="([^"]*)"/iu)?.[1] ?? '');
  const shouldIndex = series.index_decision === 'INDEX_READY';
  if (robotsValues.length !== 1) throw new Error(`${series.stable_series_id}: series page requires exactly one robots tag`);
  if (shouldIndex && /(?:^|,)\s*noindex(?:,|$)/iu.test(robotsValues[0])) {
    throw new Error(`${series.stable_series_id}: INDEX series rendered noindex`);
  }
  if (!shouldIndex && robotsValues[0] !== 'noindex,follow') {
    throw new Error(`${series.stable_series_id}: thin series must render noindex,follow`);
  }

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
  if (h1 !== series.display_name) throw new Error(`${series.stable_series_id}: H1 differs from source display fallback`);
  if (!html.includes(`data-series-id="${series.stable_series_id}"`)
    || !new RegExp(`<code(?:\\s[^>]*)?>${series.stable_series_id}<\/code>`, 'u').test(html)) {
    throw new Error(`${series.stable_series_id}: visible stable series identity is missing`);
  }
  const boldText = [...html.matchAll(/<b\b[^>]*>([\s\S]*?)<\/b>/giu)]
    .map((match) => match[1].replace(/<[^>]+>/g, '').trim());
  if (!boldText.includes(series.source_name)) {
    throw new Error(`${series.stable_series_id}: visible source series name is missing`);
  }

  const expectedTitle = `${series.metadata_identity_label}系列作品整理｜CC18 影格`;
  const expectedDescription = `整理${series.metadata_identity_label}在本站已發布的作品，目前收錄 ${series.public_work_count} 部；卡片依作品發行日新到舊。`;
  if (!html.includes(`<title>${expectedTitle}</title>`)) throw new Error(`${series.stable_series_id}: series title is not deterministic`);
  if (!html.includes(`<meta name="description" content="${expectedDescription}">`)) {
    throw new Error(`${series.stable_series_id}: series description is not deterministic`);
  }

  const records = recordsFromHtml(html, file);
  const collections = records.filter((record) => record?.['@type'] === 'CollectionPage');
  const breadcrumbs = records.filter((record) => record?.['@type'] === 'BreadcrumbList');
  if (collections.length !== 1 || breadcrumbs.length !== 1) {
    throw new Error(`${series.stable_series_id}: requires exactly one CollectionPage and one BreadcrumbList`);
  }
  if (records.some((record) => ['VideoObject', 'Person', 'CreativeWorkSeries'].includes(record?.['@type']))) {
    throw new Error(`${series.stable_series_id}: series page emitted an unapproved Schema type`);
  }
  const collection = collections[0];
  if (collection.name !== series.display_name || collection.url !== expectedCanonical || collection['@id'] !== expectedCanonical) {
    throw new Error(`${series.stable_series_id}: CollectionPage identity differs from visible stable identity`);
  }
  const itemList = collection.mainEntity;
  const expectedItems = series.public_works.map((card, index) => ({
    position: index + 1,
    name: card.catalog_code,
    item: new URL(card.href, siteOrigin).href,
  }));
  if (itemList?.['@type'] !== 'ItemList' || itemList.numberOfItems !== series.public_work_count
    || !sameOrderedValues(
      (itemList.itemListElement ?? []).map(({position, name, item}) => JSON.stringify({position, name, item})),
      expectedItems.map((item) => JSON.stringify(item)),
    )) {
    throw new Error(`${series.stable_series_id}: ItemList differs from catalog work order`);
  }
  const breadcrumb = breadcrumbs[0];
  if (breadcrumb.itemListElement?.at(-1)?.item !== expectedCanonical
    || breadcrumb.itemListElement?.at(-1)?.name !== series.display_name) {
    throw new Error(`${series.stable_series_id}: series Breadcrumb identity mismatch`);
  }
  return {canonical: expectedCanonical, shouldIndex};
}

export function validateWorkSeriesProjection({work, html, file = work.href}) {
  const linkTags = tagsWithAttribute(html, 'a', 'data-series-id');
  const actualLinks = linkTags.map(({tag}) => ({
    stable_series_id: tag.match(/\bdata-series-id="([^"]+)"/iu)?.[1],
    href: tag.match(/\bhref="([^"]+)"/iu)?.[1],
  }));
  const expectedLinks = work.series.map(({stable_series_id: id, href}) => ({stable_series_id: id, href}));
  if (!sameOrderedValues(actualLinks.map(JSON.stringify), expectedLinks.map(JSON.stringify))) {
    throw new Error(`${work.stable_movie_id}: work typed series links differ from catalog projection in ${file}`);
  }
  const records = recordsFromHtml(html, file);
  const articles = records.filter((record) => record?.['@type'] === 'Article');
  if (articles.length !== 1) throw new Error(`${work.stable_movie_id}: work requires exactly one Article Schema record`);
  const actualAbout = (articles[0].about ?? []).filter((item) => item?.['@type'] === 'Thing');
  const expectedAbout = work.series.map((series) => ({
    '@type': 'Thing',
    name: series.display_name,
    url: new URL(series.href, siteOrigin).href,
  }));
  if (!sameOrderedValues(actualAbout.map(JSON.stringify), expectedAbout.map(JSON.stringify))) {
    throw new Error(`${work.stable_movie_id}: Article series identity differs from visible typed series links`);
  }
  return true;
}

export async function runPostbuildSeo({
  dist = defaultDist,
  loadCatalog = loadPerformerCatalog,
  loadSeries = loadSeriesCatalog,
} = {}) {
  const files = await filesUnder(dist);
  const notFoundHtml = await readFile(resolve(dist, '404.html'), 'utf8');
  if (!notFoundHtml.includes('name="robots" content="noindex,follow"') || !notFoundHtml.includes('這個番號不在片單裡')) {
    throw new Error('Static 404 contract missing: dist/404.html must be a noindex guidance page');
  }
  const allHtmlFiles = files.filter((path) => path.endsWith('.html'));
  const htmlFiles = allHtmlFiles.filter((path) => path.endsWith('index.html'));
  const noindexUrls = new Set();
  const titles = new Map();
  const descriptions = new Map();
  const [catalog, seriesCatalog] = await Promise.all([loadCatalog(), loadSeries()]);
  const expectedPerformerFiles = new Map(catalog.performers.map((performer) => [
    `actresses/${performer.route_segment}/index.html`, performer,
  ]));
  validatePerformerHtmlFileSet({
    allHtmlPaths: allHtmlFiles.map((path) => relative(dist, path).replaceAll('\\', '/')),
    performers: catalog.performers,
  });
  validateSeriesHtmlFileSet({
    allHtmlPaths: allHtmlFiles.map((path) => relative(dist, path).replaceAll('\\', '/')),
    series: seriesCatalog.series,
  });

  const alternateNameUnion = new Set();
  const performerResults = new Map();
  const expectedSeriesFiles = new Map(seriesCatalog.series.map((series) => [
    `series/${series.route_segment}/index.html`, series,
  ]));
  const expectedWorkSeriesFiles = new Map(seriesCatalog.ordered_series_by_work.map((work) => [
    work.href.replace(/^\//u, '').concat('index.html'), work,
  ]));
  const seriesResults = new Map();
  for (const path of htmlFiles) {
    const html = await readFile(path, 'utf8');
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
    if (!canonical || !title || !description) throw new Error(`SEO metadata missing in ${path}`);
    if (/name="robots" content="[^"]*noindex/i.test(html)) noindexUrls.add(canonical);
    if (titles.has(title)) throw new Error(`Duplicate page title: ${title}`);
    titles.set(title, canonical);
    if (descriptions.has(description)) throw new Error(`Duplicate meta description: ${description}`);
    descriptions.set(description, canonical);
    const canonicalPathname = new URL(canonical).pathname;
    if (canonicalPathname.startsWith('/reviews/')) throw new Error(`Legacy review canonical remains after work URL migration: ${canonical}`);
    if (canonicalPathname.startsWith(WORK_ROUTE_PREFIX)) {
      for (const required of ['name="rating" content="adult"', 'BreadcrumbList', '"@type":"Article"']) {
        if (!html.includes(required)) throw new Error(`Work SEO contract missing ${required}: ${canonical}`);
      }
      const work = expectedWorkSeriesFiles.get(relative(dist, path).replaceAll('\\', '/'));
      if (!work) throw new Error(`Work page has no series catalog projection: ${canonical}`);
      validateWorkSeriesProjection({work, html, file: relative(dist, path).replaceAll('\\', '/')});
    }
    const relativePath = relative(dist, path).replaceAll('\\', '/');
    if (relativePath === 'actresses/index.html') {
      if (/name="robots" content="[^"]*noindex/i.test(html)) throw new Error('Performer index must remain indexable');
      if (canonical !== `${siteOrigin}/actresses/`) throw new Error('Performer index canonical is invalid');
    } else if (expectedPerformerFiles.has(relativePath)) {
      const performer = expectedPerformerFiles.get(relativePath);
      parsePerformerRouteSegment(performer.route_segment);
      const result = validatePerformerPageHtml({performer, html, file: relativePath});
      performerResults.set(performer.stable_performer_id, result);
      for (const name of result.alternateNames) alternateNameUnion.add(name);
    } else if (relativePath === 'series/index.html') {
      if (/name="robots" content="[^"]*noindex/i.test(html)) throw new Error('Series index must remain indexable');
      if (canonical !== `${siteOrigin}/series/`) throw new Error('Series index canonical is invalid');
    } else if (expectedSeriesFiles.has(relativePath)) {
      const series = expectedSeriesFiles.get(relativePath);
      parseSeriesRouteSegment(series.route_segment);
      const result = validateSeriesPageHtml({series, html, file: relativePath});
      seriesResults.set(series.stable_series_id, result);
    }
  }

  const expectedAlternateNames = [...APPROVED_SCHEMA_ALTERNATE_NAMES].sort();
  const actualAlternateNames = [...alternateNameUnion].sort();
  if (!sameOrderedValues(actualAlternateNames, expectedAlternateNames)) {
    throw new Error(`Person alternateName union mismatch: ${actualAlternateNames.join(',') || 'none'}`);
  }
  for (const forbidden of FORBIDDEN_SCHEMA_ALTERNATE_NAMES) {
    if (alternateNameUnion.has(forbidden)) throw new Error(`Forbidden Person alternateName leaked: ${forbidden}`);
  }
  if (performerResults.size !== catalog.performers.length) throw new Error('Not every catalog performer received an SEO validation result');
  if (seriesResults.size !== seriesCatalog.series.length) throw new Error('Not every catalog series received an SEO validation result');

  const sitemapPaths = files.filter((item) => /sitemap-\d+\.xml$/.test(item));
  for (const path of sitemapPaths) {
    let xml = await readFile(path, 'utf8');
    xml = xml.replace(/<url><loc>([^<]+)<\/loc><\/url>/g, (block, url) => noindexUrls.has(url) ? '' : block);
    await writeFile(path, xml);
    for (const url of noindexUrls) {
      if (xml.includes(`<loc>${url}</loc>`)) throw new Error(`Noindex URL remains in sitemap: ${url}`);
    }
  }

  const sitemapText = (await Promise.all(sitemapPaths.map((path) => readFile(path, 'utf8')))).join('\n');
  if (!sitemapText.includes(`<loc>${siteOrigin}/actresses/</loc>`)) throw new Error('Performer index is missing from sitemap');
  const sitemapPerformerDetails = [...sitemapText.matchAll(/<loc>(https:\/\/cc18\.pages\.dev\/actresses\/[^<]+\/)<\/loc>/g)]
    .map((match) => match[1]);
  const expectedIndexedDetails = catalog.performers
    .filter(({index_decision: decision}) => decision === 'INDEX_READY')
    .map(performerCanonical)
    .sort();
  if (!sameOrderedValues([...sitemapPerformerDetails].sort(), expectedIndexedDetails)) {
    throw new Error(`Performer sitemap set mismatch: ${sitemapPerformerDetails.join(',') || 'none'}`);
  }
  if (!sitemapText.includes(`<loc>${siteOrigin}/series/</loc>`)) throw new Error('Series index is missing from sitemap');
  const sitemapSeriesDetails = [...sitemapText.matchAll(/<loc>(https:\/\/cc18\.pages\.dev\/series\/[^<]+\/)<\/loc>/g)]
    .map((match) => match[1]);
  const expectedIndexedSeries = seriesCatalog.series
    .filter(({index_decision: decision}) => decision === 'INDEX_READY')
    .map(seriesCanonical)
    .sort();
  if (!sameOrderedValues([...sitemapSeriesDetails].sort(), expectedIndexedSeries)) {
    throw new Error(`Series sitemap set mismatch: ${sitemapSeriesDetails.join(',') || 'none'}`);
  }

  console.log(`SEO postbuild valid: ${htmlFiles.length} page(s), ${noindexUrls.size} noindex URL(s), ${catalog.performers.length} stable performer pages, ${seriesCatalog.series.length} stable series pages and exact sitemap/schema sets passed.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await runPostbuildSeo();
}
