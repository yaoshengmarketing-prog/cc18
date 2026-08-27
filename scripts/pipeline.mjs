import {readFile} from 'node:fs/promises';
const config = JSON.parse(await readFile(new URL('../config/pipeline.json', import.meta.url), 'utf8'));
const stage = process.argv[2] ?? 'plan';
const stages = ['plan', 'discover', 'produce', 'publish', 'retry-media'];
if (!stages.includes(stage)) throw new Error(`Unknown stage: ${stage}`);
const message = stage === 'discover'
  ? 'Use npm run discovery:run with an explicit queue store.'
  : stage === 'publish'
    ? 'Use npm run publish:d1:process-one with an exact movie ID; the workflow verifies the live release before completing D1.'
    : 'Production workers remain manual while the persistent queue is validated.';
console.log(JSON.stringify({stage, mode: config.production.mode, source: config.source.base_url, daily_enabled: config.publishing.daily_enabled, queue_authority: config.queue.authority, message}, null, 2));
