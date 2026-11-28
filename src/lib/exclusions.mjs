import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {resolveProjectRoot} from './project-root.mjs';

const directory = resolve(resolveProjectRoot(), 'data/editorial-exclusions');

const ids = new Set(readdirSync(directory)
  .filter((name) => /^[A-Z0-9]+(?:-[A-Z0-9]+)+\.json$/u.test(name))
  .map((name) => name.slice(0, -5)));

export const excludedIds = () => new Set(ids);
export const isExcluded = (id) => typeof id === 'string' && ids.has(id.toUpperCase());
export const publicReviews = (reviews) => reviews.filter(({data}) => !isExcluded(data.id));
