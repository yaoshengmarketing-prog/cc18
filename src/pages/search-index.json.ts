import {getCollection} from 'astro:content';
import {tagItems} from '../lib/taxonomy';

export const prerender = true;

export async function GET() {
  const reviews = await getCollection('reviews', ({data}) => data.status === 'published');
  const payload = reviews.map(({data}) => ({
    id: data.id,
    title: data.title,
    shortReview: data.shortReview,
    actress: data.actress,
    series: data.series ?? null,
    tags: tagItems(data.canonicalTagIds).map(({label}) => label),
    releaseDate: data.releaseDate.toISOString().slice(0, 10),
    coverUrl: data.coverUrl,
    href: `/reviews/${data.id.toLowerCase()}/`,
  }));
  return new Response(JSON.stringify(payload), {
    headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300'},
  });
}
