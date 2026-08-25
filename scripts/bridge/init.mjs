import {mkdir} from 'node:fs/promises';
import {loadBridgeConfig} from './lib/config.mjs';
import {loadQueue, saveQueue} from './lib/queue.mjs';

const config = await loadBridgeConfig();
await Promise.all([mkdir(config.runtime_dir, {recursive: true}), mkdir(config.profile_dir, {recursive: true})]);
await saveQueue(config.queue_file, await loadQueue(config.queue_file));
console.log(JSON.stringify({status: 'initialized', profile_dir: config.profile_dir, runtime_dir: config.runtime_dir}, null, 2));
