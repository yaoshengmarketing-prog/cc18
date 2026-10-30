import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {queueStoreFromEnvironment} from '../queue/store.mjs';
import {classifyCanaryStageOutcome, isAdmittedCanaryWork, registryDraftIds} from './selection.mjs';
import {buildR2WranglerEnvironment} from '../r2/wrangler-auth.mjs';
import {allowedPublishPaths} from '../publish/lib/publisher.mjs';
import {assertRestoredCheckpointAuthorization, protectedIsolatedUntrackedPaths} from './isolation.mjs';

const root = resolve(import.meta.dirname, '..', '..');
if (process.env.CC18_CANARY_ISOLATED_WORKSPACE !== 'YES') {
  throw new Error('Canary must run through the single-work isolated runner');
}
const option = (name) => process.argv.slice(2).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const max = Number(option('--max') ?? 1);
if (max !== 1) throw new Error('Isolated canary requires --max=1');
const requestedIds = (option('--ids') ?? '').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
if (requestedIds.some((id) => !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(id))) throw new Error('--ids contains an invalid movie id');
if (requestedIds.length !== 1) throw new Error('Isolated canary requires exactly one movie ID');
if (process.env.CC18_ALLOW_EDITORIAL_TRANSMISSION !== 'YES') {
  throw new Error('Canary requires CC18_ALLOW_EDITORIAL_TRANSMISSION=YES');
}
const imageGenerationEnabled = process.env.CC18_ALLOW_IMAGE_TRANSMISSION === 'YES';
buildR2WranglerEnvironment();
const git = (args) => {
  const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
};
let restoredAuthorization = null;
if (process.env.CC18_CANARY_RESTORED_CHECKPOINT) {
  try {
    restoredAuthorization = JSON.parse(process.env.CC18_CANARY_RESTORED_CHECKPOINT);
  } catch {
    throw new Error('Canary received invalid restored checkpoint authorization JSON');
  }
}
const managedNodeModulesLink = process.env.CC18_CANARY_MANAGED_NODE_MODULES_LINK === 'YES';
const authorizedRestoredPaths = new Set(await assertRestoredCheckpointAuthorization({
  workspaceRoot: root,
  movieId: requestedIds[0],
  authorization: restoredAuthorization,
  managedNodeModulesLink,
}));
const protectedUntrackedPaths = (await protectedIsolatedUntrackedPaths({
  workspaceRoot: root,
  paths: git(['ls-files', '--others', '--exclude-standard'])
    .split(/\r?\n/u).filter(Boolean).map((path) => path.replaceAll('\\', '/')),
  managedNodeModulesLink,
})).filter((path) => !authorizedRestoredPaths.has(path));
const fingerprint = async (repoPath) => {
  const absolute = resolve(root, repoPath);
  const [bytes, details] = await Promise.all([readFile(absolute), stat(absolute)]);
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: details.size,
    mtime_ms: details.mtimeMs,
  };
};
const protectedFingerprints = new Map(await Promise.all(protectedUntrackedPaths.map(async (path) => [path, await fingerprint(path)])));
const assertProtectedUntrackedUnchanged = async () => {
  for (const [path, before] of protectedFingerprints) {
    let after;
    try { after = await fingerprint(path); } catch { throw new Error(`Canary protected untracked file disappeared: ${path}`); }
    if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error(`Canary protected untracked file changed: ${path}`);
  }
};

