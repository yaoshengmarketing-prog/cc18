import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {buildVerticalReviewProps} from './lib/props.mjs';

const movieId = process.argv[2]?.trim().toUpperCase();
if (!movieId || !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId)) throw new Error('Usage: node scripts/video/build-props.mjs MOVIE-ID');
const root = resolve(import.meta.dirname, '..', '..');
const readJson = (path) => readFile(resolve(root, path), 'utf8').then(JSON.parse);
const [source, editorial, search, manifest, taxonomy, pipeline] = await Promise.all([
  readJson(`data/source-records/${movieId}.json`),
  readJson(`data/editorial-briefs/${movieId}.json`),
  readJson(`data/search-content/${movieId}.json`),
  readJson(`data/media-manifests/${movieId}.json`),
  readJson('data/taxonomy.json'),
  readJson('config/pipeline.json'),
]);
const props = buildVerticalReviewProps({movieId, source, editorial, search, manifest, taxonomy, baseUrl: pipeline.publishing.base_url});
const output = resolve(root, 'video', 'examples', `${movieId.toLowerCase()}.json`);
await mkdir(resolve(root, 'video', 'examples'), {recursive: true});
await writeFile(output, `${JSON.stringify(props, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({movie_id: movieId, output, tags: props.tags}, null, 2));
