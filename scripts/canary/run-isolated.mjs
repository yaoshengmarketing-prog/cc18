import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {queueStoreFromEnvironment} from '../queue/store.mjs';
import {alreadyPublishedRequestedIds, isCompletedPublishedWork} from './selection.mjs';
import {
  assertSingleWorkRequest,
  createRestoredCheckpointAuthorization,
  createCleanWorktree,
  deleteWorkCheckpoint,
  removeCleanWorktree,
  restoreWorkCheckpoint,
  saveWorkCheckpoint,
} from './isolation.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const option = (name) => process.argv.slice(2).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const max = Number(option('--max') ?? 1);
const requestedIds = (option('--ids') ?? '').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
const excludedIds = (option('--exclude') ?? '').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
if (requestedIds.some((id) => !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(id))) throw new Error('--ids contains an invalid movie id');
if (excludedIds.some((id) => !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(id))) throw new Error('--exclude contains an invalid movie id');
assertSingleWorkRequest({max, requestedIds});

export const CANARY_RESULT_PREFIX = 'CC18_CANARY_RESULT=';
const emitResult = (report) => {
  console.log(JSON.stringify(report, null, 2));
  console.log(`${CANARY_RESULT_PREFIX}${JSON.stringify(report)}`);
};

const git = (args, {allowFailure = false} = {}) => {
  const result = spawnSync('git', args, {cwd: root, encoding: 'utf8', windowsHide: true});
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr?.trim() || `git ${args.join(' ')} failed`);
  return result;
};
if (git(['status', '--porcelain', '--untracked-files=no']).stdout.trim()) {
  throw new Error('Canary refuses tracked or staged changes before isolated execution');
}
const protectedPaths = git(['ls-files', '--others', '--exclude-standard']).stdout.trim().split(/\r?\n/u).filter(Boolean);
const fingerprint = async (path) => {
  const absolute = resolve(root, path);
  const [bytes, details] = await Promise.all([readFile(absolute), stat(absolute)]);
  return {sha256: createHash('sha256').update(bytes).digest('hex'), bytes: details.size, mtime_ms: details.mtimeMs};
};
const before = new Map(await Promise.all(protectedPaths.map(async (path) => [path, await fingerprint(path)])));
const assertProtected = async () => {
  const afterPaths = git(['ls-files', '--others', '--exclude-standard']).stdout.trim().split(/\r?\n/u).filter(Boolean);
  if (JSON.stringify(afterPaths) !== JSON.stringify(protectedPaths)) {
    throw new Error('Canary changed the protected untracked path set');
  }
  for (const [path, expected] of before) {
    let actual;
    try { actual = await fingerprint(path); } catch { throw new Error(`Canary protected untracked file disappeared: ${path}`); }
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Canary protected untracked file changed: ${path}`);
  }
};

git(['fetch', '--quiet', 'origin', 'main']);
const baseCommit = git(['rev-parse', 'origin/main']).stdout.trim();
const registry = JSON.parse(git(['show', 'origin/main:data/movie-registry.json']).stdout);
const pipeline = JSON.parse(git(['show', 'origin/main:config/pipeline.json']).stdout);
const requireCompletedEditorial = pipeline.production?.editorial_executor === 'local_codex';
const store = queueStoreFromEnvironment({mode: 'd1'});
const resumablePublishedIds = new Set();
const completedPublishedIds = new Set();
for (const {id, review_status: status} of registry.records) {
  if (status === 'draft') continue;
  const [editorial, publish] = await Promise.all([
    store.findJob({movieId: id, stage: 'editorial'}),
    store.findJob({movieId: id, stage: 'publish'}),
  ]);
  if (editorial?.status === 'completed' && publish && publish.status !== 'completed') {
    resumablePublishedIds.add(id.toUpperCase());
  }
  if (isCompletedPublishedWork({registryRecord: {review_status: status}, editorialJob: editorial, publishJob: publish})) {
    completedPublishedIds.add(id.toUpperCase());
  }
}
const alreadyCompleted = requestedIds.filter((id) => completedPublishedIds.has(id));
if (alreadyCompleted.length) {
  await assertProtected();
  emitResult({event: 'isolated_canary_already_published', base_commit: baseCommit,
    movie_id: alreadyCompleted[0], maximum_works: 1});
  process.exit(0);
}
const refusedPublished = alreadyPublishedRequestedIds(registry, requestedIds)
  .filter((id) => !resumablePublishedIds.has(id));
if (refusedPublished.length) throw new Error(`Canary refuses already-published Registry records: ${refusedPublished.join(', ')}`);
const excludedPublishedIds = registry.records
  .filter(({review_status: status, id}) => status !== 'draft' && !resumablePublishedIds.has(id.toUpperCase()))
  .map(({id}) => id.toUpperCase());
const candidates = requestedIds.length
  ? requestedIds
  : (await store.listCanaryCandidates({
      limit: 1,
      excludeMovieIds: [...new Set([...excludedPublishedIds, ...excludedIds])],
      requireCompletedEditorial,
    })).map(({movie_id}) => movie_id);
const movieId = candidates[0] ?? null;
if (!movieId) {
  await assertProtected();
  emitResult({event: 'isolated_canary_queue_empty', base_commit: baseCommit, maximum_works: 1});
  process.exit(0);
}

const isolated = await createCleanWorktree({repositoryRoot: root, baseRef: 'origin/main'});
let result = {code: 1};
let restored = null;
let restoredAuthorization = null;
let checkpoint = null;
let deletedCheckpoint = null;
let workError = null;
const recordWorkError = (phase, error) => {
  workError ??= {phase, message: String(error?.message ?? error)};
  result = {code: 1, error: workError.message};
};
try {
  try {
    restored = await restoreWorkCheckpoint({repositoryRoot: root, workspaceRoot: isolated.workspaceRoot, movieId});
    if (restored.restored) {
      restoredAuthorization = await createRestoredCheckpointAuthorization({
        workspaceRoot: isolated.workspaceRoot,
        movieId,
        restoredPaths: restored.paths,
      });
    }
  } catch (error) {
    recordWorkError('checkpoint_restore', error);
  }
  if (!workError) {
    result = await new Promise((resolveRun) => {
      const child = spawn(process.execPath, [resolve(isolated.workspaceRoot, 'scripts/canary/run.mjs'), '--max=1', `--ids=${movieId}`], {
        cwd: isolated.workspaceRoot,
        env: {
          ...process.env,
          CC18_EDITORIAL_RESPONSE_DIR: resolve(root, '.cc18-editorial-responses'),
          CC18_CANARY_ISOLATED_WORKSPACE: 'YES',
          CC18_CANARY_MANAGED_NODE_MODULES_LINK: isolated.nodeModulesLinked ? 'YES' : 'NO',
          ...(restoredAuthorization ? {CC18_CANARY_RESTORED_CHECKPOINT: JSON.stringify(restoredAuthorization)} : {}),
        },
        windowsHide: true,
        stdio: 'inherit',
      });
      child.once('error', (error) => resolveRun({code: 1, error: error.message}));
      child.once('close', (code) => resolveRun({code: code ?? 1}));
    });
    if (result.code !== 0) {
      const editorial = await store.findJob({movieId, stage: 'editorial'});
      if (editorial?.status === 'completed') {
        try {
          checkpoint = await saveWorkCheckpoint({
            repositoryRoot: root,
            workspaceRoot: isolated.workspaceRoot,
            baseRef: 'origin/main',
            movieId,
          });
        } catch (error) {
          recordWorkError('checkpoint_save', error);
        }
      }
    } else {
      try {
        deletedCheckpoint = deleteWorkCheckpoint({repositoryRoot: root, movieId});
      } catch (error) {
        recordWorkError('checkpoint_delete', error);
      }
    }
  }
} finally {
  try {
    await removeCleanWorktree({repositoryRoot: root, ...isolated});
  } catch (error) {
    recordWorkError('worktree_cleanup', error);
  }
  await assertProtected();
}
emitResult({
  event: 'isolated_canary_finished',
  movie_id: movieId,
  base_commit: baseCommit,
  restored_checkpoint: restored,
  saved_checkpoint: checkpoint,
  deleted_checkpoint: deletedCheckpoint,
  work_error: workError,
  exit_code: result.code,
});
if (result.code !== 0) process.exitCode = result.code;
