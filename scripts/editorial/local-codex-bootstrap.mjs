import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFile, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, relative, resolve} from 'node:path';

const repositoryRoot = resolve(process.argv[2] ?? process.cwd());
const preflightOnly = process.argv.includes('--preflight');
const prepareDepsOnly = process.argv.includes('--prepare-deps');
const systemTemp = process.platform === 'win32' && process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'Temp') : tmpdir();
const git = (args) => {
  const result = spawnSync('git', args, {cwd: repositoryRoot, encoding: 'utf8', windowsHide: true});
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
};
git(['fetch', '--quiet', 'origin', 'main']);
const main = git(['rev-parse', 'origin/main']);
const parent = await mkdtemp(join(systemTemp, 'cc18-local-editorial-bootstrap-'));
const worktree = join(parent, 'repo');
let added = false;
try {
  git(['worktree', 'add', '--detach', worktree, main]);
  added = true;
  const lockBytes = await readFile(join(worktree, 'package-lock.json'));
  const lockHash = createHash('sha256').update(lockBytes).digest('hex');
  const lock = JSON.parse(lockBytes.toString('utf8'));
  const dependencyRoot = join(systemTemp, 'cc18-local-editorial-deps', lockHash);
  const expected = Object.fromEntries(['typescript', 'astro', 'wrangler'].map((name) =>
    [name, lock.packages?.[`node_modules/${name}`]?.version]));
  const cacheReady = async () => {
    let owner;
    try { owner = JSON.parse(await readFile(join(dependencyRoot, '.cc18-owner.json'), 'utf8')); }
    catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
    if (owner.lock_sha256 !== lockHash) throw new Error('Editorial dependency cache ownership mismatch');
    for (const [name, version] of Object.entries(expected)) {
      const installed = JSON.parse(await readFile(join(dependencyRoot, 'node_modules', name, 'package.json'), 'utf8'));
      if (!version || installed.version !== version) throw new Error(`Editorial dependency cache ${name} differs from package-lock`);
    }
    return true;
  };
  if (!await cacheReady()) {
    if (preflightOnly) {
      console.log(JSON.stringify({event: 'local_codex_bootstrap_preflight', main_sha: main,
        worktree_clean: !git(['-C', worktree, 'status', '--porcelain', '--untracked-files=no']),
        dependencies_ready: false, lock_sha256: lockHash}));
      process.exitCode = 2;
    } else {
      const installParent = await mkdtemp(join(systemTemp, 'cc18-local-editorial-deps-build-'));
      const installRoot = join(installParent, 'cache');
      try {
        await mkdir(installRoot);
        await copyFile(join(worktree, 'package.json'), join(installRoot, 'package.json'));
        await copyFile(join(worktree, 'package-lock.json'), join(installRoot, 'package-lock.json'));
        const pnpm = resolve(dirname(process.execPath), '..', 'node_modules/pnpm/bin/pnpm.mjs');
        const code = await new Promise((resolveRun, rejectRun) => {
          const child = spawn(process.execPath,
            [pnpm, 'dlx', 'npm@11.6.2', 'ci', '--prefix', installRoot, '--no-audit', '--no-fund'],
            {cwd: installRoot, env: process.env, windowsHide: true, stdio: 'inherit'});
          child.once('error', rejectRun);
          child.once('close', resolveRun);
        });
        if (code !== 0) throw new Error(`Editorial dependency install exited with ${code}`);
        await mkdir(dirname(dependencyRoot), {recursive: true});
        await writeFile(join(installRoot, '.cc18-owner.json'), `${JSON.stringify({lock_sha256: lockHash})}\n`);
        try { await rename(installRoot, dependencyRoot); }
        catch (error) { if (error?.code !== 'EEXIST' || !await cacheReady()) throw error; }
      } finally {
        const rel = relative(systemTemp, installParent);
        if (!rel || rel.startsWith('..')) throw new Error('Unsafe dependency install cleanup path');
        await rm(installParent, {recursive: true, force: true});
      }
    }
  }
  if (process.exitCode !== 2 && !await cacheReady()) throw new Error('Editorial dependency cache is not ready');
  if (process.exitCode !== 2) await symlink(resolve(dependencyRoot, 'node_modules'), resolve(worktree, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir');
  if ((preflightOnly || prepareDepsOnly) && process.exitCode !== 2) {
    console.log(JSON.stringify({event: 'local_codex_bootstrap_preflight', main_sha: main,
      worktree_clean: !git(['-C', worktree, 'status', '--porcelain', '--untracked-files=no']),
      dependencies_ready: true, lock_sha256: lockHash, versions: expected}));
  } else if (process.exitCode !== 2) {
    const code = await new Promise((resolveRun, rejectRun) => {
      const child = spawn(process.execPath, [resolve(worktree, 'scripts/editorial/local-codex-run.mjs'), ...process.argv.slice(3)], {
        cwd: worktree, env: process.env, windowsHide: true, stdio: 'inherit',
      });
      child.once('error', rejectRun);
      child.once('close', resolveRun);
    });
    process.exitCode = code ?? 1;
  }
} finally {
  if (added) git(['worktree', 'remove', '--force', worktree]);
  const rel = relative(systemTemp, parent);
  if (!rel || rel.startsWith('..')) throw new Error('Unsafe bootstrap cleanup path');
  await rm(parent, {recursive: true, force: true});
}
