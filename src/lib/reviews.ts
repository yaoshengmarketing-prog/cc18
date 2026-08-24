import type {CollectionEntry} from 'astro:content';

export type Review = CollectionEntry<'reviews'>;

export const byNewest = (a: Review, b: Review) =>
  b.data.releaseDate.getTime() - a.data.releaseDate.getTime();

export const reviewHref = (review: Review) => `/reviews/${review.data.id.toLowerCase()}/`;

export const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('zh-TW', {year: 'numeric', month: '2-digit', day: '2-digit'}).format(date);

export const visibleTags = (review: Review) =>
  [...review.data.canonicalTags, ...review.data.discoveryTags].slice(0, 8);
