import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {D1RestQueueStore} from '../../queue/store.mjs';

const quote = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') throw new Error('Unsupported D1 parameter type');
  if (value.includes('\0')) throw new Error('D1 parameter contains NUL');
  return `'${value.replaceAll("'", "''")}'`;
};

export function bindSql(sql, params = []) {
  let index = 0;
  const bound = sql.replace(/'(?:''|[^'])*'|"(?:[^"]|"")*"|\?/gu, (token) => {
    if (token !== '?') return token;
    if (index >= params.length) throw new Error('D1 parameter count mismatch');
    return quote(params[index++]);
  });
  if (index !== params.length) throw new Error('D1 parameter count mismatch');
  return bound;
}

export class WranglerQueueStore extends D1RestQueueStore {
  constructor({root, database = 'cc18-db', spawnImpl = spawn} = {}) {
    super({accountId: 'local-wrangler', databaseId: 'local-wrangler', apiToken: 'not-used'});
    this.root = resolve(root);
    this.database = database;
    this.spawnImpl = spawnImpl;
  }

  async query(statements) {
    if (Array.isArray(statements) && statements.length !== 1) {
      throw new Error('Local Editorial D1 access accepts one statement at a time');
    }
    const statement = Array.isArray(statements) ? statements[0] : statements;
    const sql = bindSql(statement.sql, statement.params);
    const cli = resolve(this.root, 'node_modules/wrangler/bin/wrangler.js');
    const args = [cli, 'd1', 'execute', this.database, '--remote', '--json', '--command', sql];
    const runCli = () => new Promise((resolveRun, rejectRun) => {
      const child = this.spawnImpl(process.execPath, args, {
        cwd: this.root, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.once('error', rejectRun);
      child.once('close', (code) => code === 0
        ? resolveRun(stdout)
        : rejectRun(new Error(`Wrangler D1 exited with ${code}: ${(stderr || stdout).slice(-500)}`)));
    });
    let output;
    try {
      output = await runCli();
    } catch (error) {
      // A candidate SELECT is safe to retry after a transient Wrangler/transport exit.
      // Never replay claims or other writes, whose outcome could be unknown.
      if (!/^\s*SELECT\b/iu.test(sql)) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
      output = await runCli();
    }
    let results;
    try { results = JSON.parse(output); } catch { throw new Error('Wrangler D1 returned invalid JSON'); }
    if (!Array.isArray(results) || results.some((item) => item.success !== true)) {
      throw new Error('Wrangler D1 statement failed');
    }
    return results;
  }
}
