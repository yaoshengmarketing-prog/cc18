import {getCollection} from 'astro:content';
import {buildTagChannels, editorialTagItems, sourceTagItems, tagItems} from '../lib/taxonomy';

export const prerender = true;

export async function GET() {
  const reviews = await getCollection('reviews', ({data}) => data.status === 'published');
  const payload = reviews.map(({data}) => {
    const channels = buildTagChannels(data);
    return {
      id: data.id,
      title: data.title,
      shortReview: data.shortReview,
      actress: data.actress,
      series: data.series ?? null,
      tags: [...new Set([
        ...sourceTagItems(data.sourceTags).map(({label}) => label),
        ...tagItems(channels.canonicalTagIds).map(({label}) => label),
        ...editorialTagItems(channels.editorialTagIds).map(({label}) => label),
      ])],
      releaseDate: data.releaseDate.toISOString().slice(0, 10),
      coverUrl: data.coverUrl,
      href: `/reviews/${data.id.toLowerCase()}/`,
    };
  });
  return new Response(JSON.stringify(payload), {
    headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300'},
  });
}
