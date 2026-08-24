import {defineConfig} from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: process.env.SITE_URL ?? process.env.CF_PAGES_URL ?? 'http://localhost:4321',
  output: 'static',
  integrations: [sitemap()],
  build: {format: 'directory'},
});
