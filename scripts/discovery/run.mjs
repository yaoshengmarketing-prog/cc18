import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {discoverBatch} from './discover.mjs';
import {queueStoreFromEnvironment} from '../queue/store.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const config = JSON.parse(await readFile(resolve(root, 'config/pipeline.json'), 'utf8'));
const valueOf = (name, fallback) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const mode = valueOf('store', 'file');
const filePath = resolve(root, valueOf('file', config.queue.local_snapshot));
const store = queueStoreFromEnvironment({mode, filePath});
const result = await discoverBatch({listingUrls: config.discovery.listing_urls, store, config: {...config.discovery, user_agent: config.source.user_agent}});
console.log(JSON.stringify({...result, queue: await store.summary()}, null, 2));
