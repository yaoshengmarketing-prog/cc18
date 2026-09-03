import {load} from 'cheerio';
import {
  parseCc18SourcePageUrl,
  parseCc18SearchRelationUrl,
  parsePerformerSourceUrl,
} from '../../src/lib/performer-url.mjs';
import {parseSeriesSourceId, seriesStableIdFromSourceId} from '../../src/lib/series-identity.mjs';
import {parseTagSourceId, tagStableIdFromSourceId} from '../../src/lib/tag-identity.mjs';
import {facStableIdFromSourceId, parseFacSourceId} from '../../src/lib/fac-identity.mjs';

const ALLOWED_HOSTS = new Set(['cc18.tv', 'www.cc18.tv']);

const clean = (value = '') => value.replace(/\s+/g, ' ').trim();
const unique = (items) => [...new Set(items.filter(Boolean))];

const performerRelations = ($, baseUrl, workId) => {
  const relations = [];
  const seen = new Set();
  $('.tag-info a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    let classified;
    try {
      classified = parseCc18SearchRelationUrl(href, {baseUrl});
    } catch (error) {
      throw new Error(`${workId ?? 'unknown work'}: invalid actor relation or CC18 search relation ${JSON.stringify(href)}: ${error.message}`);
    }
    if (classified.sourceType !== 'actor') return;
    const parsed = parsePerformerSourceUrl(href, {baseUrl});
    const sourceName = clean($(element).text());
    if (!sourceName) return;
    if (seen.has(parsed.stableId)) throw new Error(`${workId ?? 'unknown work'}: duplicate actor relation ${parsed.stableId}`);
    seen.add(parsed.stableId);
    relations.push({
      source_type: 'actor',
      source_id: parsed.sourceId,
      stable_source_id: parsed.stableId,
      source_name: sourceName,
      source_url: parsed.absoluteUrl,
    });
  });
  return relations;
};

const seriesRelations = ($, baseUrl, workId, observedAt) => {
  const relations = [];
  const seen = new Set();
  $('.content a[href*="search.php"]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    let classified;
    try {
      classified = parseCc18SearchRelationUrl(href, {baseUrl});
    } catch (error) {
      throw new Error(`${workId ?? 'unknown work'}: invalid CC18 content relation ${JSON.stringify(href)}: ${error.message}`);
    }
    if (classified.sourceType !== 'series') return;
    const sourceId = parseSeriesSourceId(classified.sourceId);
    const stableSourceId = seriesStableIdFromSourceId(sourceId);
    const sourceName = clean($(element).text());
    if (!sourceName) throw new Error(`${workId ?? 'unknown work'}: series relation has an empty source name: ${href}`);
    if (seen.has(stableSourceId)) throw new Error(`${workId ?? 'unknown work'}: duplicate series relation ${stableSourceId}`);
    if (relations.length > 0) throw new Error(`${workId ?? 'unknown work'}: multiple series identities are not allowed`);
    seen.add(stableSourceId);
    relations.push({
      source_type: 'series',
      source_id: sourceId,
      stable_source_id: stableSourceId,
      source_name: sourceName,
      source_url: classified.absoluteUrl,
      observed_at: observedAt,
    });
  });
  return relations;
};

const tagRelations = ($, baseUrl, workId, observedAt) => {
  const relations = [];
  const seen = new Set();
  $('.tag-info a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    let classified;
    try {
      classified = parseCc18SearchRelationUrl(href, {baseUrl});
    } catch (error) {
      throw new Error(`${workId ?? 'unknown work'}: invalid CC18 tag-info relation ${JSON.stringify(href)}: ${error.message}`);
    }
    if (classified.sourceType !== 'tag') return;
    const sourceId = parseTagSourceId(classified.sourceId);
    const stableSourceId = tagStableIdFromSourceId(sourceId);
    const sourceName = clean($(element).text());
    if (!sourceName) throw new Error(`${workId ?? 'unknown work'}: tag relation has an empty source name: ${href}`);
    if (seen.has(stableSourceId)) throw new Error(`${workId ?? 'unknown work'}: duplicate tag relation ${stableSourceId}`);
    seen.add(stableSourceId);
    relations.push({
      source_type: 'tag',
      source_id: sourceId,
      stable_source_id: stableSourceId,
      source_name: sourceName,
      source_url: classified.absoluteUrl,
      observed_at: observedAt,
    });
  });
  return relations;
};

