import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cli = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url));
const env = {...process.env, ASTRO_TELEMETRY_DISABLED: '1'};

for (const command of ['check', 'build']) {
  const result = spawnSync(process.execPath, [cli, command], {stdio: 'inherit', env});
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const seo = spawnSync(process.execPath, [fileURLToPath(new URL('./postbuild-seo.mjs', import.meta.url))], {stdio: 'inherit', env});
if (seo.status !== 0) process.exit(seo.status ?? 1);