const store = queueStoreFromEnvironment({mode: 'd1'});
const registry = JSON.parse(await readFile(resolve(root, 'data', 'movie-registry.json'), 'utf8'));
const draftIds = registryDraftIds(registry);
const existingRegistryRecord = registry.records.find(({id}) => id.toUpperCase() === requestedIds[0]);
if (existingRegistryRecord && existingRegistryRecord.review_status !== 'draft') {
  const [editorialJob, publishJob] = await Promise.all([
    store.findJob({movieId: requestedIds[0], stage: 'editorial'}),
    store.findJob({movieId: requestedIds[0], stage: 'publish'}),
  ]);
  if (editorialJob?.status !== 'completed' || !publishJob || publishJob.status === 'completed') {
    throw new Error(`Canary refuses already-published Registry record: ${requestedIds[0]}`);
  }
}
const candidates = requestedIds;
const stages = [
  {stage: 'editorial', script: 'scripts/editorial/handoff-d1.mjs', args: (id) => [id, '--source-only', ...(draftIds.has(id) ? ['--qa-only'] : []), '--retry-now'], required: true},
  ...(imageGenerationEnabled ? [{stage: 'image', script: 'scripts/image/process-d1-one.mjs', args: (id) => [id], required: false}] : []),
  {stage: 'video', script: 'scripts/video/process-d1-one.mjs', args: (id) => [id], required: false},
  {stage: 'publish', script: 'scripts/publish/process-d1-one.mjs', args: (id) => [id], required: true},
];
const run = (script, args) => new Promise((resolveRun) => {
  const child = spawn(process.execPath, [resolve(root, script), ...args], {cwd: root, env: process.env, windowsHide: true, stdio: 'inherit'});
  child.once('error', (error) => resolveRun({code: 1, error: error.message}));
  child.once('close', (code) => resolveRun({code: code ?? 1}));
});

const report = {schema_version: 1, started_at: new Date().toISOString(), maximum_works: max, image_generation_enabled: imageGenerationEnabled, selected: candidates, completed: [], failed: []};
for (const movieId of candidates) {
  const work = {movie_id: movieId, stages: []};
  try {
    const protectedCollision = protectedUntrackedPaths.filter((path) => allowedPublishPaths(movieId).has(path));
    if (protectedCollision.length) throw new Error(`${movieId}: protected pre-existing untracked artifact(s): ${protectedCollision.join(', ')}`);
    const movie = await store.getMovie(movieId);
    const editorialJob = await store.findJob({movieId, stage: 'editorial'});
    if (!isAdmittedCanaryWork({movie, editorialJob})) throw new Error(`${movieId}: not an admitted validated work`);
    let sourcePreflightPassed = false;
    for (const {stage, script, args, required} of stages) {
      if (!sourcePreflightPassed && ['image', 'video', 'publish'].includes(stage)) {
        const preflight = await run('scripts/publish/source-preflight.mjs', [movieId, '--repair-source']);
        if (preflight.code !== 0) throw new Error(`${movieId}: source publication preflight failed before media generation`);
        sourcePreflightPassed = true;
        work.stages.push({stage: 'source_preflight', status: 'passed'});
      }
      const existing = await store.findJob({movieId, stage});
      if (existing?.status === 'completed') {
        if (stage === 'editorial') {
          const result = await run('scripts/editorial/rehydrate-completed.mjs', [movieId]);
          if (result.code !== 0) throw new Error(`${movieId}: completed editorial approval could not be rehydrated`);
          work.stages.push({stage, status: 'rehydrated_from_completed_d1', attempt: existing.attempt});
          continue;
        }
        if (stage === 'video') {
          const result = await run('scripts/r2/rehydrate-media.mjs', [movieId]);
          if (result.code !== 0) throw new Error(`${movieId}: completed R2 media could not be rehydrated`);
          work.stages.push({stage, status: 'rehydrated_from_completed_r2', attempt: existing.attempt});
          continue;
        }
        work.stages.push({stage, status: 'already_completed'});
        continue;
      }
      const result = await run(script, args(movieId));
      const current = await store.findJob({movieId, stage});
      const outcome = classifyCanaryStageOutcome({stage, required, exitCode: result.code, job: current});
      if (!outcome.continuePipeline) {
        throw new Error(`${movieId}: ${stage} did not complete (exit=${result.code}, status=${current?.status ?? 'missing'})`);
      }
      work.stages.push({stage, status: outcome.reportStatus, attempt: current.attempt, ...(current.last_error_code ? {error_code: current.last_error_code} : {})});
    }
    await assertProtectedUntrackedUnchanged();
    report.completed.push(work);
  } catch (error) {
    work.error = error.message;
    report.failed.push(work);
  }
}
await assertProtectedUntrackedUnchanged();
report.finished_at = new Date().toISOString();
const directory = resolve(root, '.cc18-canary');
await mkdir(directory, {recursive: true});
const output = resolve(directory, `${report.started_at.replace(/[:.]/g, '-')}.json`);
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({...report, report_path: output}, null, 2));
if (report.failed.length) process.exitCode = 1;