const facRelations = ($, baseUrl, workId, observedAt) => {
  const relations = [];
  const seen = new Set();
  $('.content > .note > a[href*="search.php"]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    let classified;
    try {
      classified = parseCc18SearchRelationUrl(href, {baseUrl});
    } catch (error) {
      throw new Error(`${workId ?? 'unknown work'}: invalid CC18 direct metadata relation ${JSON.stringify(href)}: ${error.message}`);
    }
    if (classified.sourceType !== 'fac') return;
    const sourceId = parseFacSourceId(classified.sourceId);
    const stableSourceId = facStableIdFromSourceId(sourceId);
    const sourceName = clean($(element).text());
    if (!sourceName) throw new Error(`${workId ?? 'unknown work'}: fac relation has an empty source name: ${href}`);
    if (seen.has(stableSourceId)) throw new Error(`${workId ?? 'unknown work'}: duplicate fac relation ${stableSourceId}`);
    seen.add(stableSourceId);
    relations.push({
      source_type: 'fac',
      source_id: sourceId,
      stable_source_id: stableSourceId,
      source_name: sourceName,
      source_url: classified.absoluteUrl,
      observed_at: observedAt,
    });
  });
  return relations;
};

export function assertCc18Url(value) {
  return parseCc18SourcePageUrl(value);
}

export function parseListing(html, baseUrl = 'https://cc18.tv/') {
  const base = assertCc18Url(baseUrl);
  const $ = load(html);
  return unique($('a[href*="player.php?uuid="]').map((_, element) => {
    const href = $(element).attr('href');
    if (!href) return '';
    const url = new URL(href, base);
    if (!ALLOWED_HOSTS.has(url.hostname)) return '';
    if (url.pathname !== '/player.php') return '';
    if (url.searchParams.get('npage') === 'cartoon') return '';
    return url.href;
  }).get());
}

export function inspectWorkPage(html) {
  const $ = load(html);
  const title = clean($('h1').first().text());
  return {
    title,
    detected_id: title.match(/\b[A-Z][A-Z0-9]*-\d+\b/i)?.[0]?.toUpperCase() ?? null,
    release_date: clean($('.date').first().text()) || null,
    description_length: clean($('.intro p').first().text()).replace(/^簡介[：:]\s*/, '').length,
    has_cover: $('p.movie_player_up_pic img, .movie_player_up_pic img').length > 0,
  };
}

export function parseWorkPage(html, sourceUrl) {
  const url = assertCc18Url(sourceUrl);
  const $ = load(html);
  const title = clean($('h1').first().text());
  const id = title.match(/\b[A-Z][A-Z0-9]*-\d+\b/i)?.[0]?.toUpperCase();
  const coverNode = $('p.movie_player_up_pic img, .movie_player_up_pic img').first();
  const coverValue = coverNode.attr('data-src') ?? coverNode.attr('data-original') ?? coverNode.attr('src');
  const releaseDate = clean($('.date').first().text());
  const description = clean($('.intro p').first().text()).replace(/^簡介[：:]\s*/, '') || null;
  const linkTexts = (selector) => unique($(selector).map((_, element) => clean($(element).text())).get());
  const fetchedAt = new Date().toISOString();
  const parsedPerformerRelations = performerRelations($, sourceUrl, id)
    .map((relation) => ({...relation, observed_at: fetchedAt}));
  const parsedSeriesRelations = seriesRelations($, sourceUrl, id, fetchedAt);
  const parsedTagRelations = tagRelations($, sourceUrl, id, fetchedAt);
  const parsedFacRelations = facRelations($, sourceUrl, id, fetchedAt);

  const result = {
    id,
    title: id ? clean(title.replace(new RegExp(`${id}$`, 'i'), '')) : title,
    original_title_ja: null,
    translated_title_zh_tw: null,
    release_date: /^20\d{2}-\d{2}-\d{2}$/.test(releaseDate) ? releaseDate : null,
    actress: parsedPerformerRelations.map(({source_name: sourceName}) => sourceName),
    source_relations: {
      performers: parsedPerformerRelations,
      series: parsedSeriesRelations,
      tags: parsedTagRelations,
      fac: parsedFacRelations,
    },
    studio: parsedFacRelations.length === 1 ? parsedFacRelations[0].source_name : null,
    series: parsedSeriesRelations[0]?.source_name ?? null,
    source_tags: linkTexts('.tag-info a[href*="s_type=tag"]'),
    description,
    cover_source_url: coverValue ? new URL(coverValue, url).href : null,
    source_url: url.href,
    source_site: 'cc18.tv',
    fetched_at: fetchedAt,
  };

  for (const field of ['id', 'title', 'release_date']) {
    if (!result[field]) throw new Error(`CC18 work page missing required field: ${field}`);
  }
  return result;
}
