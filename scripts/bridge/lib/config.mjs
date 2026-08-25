import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export async function loadBridgeConfig(configPath = 'config/media-bridge.json') {
  const absoluteConfigPath = resolve(configPath);
  const config = JSON.parse(await readFile(absoluteConfigPath, 'utf8'));
  const root = resolve(absoluteConfigPath, '..', '..');
  return {
    ...config,
    root,
    runtime_dir: resolve(root, config.runtime_dir),
    profile_dir: resolve(root, config.profile_dir),
    queue_file: resolve(root, config.queue_file),
  };
}

export function assertAllowedUrl(value, hosts, {requireHttps = true} = {}) {
  const url = new URL(value);
  if (requireHttps && url.protocol !== 'https:') throw new Error(`HTTPS required for ${url.hostname}`);
  if (!hosts.includes(url.hostname)) throw new Error(`Host is not allowlisted: ${url.hostname}`);
  return url;
}
