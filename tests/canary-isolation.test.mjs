import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  createCleanWorktree,
  checkpointRef,
  deleteWorkCheckpoint,
  removeCleanWorktree,
  restoreWorkCheckpoint,
  saveWorkCheckpoint,
} from '../scripts/canary/isolation.mjs';

const git = (root, ...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', windowsHide: true}).trim();
const put = async (root, path, value) => {
  const target = join(root, ...path.split('/'));
  await mkdir(join(target, '..'), {recursive: true});
  await writeFile(target, value, 'utf8');
};

test('a failed work checkpoint cannot contaminate the next work or shared projections', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'cc18-canary-isolation-test-'));
  const remote = join(temporary, 'remote.git');
  const seed = join(temporary, 'seed');
  const runner = join(temporary, 'runner');
  let failedWorkspace;
  let nextWorkspace;
  let retryWorkspace;
  let postPushWorkspace;
  try {
    await mkdir(seed);
    git(temporary, 'init', '--bare', remote);
    git(seed, 'init');
    git(seed, 'config', 'user.name', 'test');
    git(seed, 'config', 'user.email', 'test@example.invalid');
    await put(seed, 'data/movie-registry.json', `${JSON.stringify({schema_version: 1, updated_at: '2026-09-01T00:00:00.000Z', records: []}, null, 2)}\n`);
    await put(seed, 'data/tag-candidates.json', `${JSON.stringify({schema_version: 1, candidates: []}, null, 2)}\n`);
    await put(seed, 'data/movie-master/index.json', 'BASE MASTER INDEX\n');
    await put(seed, 'public/search-index.json', 'BASE SEARCH INDEX\n');
    git(seed, 'add', '--', 'data/movie-registry.json', 'data/tag-candidates.json', 'data/movie-master/index.json', 'public/search-index.json');
    git(seed, 'commit', '-m', 'base');
    git(seed, 'branch', '-M', 'main');
    git(seed, 'remote', 'add', 'origin', remote);
    git(seed, 'push', '-u', 'origin', 'main');
    git(remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    git(temporary, 'clone', remote, runner);

    failedWorkspace = await createCleanWorktree({repositoryRoot: runner, baseRef: 'origin/main', linkNodeModules: false});
    await put(failedWorkspace.workspaceRoot, 'content/reviews/A-001.md', 'A CHECKPOINT\n');
    await put(failedWorkspace.workspaceRoot, 'data/movie-registry.json', `${JSON.stringify({schema_version: 1, updated_at: '2026-09-02T00:00:00.000Z', records: [{id: 'A-001', review_status: 'draft'}]}, null, 2)}\n`);
    await put(failedWorkspace.workspaceRoot, 'data/tag-candidates.json', `${JSON.stringify({schema_version: 1, candidates: [{label: 'A tag', source_ids: ['A-001'], occurrences: 1, first_seen: '2026-09-02', last_seen: '2026-09-02', status: 'quarantined'}]}, null, 2)}\n`);
    await put(failedWorkspace.workspaceRoot, 'data/movie-master/index.json', 'A DIRTY MASTER INDEX\n');
    await put(failedWorkspace.workspaceRoot, 'public/search-index.json', 'A DIRTY SEARCH INDEX\n');
    const checkpoint = await saveWorkCheckpoint({
      repositoryRoot: runner,
      workspaceRoot: failedWorkspace.workspaceRoot,
      movieId: 'A-001',
    });
    assert.equal(checkpoint.saved, true);
    assert.deepEqual(checkpoint.paths, ['content/reviews/A-001.md', 'data/movie-registry.json', 'data/tag-candidates.json']);
    assert.match(git(runner, 'ls-remote', 'origin', checkpointRef('A-001')), /^[a-f0-9]{40}\s/u);
    assert.doesNotMatch(git(runner, 'ls-remote', '--heads', 'origin'), /cc18-checkpoints/u);
    await removeCleanWorktree({repositoryRoot: runner, ...failedWorkspace});
    failedWorkspace = null;
    assert.equal(git(runner, 'status', '--porcelain'), '');

    nextWorkspace = await createCleanWorktree({repositoryRoot: runner, baseRef: 'origin/main', linkNodeModules: false});
    git(nextWorkspace.workspaceRoot, 'config', 'user.name', 'test');
    git(nextWorkspace.workspaceRoot, 'config', 'user.email', 'test@example.invalid');
    await put(nextWorkspace.workspaceRoot, 'content/reviews/B-001.md', 'B PUBLISHED\n');
    await put(nextWorkspace.workspaceRoot, 'data/movie-registry.json', `${JSON.stringify({schema_version: 1, updated_at: '2026-09-03T00:00:00.000Z', records: [{id: 'B-001', review_status: 'published'}]}, null, 2)}\n`);
    await put(nextWorkspace.workspaceRoot, 'data/tag-candidates.json', `${JSON.stringify({schema_version: 1, candidates: [{label: 'B tag', source_ids: ['B-001'], occurrences: 1, first_seen: '2026-09-03', last_seen: '2026-09-03', status: 'quarantined'}]}, null, 2)}\n`);
    git(nextWorkspace.workspaceRoot, 'add', '--', 'content/reviews/B-001.md', 'data/movie-registry.json', 'data/tag-candidates.json');
    git(nextWorkspace.workspaceRoot, 'commit', '-m', 'publish B');
    git(nextWorkspace.workspaceRoot, 'push', 'origin', 'HEAD:main');
    await removeCleanWorktree({repositoryRoot: runner, ...nextWorkspace});
    nextWorkspace = null;
    git(runner, 'fetch', 'origin', 'main');

    retryWorkspace = await createCleanWorktree({repositoryRoot: runner, baseRef: 'origin/main', linkNodeModules: false});
    const restored = await restoreWorkCheckpoint({repositoryRoot: runner, workspaceRoot: retryWorkspace.workspaceRoot, movieId: 'A-001'});
    assert.equal(restored.restored, true);
    const readNormalized = async (path) => (await readFile(join(retryWorkspace.workspaceRoot, path), 'utf8')).replaceAll('\r\n', '\n');
    assert.equal(await readNormalized('content/reviews/A-001.md'), 'A CHECKPOINT\n');
    assert.equal(await readNormalized('content/reviews/B-001.md'), 'B PUBLISHED\n');
    const registry = JSON.parse(await readNormalized('data/movie-registry.json'));
    assert.deepEqual(registry.records.map(({id}) => id), ['B-001', 'A-001']);
    assert.equal(registry.updated_at, '2026-09-03T00:00:00.000Z');
    const candidates = JSON.parse(await readNormalized('data/tag-candidates.json'));
    assert.deepEqual(candidates.candidates.map(({label}) => label), ['B tag', 'A tag']);
    assert.equal(await readNormalized('data/movie-master/index.json'), 'BASE MASTER INDEX\n');
    assert.equal(await readNormalized('public/search-index.json'), 'BASE SEARCH INDEX\n');
    assert.equal(git(retryWorkspace.workspaceRoot, 'diff', '--cached', '--name-only'), '');
    assert.deepEqual(git(retryWorkspace.workspaceRoot, 'status', '--porcelain').split(/\r?\n/u).map((line) => line.trim()), [
      'M data/movie-registry.json',
      'M data/tag-candidates.json',
      '?? content/reviews/A-001.md',
    ]);
    git(retryWorkspace.workspaceRoot, 'config', 'user.name', 'test');
    git(retryWorkspace.workspaceRoot, 'config', 'user.email', 'test@example.invalid');
    registry.records.find(({id}) => id === 'A-001').review_status = 'published';
    await put(retryWorkspace.workspaceRoot, 'data/movie-registry.json', `${JSON.stringify(registry, null, 2)}\n`);
    git(retryWorkspace.workspaceRoot, 'add', '--', 'content/reviews/A-001.md', 'data/movie-registry.json', 'data/tag-candidates.json');
    git(retryWorkspace.workspaceRoot, 'commit', '-m', 'publish A before delayed deployment confirmation');
    git(retryWorkspace.workspaceRoot, 'push', 'origin', 'HEAD:main');
    await removeCleanWorktree({repositoryRoot: runner, ...retryWorkspace});
    retryWorkspace = null;
    git(runner, 'fetch', 'origin', 'main');
    postPushWorkspace = await createCleanWorktree({repositoryRoot: runner, baseRef: 'origin/main', linkNodeModules: false});
    const skipped = await restoreWorkCheckpoint({repositoryRoot: runner, workspaceRoot: postPushWorkspace.workspaceRoot, movieId: 'A-001'});
    assert.equal(skipped.restored, false);
    assert.equal(skipped.reason, 'published_on_base');
    assert.equal(git(postPushWorkspace.workspaceRoot, 'status', '--porcelain'), '');
    assert.equal(deleteWorkCheckpoint({repositoryRoot: runner, movieId: 'A-001'}).deleted, true);
    assert.equal(git(runner, 'ls-remote', 'origin', checkpointRef('A-001')), '');
  } finally {
    if (postPushWorkspace) await removeCleanWorktree({repositoryRoot: runner, ...postPushWorkspace});
    if (retryWorkspace) await removeCleanWorktree({repositoryRoot: runner, ...retryWorkspace});
    if (nextWorkspace) await removeCleanWorktree({repositoryRoot: runner, ...nextWorkspace});
    if (failedWorkspace) await removeCleanWorktree({repositoryRoot: runner, ...failedWorkspace});
    await rm(temporary, {recursive: true, force: true});
  }
});
