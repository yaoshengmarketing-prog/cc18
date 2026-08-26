import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadBridgeConfig} from '../bridge/lib/config.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const pipeline = JSON.parse(await readFile(resolve(root, 'config/pipeline.json'), 'utf8'));
const bridge = await loadBridgeConfig(resolve(root, 'config/media-bridge.json'));
const bridgeEnvironment = resolve(root, '.dev.vars.bridge');
if (existsSync(bridgeEnvironment)) process.loadEnvFile(bridgeEnvironment);

const checks = [];
const add = (name, ok, detail) => checks.push({name, status: ok ? 'ready' : 'blocked', detail});
add('d1_credentials', ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN'].every((key) => Boolean(process.env[key])), 'required values are checked by presence only');
add('browser_profile', existsSync(resolve(root, bridge.profile_dir)), bridge.profile_dir);
add('bounded_batch', pipeline.production.batch_size <= 20 && pipeline.production.max_parallel <= 3, `batch=${pipeline.production.batch_size}, parallel=${pipeline.production.max_parallel}`);
add('raw_media_cleanup', bridge.sampling.cleanup_raw_after_analysis === true, `runtime cap=${bridge.sampling.max_runtime_bytes} bytes`);
add('automatic_publish_off', pipeline.publishing.daily_enabled === false, `daily_enabled=${pipeline.publishing.daily_enabled}`);

try {
  const response = await fetch(`${bridge.local_analysis.endpoint}/api/tags`, {signal: AbortSignal.timeout(3000)});
  const body = response.ok ? await response.json() : {};
  const names = (body.models ?? []).map((model) => model.name);
  add('local_vision_model', response.ok && names.some((name) => name.startsWith(bridge.local_analysis.vision_model)), bridge.local_analysis.vision_model);
} catch {
  add('local_vision_model', false, `${bridge.local_analysis.vision_model} at loopback endpoint`);
}

console.log(JSON.stringify({ready: checks.every((check) => check.status === 'ready'), checks}, null, 2));
if (checks.some((check) => check.status === 'blocked')) process.exitCode = 1;
