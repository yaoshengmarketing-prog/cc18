import {defineConfig} from 'astro/config';
import sitemap from '@astrojs/sitemap';
import {PUBLIC_SITE_ORIGIN} from './src/lib/site-origin.mjs';

export default defineConfig({
  // Deployment URLs identify releases; public canonical and sitemap URLs stay
  // on the production hostname in every build environment.
  site: PUBLIC_SITE_ORIGIN,
  output: 'static',
  integrations: [sitemap()],
  build: {format: 'directory'},
});
