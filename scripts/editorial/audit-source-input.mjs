import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {buildSafePublicSource} from './lib/safe-editorial-payload.mjs';
import {createDeterministicSourceBrief} from './lib/local-source-brief.mjs';
import {auditWriterSource} from './lib/source-context.mjs';

const root = resolve(import.meta.dirname, '../..');
const taxonomy = JSON.parse(await readFile(resolve(root, 'data/taxonomy.json'), 'utf8'));
const rows = [];
for (const file of (await readdir(resolve(root, 'data/source-records'))).filter(x => x.endsWith('.json')).sort()) {
  const source = JSON.parse(await readFile(resolve(root, 'data/source-records', file), 'utf8'));
  const publicSource = buildSafePublicSource(source, createDeterministicSourceBrief(source), taxonomy);
  rows.push({movie_id: source.id, ...auditWriterSource({source, publicSource, videoAnalysis: {observations: []}})});
}
const summary = {};
for (const row of rows) summary[row.context_status] = (summary[row.context_status] ?? 0) + 1;
const directory = resolve(root, '.cc18-editorial-responses');
await mkdir(directory, {recursive: true});
const report = resolve(directory, 'source-input-audit.json');
await writeFile(report, JSON.stringify({mode: 'offline_source_only_projection', paid_calls: 0, summary, rows}, null, 2));
console.log(JSON.stringify({records: rows.length, summary, paid_calls: 0, report}, null, 2));
