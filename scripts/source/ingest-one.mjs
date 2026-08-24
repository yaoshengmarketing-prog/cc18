import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {parseWorkPage, assertCc18Url} from './cc18-parser.mjs';

const target = process.argv[2];
const force = process.argv.includes('--force');
if (!target) throw new Error('Usage: node scripts/source/ingest-one.mjs <cc18-work-url> [--force]');

const url = assertCc18Url(target);
const response = await fetch(url, {
  headers: {'user-agent': 'CC18ReviewBot/0.2 (+https://github.com/yaoshengmarketing-prog/cc18)'},
});
if (!response.ok) throw new Error(`Source returned ${response.status} for ${url.href}`);

const record = parseWorkPage(await response.text(), url.href);
const config = JSON.parse(await readFile(new URL('../../config/pipeline.json', import.meta.url), 'utf8'));
const releaseTime = Date.parse(`${record.release_date}T00:00:00+08:00`);
const ageDays = Math.floor((Date.now() - releaseTime) / 86_400_000);
if (ageDays > config.discovery.lookback_days && !force) {
  throw new Error(`${record.id} is ${ageDays} days old; pass --force to ingest outside the lookback window.`);
}

const directory = new URL('../../data/source-records/', import.meta.url);
const output = new URL(`${record.id}.json`, directory);
await mkdir(directory, {recursive: true});
try {
  await writeFile(output, `${JSON.stringify(record, null, 2)}\n`, {encoding: 'utf8', flag: force ? 'w' : 'wx'});
} catch (error) {
  if (error?.code === 'EEXIST') throw new Error(`${record.id} already ingested; use --force to replace the snapshot.`);
  throw error;
}

console.log(JSON.stringify({id: record.id, release_date: record.release_date, output: output.pathname}, null, 2));
