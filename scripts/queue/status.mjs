import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {queueStoreFromEnvironment} from './store.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const config = JSON.parse(await readFile(resolve(root, 'config/pipeline.json'), 'utf8'));
const valueOf = (name, fallback) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const mode = valueOf('store', 'file');
const store = queueStoreFromEnvironment({mode, filePath: resolve(root, valueOf('file', config.queue.local_snapshot))});
console.log(JSON.stringify(await store.summary(), null, 2));
