import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cli = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url));
const result = spawnSync(process.execPath, [cli, 'check'], {
  stdio: 'inherit',
  env: {...process.env, ASTRO_TELEMETRY_DISABLED: '1'},
});
process.exit(result.status ?? 1);
