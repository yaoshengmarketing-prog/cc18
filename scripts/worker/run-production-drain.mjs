import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {appendFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {
  assertProductionEnvironment,
  drainArguments,
  productionDrainOptions,
} from './lib/production-drain.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const stateDirectory = resolve(root, '.cc18-bridge');
const dependencyHashPath = resolve(stateDirectory, 'production-worker-package-lock.sha256');
const runLogPath = resolve(stateDirectory, 'production-drain-runs.jsonl');
const {timeBudgetMinutes} = productionDrainOptions(process.argv.slice(2));
const environment = assertProductionEnvironment(process.env);

const capture = (arguments_, {allowFailure = false} = {}) => {
  const result = spawnSync('git', arguments_, {cwd: root, encoding: 'utf8', windowsHide: true});
  if (!allowFailure && result.status !== 0) {
    throw new Error(result.stderr?.trim() || `git ${arguments_.join(' ')} failed`);
  }
  return {code: result.status ?? 1, stdout: result.stdout?.trim() ?? '', stderr: result.stderr?.trim() ?? ''};
};

const run = (command, arguments_, options = {}) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(command, arguments_, {
    cwd: root,
    env: options.environment ?? environment,
    windowsHide: true,
    stdio: 'inherit',
  });
  child.once('error', rejectRun);
  child.once('close', (code) => resolveRun(code ?? 1));
});

const startedAt = new Date().toISOString();
const report = {
  event: 'local_production_drain_finished',
  started_at: startedAt,
  time_budget_minutes: timeBudgetMinutes,
  base_commit: null,
  dependency_install_ran: false,
  exit_code: 1,
};

try {
  if (capture(['status', '--porcelain', '--untracked-files=no']).stdout) {
    throw new Error('Local production worker requires a clean tracked and staged worktree');
  }
  const origin = capture(['remote', 'get-url', 'origin']).stdout;
  if (!/github\.com[/:]yaoshengmarketing-prog\/cc18(?:\.git)?$/iu.test(origin)) {
    throw new Error(`Unexpected git origin: ${origin}`);
  }
  capture(['fetch', '--quiet', 'origin', 'main']);
  const head = capture(['rev-parse', 'HEAD']).stdout;
  const remoteMain = capture(['rev-parse', 'origin/main']).stdout;
  if (head !== remoteMain) {
    capture(['merge', '--ff-only', 'origin/main']);
  }
  if (capture(['status', '--porcelain', '--untracked-files=no']).stdout) {
    throw new Error('Local production worker became dirty while synchronizing origin/main');
  }
  report.base_commit = capture(['rev-parse', 'HEAD']).stdout;

  await mkdir(stateDirectory, {recursive: true});
  const packageLock = await readFile(resolve(root, 'package-lock.json'));
  const packageLockHash = createHash('sha256').update(packageLock).digest('hex');
  const previousHash = await readFile(dependencyHashPath, 'utf8').catch(() => '');
  if (!existsSync(resolve(root, 'node_modules')) || previousHash.trim() !== packageLockHash) {
    const installExit = await run('npm.cmd', ['ci'], {environment: process.env});
    if (installExit !== 0) throw new Error(`npm ci exited with ${installExit}`);
    await writeFile(dependencyHashPath, `${packageLockHash}\n`, 'utf8');
    report.dependency_install_ran = true;
  }

  capture(['config', 'user.name', 'cc18-publisher[bot]']);
  capture(['config', 'user.email', 'cc18-publisher[bot]@users.noreply.github.com']);
  report.exit_code = await run(process.execPath, drainArguments(timeBudgetMinutes));
} catch (error) {
  report.error = String(error?.message ?? error);
  report.exit_code = 1;
}

report.finished_at = new Date().toISOString();
await mkdir(stateDirectory, {recursive: true});
await appendFile(runLogPath, `${JSON.stringify(report)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (report.exit_code !== 0) process.exitCode = report.exit_code;
