import {defineConfig} from 'astro/config';
import sitemap from '@astrojs/sitemap';
import {PUBLIC_SITE_ORIGIN} from './src/lib/site-origin.mjs';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadAggregateCatalog} from './src/lib/aggregate-catalog.mjs';

const registry = JSON.parse(readFileSync(resolve('data/movie-registry.json'), 'utf8'));
const workLastmod = new Map(registry.records.filter(({review_status}) => review_status === 'published').map(({id}) => {
  const markdown = readFileSync(resolve('content/reviews', `${id}.md`), 'utf8');
  const publishedAt = /^publishedAt:\s*(\S+)/m.exec(markdown)?.[1];
  const updatedAt = /^(?:modifiedAt|updatedAt):\s*(\S+)/m.exec(markdown)?.[1];
  const date = new Date(updatedAt ?? publishedAt);
  return [`/works/${id.toLowerCase()}/`, Number.isNaN(date.getTime()) ? undefined : date.toISOString()];
}));
const aggregateCatalog = await loadAggregateCatalog();
const thinAggregatePaths = new Set(Object.values(aggregateCatalog)
  .filter(Array.isArray)
  .flat()
  .filter((group) => group.index_decision === 'NOINDEX_THIN')
  .map((group) => group.href));

export default defineConfig({
  // Deployment URLs identify releases; public canonical and sitemap URLs stay
  // on the production hostname in every build environment.
  site: PUBLIC_SITE_ORIGIN,
  output: 'static',
  // Local validation can reuse an existing output directory when the sandbox
  // disallows Astro's recursive cleanup; production builds retain the default.
  vite: process.env.CC18_VALIDATE_REUSE_DIST === '1' ? {build: {emptyOutDir: false}} : {},
  integrations: [sitemap({filter: (url) => !thinAggregatePaths.has(new URL(url).pathname), serialize(item) {
    const lastmod = workLastmod.get(new URL(item.url).pathname);
    return lastmod ? {...item, lastmod} : item;
  }})],
  build: {format: 'directory'},
});
