import {spawnSync} from 'node:child_process';
import {copyFile, lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, isAbsolute, join, relative, resolve} from 'node:path';

const MOVIE_ID = /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/u;
const normalizePath = (value) => value.replaceAll('\\', '/');

const assertMovieId = (movieId) => {
  const value = String(movieId ?? '');
  if (!MOVIE_ID.test(value)) throw new Error(`Invalid movie ID: ${value}`);
  return value;
};

const gitResult = ({root, args}) => spawnSync('git', args, {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
});

const git = ({root, args}) => {
  const result = gitResult({root, args});
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
};

const exists = async (path) => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
};

const assertTemporaryParent = (parent) => {
  const base = resolve(tmpdir());
  const target = resolve(parent);
  const rel = relative(base, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Unsafe canary temporary directory: ${target}`);
};

export const assertSingleWorkRequest = ({max, requestedIds}) => {
  if (max !== 1) throw new Error('Production canary requires --max=1');
  if (requestedIds.length > 1) throw new Error('Production canary accepts at most one movie ID');
};

export async function protectedIsolatedUntrackedPaths({workspaceRoot, paths, managedNodeModulesLink = false}) {
  const normalized = paths.map(normalizePath);
  if (!managedNodeModulesLink || !normalized.includes('node_modules')) return normalized;
  const dependencyPath = resolve(workspaceRoot, 'node_modules');
  const [linkDetails, targetDetails] = await Promise.all([lstat(dependencyPath), stat(dependencyPath)]);
  if (!linkDetails.isSymbolicLink() || !targetDetails.isDirectory()) {
    throw new Error('Isolated canary node_modules is not the runner-managed directory link');
  }
  return normalized.filter((path) => path !== 'node_modules');
}

export const checkpointRef = (movieId) => `refs/notes/cc18-checkpoints/${assertMovieId(movieId).toLowerCase()}`;

export function deleteWorkCheckpoint({repositoryRoot, movieId, remote = 'origin'}) {
  const ref = checkpointRef(movieId);
  const remoteSha = remoteCheckpoint({repositoryRoot, remote, ref});
  if (!remoteSha) return {deleted: false, ref};
  git({
    root: repositoryRoot,
    args: ['push', `--force-with-lease=${ref}:${remoteSha}`, remote, `:${ref}`],
  });
  return {deleted: true, ref, commit: remoteSha};
}

export const checkpointArtifactPaths = (movieId) => {
  const id = assertMovieId(movieId);
  const slug = id.toLowerCase();
  return [
    `content/reviews/${id}.md`,
    `data/editorial-briefs/${id}.json`,
    `data/editorial-usage/${id}.json`,
    `data/image-briefs/${id}.json`,
    `data/media-manifests/${id}.json`,
    `data/review-quality/${id}-automated.json`,
    `data/review-quality/${id}.json`,
    `data/search-content/${id}.json`,
    `data/source-records/${id}.json`,
    `video/examples/${slug}.json`,
    'data/movie-registry.json',
    'data/tag-candidates.json',
  ];
};

const sharedCheckpointPaths = new Set(['data/movie-registry.json', 'data/tag-candidates.json']);

const parseJson = (text, label) => {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid checkpoint JSON: ${label}`);
  }
};

const checkpointJson = ({repositoryRoot, remoteRef, path}) => parseJson(
  git({root: repositoryRoot, args: ['show', `${remoteRef}:${path}`]}),
  `${remoteRef}:${path}`,
);

