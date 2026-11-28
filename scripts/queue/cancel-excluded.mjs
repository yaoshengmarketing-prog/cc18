import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {excludedIds} from '../../src/lib/exclusions.mjs';

const root = resolve(import.meta.dirname, '../..');
const cli = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const ids = [...excludedIds()].sort();
const quoted = ids.map((id) => `'${id}'`).join(',');
const select = `SELECT id, movie_id, stage, status FROM pipeline_jobs WHERE movie_id IN (${quoted}) AND status!='cancelled' ORDER BY movie_id, stage`;
const update = `UPDATE pipeline_jobs SET status='cancelled' WHERE movie_id IN (${quoted}) AND status!='cancelled'`;
const execute = (sql) => {
  const result = spawnSync(process.execPath, [cli, 'd1', 'execute', 'cc18-db', '--remote', '--config', 'wrangler.jsonc', '--json', '--command', sql], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `Wrangler exited ${result.status}`);
  return JSON.parse(result.stdout);
};

const dryRun = execute(select);
const rows = dryRun[0]?.results ?? dryRun.result?.[0]?.results ?? [];
console.log(JSON.stringify({event: 'excluded_jobs_dry_run', ids: ids.length, rows}, null, 2));
if (process.argv.includes('--apply') && rows.length) {
  const result = execute(update);
  console.log(JSON.stringify({event: 'excluded_jobs_cancelled', changed: result[0]?.meta?.changes ?? result.result?.[0]?.meta?.changes ?? null}));
}
