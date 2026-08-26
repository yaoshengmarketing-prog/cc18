import {readFile} from 'node:fs/promises';
const config = JSON.parse(await readFile(new URL('../config/pipeline.json', import.meta.url), 'utf8'));
const stage = process.argv[2] ?? 'plan';
const stages = ['plan', 'discover', 'produce', 'publish', 'retry-media'];
if (!stages.includes(stage)) throw new Error(`Unknown stage: ${stage}`);
console.log(JSON.stringify({stage, mode: config.production.mode, source: config.source.base_url, daily_enabled: config.publishing.daily_enabled, queue_authority: config.queue.authority, message: stage === 'discover' ? 'Use npm run discovery:run with an explicit queue store.' : 'Production and publishing workers remain disabled while the persistent discovery queue is validated.'}, null, 2));
