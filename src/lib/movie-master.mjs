import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = resolve(process.cwd());
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const clean = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;

const cardTitle = (master) => [
  master.titles?.display_short_title,
  master.titles?.translated_title_zh_tw,
  master.titles?.article_title,
  master.source?.source_title,
  master.source?.catalog_code,
].map(clean).find(Boolean) ?? null;

export const resolveInternalReviewHref = (canonicalUrl, slug) => {
  const normalizedSlug = clean(slug);
  if (!normalizedSlug || !/^[a-z0-9-]+$/.test(normalizedSlug)) return null;
  try {
    const url = new URL(canonicalUrl);
    const expectedPathname = `/reviews/${normalizedSlug}/`;
    return url.pathname === expectedPathname ? url.pathname : null;
  } catch {
    return null;
  }
};

export async function loadPublishedMovieCardCatalog() {
  const [index, taxonomy] = await Promise.all([
    readJson('data/movie-master/index.json'),
    readJson('data/taxonomy.json'),
  ]);
  const tagLabels = new Map((taxonomy.tags ?? []).map(({id, label}) => [id, label]));
  const cards = [];
  const exclusions = [];

  for (const entry of index.entries ?? []) {
    const master = await readJson(entry.master_path);
    const title = cardTitle(master);
    const href = resolveInternalReviewHref(master.publishing?.canonical_url, master.slug);
    const qualifies = Boolean(
      entry.is_published === true
      && master.publishing?.is_published === true
      && entry.is_demo !== true
      && master.is_demo !== true
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

    cards.push({
      stable_movie_id: String(master.stable_movie_id),
      source_cover: String(master.source.source_cover),
      title: String(title),
      catalog_code: String(master.source.catalog_code),
      release_date: clean(master.source.release_date),
      performers: (master.display?.performers ?? []).map(({display_name: displayName}) => clean(displayName)).filter(Boolean),
      canonical_topics: canonicalTopicTagIds.map((id) => ({id, label: tagLabels.get(id)})),
      has_remotion_promo: Boolean(clean(master.media?.remotion_promo_ref)),
      href: String(href),
    });
  }

  cards.sort((left, right) => (
    (right.release_date ?? '').localeCompare(left.release_date ?? '')
    || left.catalog_code.localeCompare(right.catalog_code, 'en')
  ));

  return {
    cards,
    exclusions,
    index: {
      tracked_input_count: index.tracked_input_count,
      published_count: index.published_count,
      formal_draft_count: index.formal_draft_count,
      demo_count: index.demo_count,
    },
  };
}
