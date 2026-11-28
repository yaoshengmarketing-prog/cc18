import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadPublishedMovieCardCatalog} from './movie-master.mjs';
import {resolveProjectRoot} from './project-root.mjs';

const root = resolveProjectRoot();
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const safeSegment = (value) => encodeURIComponent(value.toLowerCase());
const add = (map, key, label, card) => {
  if (!key) return;
  const group = map.get(key) ?? {key, label, public_works: []};
  group.public_works.push(card);
  map.set(key, group);
};
const finish = (map, type) => [...map.values()].map((group) => {
  const works = group.public_works.sort((a, b) => b.release_date.localeCompare(a.release_date) || a.catalog_code.localeCompare(b.catalog_code));
  const first = works.at(-1).release_date;
  const last = works[0].release_date;
  const names = new Map();
  for (const card of works) for (const name of card.performers) names.set(name, (names.get(name) ?? 0) + 1);
  const frequentNames = [...names].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const dateSpan = first === last ? first : `${first} 至 ${last}`;
  const detail = frequentNames.length ? `其中 ${frequentNames.map(([name, count]) => `${name} ${count} 部`).join('、')}。` : `作品發行日期涵蓋 ${dateSpan}。`;
  return {
    ...group,
    type,
    href: `/${type}/${safeSegment(group.key)}/`,
    public_work_count: works.length,
    index_decision: works.length >= 3 ? 'INDEX_READY' : 'NOINDEX_THIN',
    summary: `本站已發布的${group.label}作品共 ${works.length} 部，發行日期為 ${dateSpan}。${detail}`,
  };
}).sort((a, b) => b.public_work_count - a.public_work_count || a.key.localeCompare(b.key));

export function buildAggregateCatalog({cards, masters}) {
  const byId = new Map(masters.map((master) => [master.stable_movie_id, master]));
  const prefixes = new Map();
  const studios = new Map();
  const months = new Map();
  const ordered_by_work = [];
  for (const card of cards) {
    const master = byId.get(card.stable_movie_id);
    if (!master) throw new Error(`${card.catalog_code}: published aggregate work has no Movie Master`);
    const prefix = /^([A-Z0-9]+)-\d+$/u.exec(card.catalog_code)?.[1];
    const relation = master.source?.fac_relations?.[0];
    const studio = relation?.source_id && relation?.source_name ? relation : null;
    const month = /^\d{4}-\d{2}/u.exec(card.release_date ?? '')?.[0];
    add(prefixes, prefix, `${prefix} 番號前綴`, card);
    add(studios, studio?.source_id, studio?.source_name, card);
    add(months, month, `${month} 發行月份`, card);
    ordered_by_work.push({
      stable_movie_id: card.stable_movie_id,
      links: [
        prefix && {type: 'prefixes', key: prefix},
        studio && {type: 'studios', key: studio.source_id},
        month && {type: 'months', key: month},
      ].filter(Boolean),
    });
  }
  const groups = {
    prefixes: finish(prefixes, 'prefixes'),
    studios: finish(studios, 'studios'),
    months: finish(months, 'months'),
  };
  const lookup = new Map(Object.values(groups).flat().map((group) => [`${group.type}:${group.key}`, group]));
  return {
    ...groups,
    ordered_by_work: ordered_by_work.map((entry) => ({
      stable_movie_id: entry.stable_movie_id,
      links: entry.links.map(({type, key}) => {
        const group = lookup.get(`${type}:${key}`);
        return {type, label: group.label, href: group.href};
      }),
    })),
  };
}

export async function loadAggregateCatalog() {
  const [catalog, index] = await Promise.all([loadPublishedMovieCardCatalog(), readJson('data/movie-master/index.json')]);
  const entries = new Map(index.entries.map((entry) => [entry.stable_movie_id, entry]));
  const masters = await Promise.all(catalog.cards.map(async (card) => {
    const entry = entries.get(card.stable_movie_id);
    if (!entry) throw new Error(`${card.catalog_code}: no Movie Master index entry`);
    return readJson(entry.master_path);
  }));
  return buildAggregateCatalog({cards: catalog.cards, masters});
}
