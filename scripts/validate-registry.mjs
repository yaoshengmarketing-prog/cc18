import {readFile} from 'node:fs/promises';

const file = new URL('../data/movie-registry.json', import.meta.url);
const registry = JSON.parse(await readFile(file, 'utf8'));
const ids = new Set();

for (const record of registry.records ?? []) {
  for (const key of ['id', 'release_date', 'source_url', 'review_status', 'image_status', 'video_status']) {
    if (!record[key]) throw new Error(`Registry record is missing ${key}`);
  }
  if (ids.has(record.id)) throw new Error(`Duplicate registry id: ${record.id}`);
  ids.add(record.id);
  const source = new URL(record.source_url);
  if (!['cc18.tv', 'www.cc18.tv'].includes(source.hostname)) {
    throw new Error(`Unexpected source domain for ${record.id}: ${source.hostname}`);
  }
}

console.log(`Registry valid: ${ids.size} unique record(s).`);
