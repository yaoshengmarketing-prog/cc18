import {load} from 'cheerio';

const ALLOWED_HOSTS = new Set(['cc18.tv', 'www.cc18.tv']);

const clean = (value = '') => value.replace(/\s+/g, ' ').trim();
const unique = (items) => [...new Set(items.filter(Boolean))];

export function assertCc18Url(value) {
  const url = new URL(value);
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error(`Disallowed source host: ${url.hostname}`);
  return url;
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

  const result = {
    id,
    title: id ? clean(title.replace(new RegExp(`${id}$`, 'i'), '')) : title,
    original_title_ja: null,
    translated_title_zh_tw: null,
    release_date: /^20\d{2}-\d{2}-\d{2}$/.test(releaseDate) ? releaseDate : null,
    actress: linkTexts('.tag-info a[href*="s_type=actor"]'),
    studio: linkTexts('.content a[href*="s_type=fac"]').at(0) ?? null,
    series: linkTexts('.content a[href*="s_type=series"]').at(0) ?? null,
    source_tags: linkTexts('.tag-info a[href*="s_type=tag"]'),
    description,
    cover_source_url: coverValue ? new URL(coverValue, url).href : null,
    source_url: url.href,
    source_site: 'cc18.tv',
    fetched_at: new Date().toISOString(),
  };

  for (const field of ['id', 'title', 'release_date', 'cover_source_url']) {
    if (!result[field]) throw new Error(`CC18 work page missing required field: ${field}`);
  }
  return result;
}
