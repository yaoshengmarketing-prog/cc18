import {defineConfig} from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // CF_PAGES_URL is a deployment-specific hash URL. Keep canonical and sitemap
  // URLs on the stable production hostname unless SITE_URL is explicitly set.
  site: process.env.SITE_URL ?? 'https://cc18.pages.dev',
  output: 'static',
  integrations: [sitemap()],
  build: {format: 'directory'},
});
