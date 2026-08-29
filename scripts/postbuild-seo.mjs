import {readdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {WORK_ROUTE_PREFIX} from '../src/lib/work-url.mjs';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');

async function filesUnder(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const output = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(path));
    else output.push(path);
  }
  return output;
}

const files = await filesUnder(dist);
const notFoundHtml = await readFile(resolve(dist, '404.html'), 'utf8');
if (!notFoundHtml.includes('name="robots" content="noindex,follow"') || !notFoundHtml.includes('這個番號不在片單裡')) {
  throw new Error('Static 404 contract missing: dist/404.html must be a noindex guidance page');
}
const htmlFiles = files.filter((path) => path.endsWith('index.html'));
const noindexUrls = new Set();
const titles = new Map();
const descriptions = new Map();

for (const path of htmlFiles) {
  const html = await readFile(path, 'utf8');
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  if (!canonical || !title || !description) throw new Error(`SEO metadata missing in ${path}`);
  if (/name="robots" content="[^"]*noindex/i.test(html)) noindexUrls.add(canonical);
  if (titles.has(title)) throw new Error(`Duplicate page title: ${title}`);
  titles.set(title, canonical);
  if (descriptions.has(description)) throw new Error(`Duplicate meta description: ${description}`);
  descriptions.set(description, canonical);
  const canonicalPathname = new URL(canonical).pathname;
  if (canonicalPathname.startsWith('/reviews/')) throw new Error(`Legacy review canonical remains after work URL migration: ${canonical}`);
  if (canonicalPathname.startsWith(WORK_ROUTE_PREFIX)) {
    for (const required of ['name="rating" content="adult"', 'BreadcrumbList', '"@type":"Article"']) {
      if (!html.includes(required)) throw new Error(`Work SEO contract missing ${required}: ${canonical}`);
    }
  }
}

for (const path of files.filter((item) => /sitemap-\d+\.xml$/.test(item))) {
  let xml = await readFile(path, 'utf8');
  xml = xml.replace(/<url><loc>([^<]+)<\/loc><\/url>/g, (block, url) => noindexUrls.has(url) ? '' : block);
  await writeFile(path, xml);
  for (const url of noindexUrls) {
    if (xml.includes(`<loc>${url}</loc>`)) throw new Error(`Noindex URL remains in sitemap: ${url}`);
  }
}

console.log(`SEO postbuild valid: ${htmlFiles.length} page(s), ${noindexUrls.size} noindex URL(s) removed from sitemap.`);
