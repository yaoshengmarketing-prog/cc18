import type {CollectionEntry} from 'astro:content';
import {sourceTagIds, tagItems, type TagItem} from './taxonomy';

export type Review = CollectionEntry<'reviews'>;

export const byNewest = (a: Review, b: Review) =>
  b.data.releaseDate.getTime() - a.data.releaseDate.getTime();

export const reviewHref = (review: Review) => `/reviews/${review.data.id.toLowerCase()}/`;

export const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('zh-TW', {year: 'numeric', month: '2-digit', day: '2-digit'}).format(date);

export const isNewRelease = (review: Review, now = new Date()) => {
  const age = now.getTime() - review.data.releaseDate.getTime();
  return age >= 0 && age <= 7 * 24 * 60 * 60 * 1000;
};

export const visibleTags = (review: Review, now = new Date()): TagItem[] => {
  const items = tagItems(review.data.canonicalTagIds);
  if (isNewRelease(review, now)) {
    items.unshift({label: '新片', href: '/latest/', kind: 'freshness'});
  }
  return items.slice(0, 8);
};

export const reviewTagIds = (review: Review) => [
  ...new Set([...review.data.canonicalTagIds, ...sourceTagIds(review.data.sourceTags)]),
];
