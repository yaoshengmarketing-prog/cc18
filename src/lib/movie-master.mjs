import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {resolveInternalWorkHref} from './work-url.mjs';

const root = resolve(process.cwd());
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const clean = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const isValidDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const cardTitle = (master) => [
  master.titles?.display_short_title,
  master.titles?.translated_title_zh_tw,
  master.titles?.article_title,
  master.source?.source_title,
  master.source?.catalog_code,
].map(clean).find(Boolean) ?? null;

const loadPublishedMovieCardRecords = async () => {
  const [index, taxonomy] = await Promise.all([
    readJson('data/movie-master/index.json'),
    readJson('data/taxonomy.json'),
  ]);
  const tagLabels = new Map((taxonomy.tags ?? []).map(({id, label}) => [id, label]));
  const records = [];
  const exclusions = [];

  for (const entry of index.entries ?? []) {
    const master = await readJson(entry.master_path);
    const title = cardTitle(master);
    const href = resolveInternalWorkHref(master.publishing?.canonical_url, master.slug);
    const qualifies = Boolean(
      entry.is_published === true
      && master.publishing?.is_published === true
      && entry.is_demo !== true
      && master.is_demo !== true
      && master.publishing?.indexability === 'INDEX'
      && clean(master.stable_movie_id)
      && clean(master.slug)
      && clean(master.source?.catalog_code)
      && clean(master.source?.source_cover)
      && title
      && href,
    );

    if (!qualifies) {
      exclusions.push({
        stable_movie_id: master.stable_movie_id ?? entry.stable_movie_id ?? null,
        is_demo: master.is_demo === true || entry.is_demo === true,
        is_published: master.publishing?.is_published === true && entry.is_published === true,
      });
      continue;
    }

    const canonicalTopicTagIds = (master.derived?.canonical_topic_tag_ids ?? [])
      .filter((id) => typeof id === 'string' && tagLabels.has(id))
      .slice(0, 2);

    records.push({
      published_at: master.publishing?.published_at ?? null,
      card: {
        stable_movie_id: String(master.stable_movie_id),
        source_cover: String(master.source.source_cover),
        title: String(title),
        catalog_code: String(master.source.catalog_code),
        release_date: clean(master.source.release_date),
        performers: (master.display?.performers ?? []).map(({display_name: displayName}) => clean(displayName)).filter(Boolean),
        canonical_topics: canonicalTopicTagIds.map((id) => ({id, label: tagLabels.get(id)})),
        has_remotion_promo: Boolean(clean(master.media?.remotion_promo_ref)),
        href: String(href),
      },
    });
  }

  return {
    records,
    exclusions,
    index: {
      tracked_input_count: index.tracked_input_count,
      published_count: index.published_count,
      formal_draft_count: index.formal_draft_count,
      demo_count: index.demo_count,
    },
  };
};

export const sortLatestAddedMovieCardRecords = (records) => {
  for (const {card, published_at: publishedAt} of records) {
    if (!isValidDate(publishedAt)) {
      throw new Error(`${card?.catalog_code ?? 'Published work'}: latest_added requires a valid published_at`);
    }
  }
  return [...records].sort((left, right) => (
    right.published_at.localeCompare(left.published_at)
    || left.card.catalog_code.localeCompare(right.card.catalog_code, 'en')
  ));
};

export async function loadPublishedMovieCardCatalog() {
  const catalog = await loadPublishedMovieCardRecords();
  const {records, ...metadata} = catalog;
  const cards = records.map(({card}) => card);
  cards.sort((left, right) => (
    (right.release_date ?? '').localeCompare(left.release_date ?? '')
    || left.catalog_code.localeCompare(right.catalog_code, 'en')
  ));

  return {...metadata, cards};
}

export async function loadLatestAddedMovieCardCatalog() {
  const catalog = await loadPublishedMovieCardRecords();
  const {records, ...metadata} = catalog;
  const cards = sortLatestAddedMovieCardRecords(records).map(({card}) => card);
  return {...metadata, cards};
}
