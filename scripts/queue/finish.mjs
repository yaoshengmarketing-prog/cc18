import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {queueStoreFromEnvironment} from './store.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const config = JSON.parse(await readFile(resolve(root, 'config/pipeline.json'), 'utf8'));
const valueOf = (name, fallback) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const jobId = valueOf('job');
const workerId = valueOf('worker');
const outcome = valueOf('outcome');
if (!jobId || !workerId || !outcome) throw new Error('Usage: queue:finish -- --job=<id> --worker=<id> --outcome=completed|retry|failed');
const mode = valueOf('store', 'file');
const retryMinutes = Number(valueOf('retry-minutes', '30'));
const retryAt = outcome === 'retry' ? new Date(Date.now() + retryMinutes * 60_000).toISOString() : null;
const store = queueStoreFromEnvironment({mode, filePath: resolve(root, valueOf('file', config.queue.local_snapshot))});
console.log(JSON.stringify(await store.finishJob({jobId, workerId, outcome, errorCode: valueOf('error', null), retryAt}), null, 2));
