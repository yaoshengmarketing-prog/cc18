import {defineConfig} from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://cc18.example',
  output: 'static',
  integrations: [sitemap()],
  build: {format: 'directory'},
});
