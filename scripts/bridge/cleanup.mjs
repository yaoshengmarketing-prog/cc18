import {loadBridgeConfig} from './lib/config.mjs';
import {cleanupExpiredRuntime} from './lib/media.mjs';

const config = await loadBridgeConfig();
console.log(JSON.stringify({removed_jobs: await cleanupExpiredRuntime(config)}, null, 2));