async function mergeRegistryCheckpoint({repositoryRoot, workspaceRoot, remoteRef, movieId}) {
  const path = 'data/movie-registry.json';
  const checkpoint = checkpointJson({repositoryRoot, remoteRef, path});
  const currentPath = resolve(workspaceRoot, path);
  const current = parseJson(await readFile(currentPath, 'utf8'), path);
  const matches = checkpoint.records?.filter(({id}) => id === movieId) ?? [];
  if (matches.length !== 1) throw new Error(`${movieId}: checkpoint Registry must contain exactly one matching record`);
  const index = current.records?.findIndex(({id}) => id === movieId) ?? -1;
  if (index >= 0 && current.records[index].review_status !== 'draft') {
    throw new Error(`${movieId}: current Registry record is already published`);
  }
  if (index >= 0) current.records[index] = matches[0];
  else current.records.push(matches[0]);
  current.updated_at = [current.updated_at, checkpoint.updated_at].filter(Boolean).sort().at(-1) ?? null;
  await writeFile(currentPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
}

async function mergeTagCandidateCheckpoint({repositoryRoot, workspaceRoot, remoteRef, movieId}) {
  const path = 'data/tag-candidates.json';
  const checkpoint = checkpointJson({repositoryRoot, remoteRef, path});
  const currentPath = resolve(workspaceRoot, path);
  const current = parseJson(await readFile(currentPath, 'utf8'), path);
  for (const candidate of checkpoint.candidates?.filter(({source_ids: ids}) => ids?.includes(movieId)) ?? []) {
    const existing = current.candidates.find(({label}) => label.normalize('NFKC').trim() === candidate.label.normalize('NFKC').trim());
    if (!existing) {
      current.candidates.push({...candidate, source_ids: [movieId], occurrences: 1});
      continue;
    }
    existing.source_ids = [...new Set([...(existing.source_ids ?? []), movieId])];
    existing.occurrences = existing.source_ids.length;
    existing.first_seen = [existing.first_seen, candidate.first_seen].filter(Boolean).sort().at(0) ?? null;
    existing.last_seen = [existing.last_seen, candidate.last_seen].filter(Boolean).sort().at(-1) ?? null;
  }
  await writeFile(currentPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
}

export async function createCleanWorktree({repositoryRoot, baseRef = 'origin/main', linkNodeModules = true}) {
  const parent = await mkdtemp(join(tmpdir(), 'cc18-one-work-'));
  assertTemporaryParent(parent);
  const workspaceRoot = join(parent, 'repo');
  try {
    const baseCommit = git({root: repositoryRoot, args: ['rev-parse', baseRef]});
    git({root: repositoryRoot, args: ['worktree', 'add', '--detach', workspaceRoot, baseCommit]});
    if (linkNodeModules) {
      const source = resolve(repositoryRoot, 'node_modules');
      if (!await exists(source)) throw new Error('node_modules is required before creating an isolated canary workspace');
      await symlink(source, resolve(workspaceRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    }
    if (git({root: workspaceRoot, args: ['status', '--porcelain', '--untracked-files=no']})) {
      throw new Error('Isolated canary worktree is not clean');
    }
    return {parent, workspaceRoot, baseCommit, nodeModulesLinked: linkNodeModules};
  } catch (error) {
    try { git({root: repositoryRoot, args: ['worktree', 'remove', '--force', workspaceRoot]}); } catch {}
    await rm(parent, {recursive: true, force: true});
    throw error;
  }
}

export async function removeCleanWorktree({repositoryRoot, parent, workspaceRoot}) {
  assertTemporaryParent(parent);
  const rel = relative(resolve(parent), resolve(workspaceRoot));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Unsafe canary worktree path: ${workspaceRoot}`);
  try {
    git({root: repositoryRoot, args: ['worktree', 'remove', '--force', workspaceRoot]});
  } finally {
    await rm(parent, {recursive: true, force: true});
  }
}

const remoteCheckpoint = ({repositoryRoot, remote, ref}) => {
  const result = gitResult({root: repositoryRoot, args: ['ls-remote', '--exit-code', remote, ref]});
  if (result.status === 2) return null;
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `Could not inspect ${remote}/${ref}`);
  const sha = result.stdout.trim().split(/\s+/u)[0];
  if (!/^[a-f0-9]{40}$/u.test(sha)) throw new Error(`Invalid checkpoint ref for ${ref}`);
  return sha;
};

export async function restoreWorkCheckpoint({repositoryRoot, workspaceRoot, movieId, remote = 'origin'}) {
  const ref = checkpointRef(movieId);
  const remoteSha = remoteCheckpoint({repositoryRoot, remote, ref});
  if (!remoteSha) return {restored: false, ref, paths: []};
  const remoteRef = `refs/cc18-checkpoints/${assertMovieId(movieId).toLowerCase()}`;
  git({root: repositoryRoot, args: ['fetch', remote, `${ref}:${remoteRef}`]});
  const currentRegistry = parseJson(await readFile(resolve(workspaceRoot, 'data/movie-registry.json'), 'utf8'), 'data/movie-registry.json');
  const currentRecord = currentRegistry.records?.find(({id}) => id === movieId);
  if (currentRecord && currentRecord.review_status !== 'draft') {
    return {restored: false, ref, paths: [], commit: remoteSha, reason: 'published_on_base'};
  }
  const parents = git({root: repositoryRoot, args: ['rev-list', '--parents', '-n', '1', remoteRef]}).split(/\s+/u);
  if (parents.length !== 2) throw new Error(`${ref}: checkpoint must have exactly one parent`);
  const checkpointBase = parents[1];
  const ancestor = gitResult({root: workspaceRoot, args: ['merge-base', '--is-ancestor', checkpointBase, 'HEAD']});
  if (ancestor.status !== 0) throw new Error(`${ref}: checkpoint base is not an ancestor of current main`);
  const allowed = new Set(checkpointArtifactPaths(movieId));
  const changed = git({root: repositoryRoot, args: ['diff-tree', '--no-commit-id', '--name-only', '-r', remoteRef]})
    .split(/\r?\n/u).filter(Boolean).map(normalizePath);
  const unexpected = changed.filter((path) => !allowed.has(path));
  if (unexpected.length) throw new Error(`${ref}: checkpoint contains unrelated paths: ${unexpected.join(', ')}`);
  if (!changed.length) throw new Error(`${ref}: checkpoint contains no work artifacts`);
  const perWorkPaths = changed.filter((path) => !sharedCheckpointPaths.has(path));
  const changedOnMain = new Set(git({root: workspaceRoot, args: ['diff', '--name-only', `${checkpointBase}..HEAD`, '--', ...perWorkPaths]})
    .split(/\r?\n/u).filter(Boolean).map(normalizePath));
  const conflicts = perWorkPaths.filter((path) => changedOnMain.has(path));
  if (conflicts.length) throw new Error(`${ref}: current main changed checkpoint artifact(s): ${conflicts.join(', ')}`);
  const presentPaths = perWorkPaths.filter((path) => gitResult({root: repositoryRoot, args: ['cat-file', '-e', `${remoteRef}:${path}`]}).status === 0);
  const deletedPaths = perWorkPaths.filter((path) => !presentPaths.includes(path));
  if (presentPaths.length) {
    git({root: workspaceRoot, args: ['checkout', remoteRef, '--', ...presentPaths]});
    git({root: workspaceRoot, args: ['restore', '--staged', '--', ...presentPaths]});
  }
  for (const path of deletedPaths) await rm(resolve(workspaceRoot, path), {force: true});
  if (changed.includes('data/movie-registry.json')) {
    await mergeRegistryCheckpoint({repositoryRoot, workspaceRoot, remoteRef, movieId});
  }
  if (changed.includes('data/tag-candidates.json')) {
    await mergeTagCandidateCheckpoint({repositoryRoot, workspaceRoot, remoteRef, movieId});
  }
  return {restored: true, ref, paths: changed, commit: remoteSha};
}

export async function saveWorkCheckpoint({repositoryRoot, workspaceRoot, baseRef = 'origin/main', movieId, remote = 'origin'}) {
  const ref = checkpointRef(movieId);
  const allowed = checkpointArtifactPaths(movieId);
  const oldSha = remoteCheckpoint({repositoryRoot, remote, ref});
  const checkpoint = await createCleanWorktree({repositoryRoot, baseRef, linkNodeModules: false});
  try {
    const touched = [];
    for (const path of allowed) {
      const source = resolve(workspaceRoot, path);
      const target = resolve(checkpoint.workspaceRoot, path);
      if (await exists(source)) {
        await mkdir(dirname(target), {recursive: true});
        await copyFile(source, target);
        touched.push(path);
      } else if (await exists(target)) {
        await rm(target, {force: true});
        touched.push(path);
      }
    }
    if (!touched.length) return {saved: false, ref, paths: []};
    git({root: checkpoint.workspaceRoot, args: ['add', '--', ...touched]});
    const staged = git({root: checkpoint.workspaceRoot, args: ['diff', '--cached', '--name-only']})
      .split(/\r?\n/u).filter(Boolean).map(normalizePath);
    const unexpected = staged.filter((path) => !allowed.includes(path));
    if (unexpected.length) throw new Error(`${movieId}: checkpoint staged unrelated paths: ${unexpected.join(', ')}`);
    if (!staged.length) return {saved: false, ref, paths: []};
    git({root: checkpoint.workspaceRoot, args: [
      '-c', 'user.name=cc18-checkpoint[bot]',
      '-c', 'user.email=cc18-checkpoint[bot]@users.noreply.github.com',
      'commit', '-m', `checkpoint: preserve ${movieId} pipeline artifacts`,
    ]});
    const lease = oldSha ? [`--force-with-lease=${ref}:${oldSha}`] : [];
    git({root: checkpoint.workspaceRoot, args: ['push', ...lease, remote, `HEAD:${ref}`]});
    return {saved: true, ref, paths: staged, commit: git({root: checkpoint.workspaceRoot, args: ['rev-parse', 'HEAD']})};
  } finally {
    await removeCleanWorktree({repositoryRoot, ...checkpoint});
  }
}
