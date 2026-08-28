const HYPHENS = /[‐‑‒–—―−﹘﹣－]/gu;

export const normalizeSearchText = (value) => String(value ?? '')
  .normalize('NFKC')
  .trim()
  .replace(HYPHENS, '-')
  .replace(/\s+/gu, ' ')
  .toLocaleLowerCase('zh-Hant');

export const compactSearchText = (value) => normalizeSearchText(value).replace(/\s+/gu, '');
export const normalizeCatalogCode = (value) => compactSearchText(value).replace(/-/gu, '');
export const visibleQueryLength = (value) => [...compactSearchText(value).replace(/-/gu, '')].length;

export const searchableAliasNames = (aliases = []) => aliases
  .filter(({searchable}) => searchable === true)
  .map(({name}) => typeof name === 'string' ? name.trim() : '')
  .filter(Boolean);

const matchName = (person, query) => {
  const names = [
    person.display_name_zh_tw,
    person.name_ja,
    person.source_name,
    ...(person.searchable_aliases ?? []),
  ].filter(Boolean);
  const normalizedQuery = compactSearchText(query);
  let best = null;
  for (const name of names) {
    const normalizedName = compactSearchText(name);
    const kind = normalizedName === normalizedQuery ? 'exact'
      : normalizedName.startsWith(normalizedQuery) ? 'prefix'
        : normalizedName.includes(normalizedQuery) ? 'partial'
          : null;
    if (!kind) continue;
    const score = {exact: 900, prefix: 800, partial: 700}[kind];
    if (!best || score > best.score) best = {name, kind, score};
  }
  return best;
};

const titleMatch = (movie, query) => {
  const normalizedQuery = compactSearchText(query);
  const fields = [
    ['display_short_title', movie.search.display_short_title],
    ['article_title', movie.search.article_title],
    ['source_title', movie.search.source_title],
  ];
  for (const [field, value] of fields) {
    if (value && compactSearchText(value).includes(normalizedQuery)) return {field, value};
  }
  return null;
};

export function searchCatalog(index, rawQuery) {
  const query = String(rawQuery ?? '').trim();
  if (!query) return {query, valid: false, reason: 'empty', people: [], movies: []};
  if (visibleQueryLength(query) < 2) return {query, valid: false, reason: 'too_short', people: [], movies: []};

  const people = [];
  const personMatches = new Map();
  for (const person of index.performers ?? []) {
    const match = matchName(person, query);
    if (!match) continue;
    const result = {...person, match_name: match.name, match_kind: match.kind, score: match.score};
    personMatches.set(person.stable_actor_id, result);
    people.push(result);
  }
  people.sort((left, right) => right.score - left.score || left.display_name.localeCompare(right.display_name, 'zh-Hant'));

  const normalizedCodeQuery = normalizeCatalogCode(query);
  const normalizedQuery = compactSearchText(query);
  const movies = [];
  const seenMovieIds = new Set();
  for (const movie of index.movies ?? []) {
    let score = 0;
    let reason = '';
    if (normalizeCatalogCode(movie.card.catalog_code) === normalizedCodeQuery) {
      score = 1000;
      reason = `番號：${movie.card.catalog_code}`;
    } else {
      const matchedPerson = movie.performer_ids.map((id) => personMatches.get(id)).filter(Boolean)
        .sort((left, right) => right.score - left.score)[0];
      if (matchedPerson) {
        score = matchedPerson.score;
        reason = `演員：${matchedPerson.match_name}`;
      } else {
        const matchedTitle = titleMatch(movie, query);
        const matchedTopic = movie.card.canonical_topics.find(({label}) => compactSearchText(label).includes(normalizedQuery));
        if (matchedTitle) {
          score = 500;
          reason = `片名：${matchedTitle.value}`;
        } else if (matchedTopic) {
          score = 400;
          reason = `題材：${matchedTopic.label}`;
        } else if (compactSearchText(movie.search.slug).includes(normalizedQuery)) {
          score = 300;
          reason = `作品網址：${movie.search.slug}`;
        }
      }
    }
    if (!score || seenMovieIds.has(movie.card.stable_movie_id)) continue;
    seenMovieIds.add(movie.card.stable_movie_id);
    movies.push({...movie, score, match_reason: reason});
  }
  movies.sort((left, right) => right.score - left.score
    || (right.card.release_date ?? '').localeCompare(left.card.release_date ?? '')
    || left.card.catalog_code.localeCompare(right.card.catalog_code, 'en'));

  return {query, valid: true, reason: null, people, movies};
}
