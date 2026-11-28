import {readdir, readFile, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {excludedIds} from '../src/lib/exclusions.mjs';

const root = resolve(import.meta.dirname, '..');
const ids = excludedIds();
const walk = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.(?:html|xml|json)$/u.test(entry.name)) files.push(path);
  }
  return files;
};

export async function validateExcludedDist(directory = resolve(root, 'dist')) {
  if (!(await stat(directory).catch(() => null))?.isDirectory()) throw new Error('dist is missing');
  const violations = [];
  for (const file of await walk(directory)) {
    const relative = file.slice(directory.length + 1).replaceAll('\\', '/');
    const text = await readFile(file, 'utf8');
    if (/^works\/[^/]+\/index\.html$/u.test(relative) && ids.has(relative.split('/')[1].toUpperCase())) violations.push(relative);
    for (const match of text.matchAll(/(?:href=["']|<loc>)(?:https?:\/\/[^/]+)?\/works\/([a-z0-9]+(?:-[a-z0-9]+)+)\/?/giu)) {
      if (ids.has(match[1].toUpperCase())) violations.push(`${relative}: link ${match[1]}`);
    }
    if (relative === 'search-index.json') {
      const search = JSON.parse(text);
      for (const movie of search.movies ?? []) if (ids.has(movie.card?.catalog_code?.toUpperCase())) violations.push(`${relative}: ${movie.card.catalog_code}`);
    }
  }
  if (violations.length) throw new Error(`Excluded works leaked into dist: ${violations.slice(0, 20).join(', ')}`);
  return {excluded: ids.size};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await validateExcludedDist()));
}
