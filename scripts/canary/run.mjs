import {spawn, spawnSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {queueStoreFromEnvironment} from '../queue/store.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const option = (name) => process.argv.slice(2).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const max = Number(option('--max') ?? 1);
if (!Number.isInteger(max) || max < 1 || max > 3) throw new Error('--max must be an integer from 1 to 3');
const requestedIds = (option('--ids') ?? '').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
if (requestedIds.some((id) => !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(id))) throw new Error('--ids contains an invalid movie id');
if (requestedIds.length > max) throw new Error('--ids cannot contain more entries than --max');
if (process.env.CC18_ALLOW_EDITORIAL_TRANSMISSION !== 'YES' || process.env.CC18_ALLOW_IMAGE_TRANSMISSION !== 'YES') {
  throw new Error('Canary requires CC18_ALLOW_EDITORIAL_TRANSMISSION=YES and CC18_ALLOW_IMAGE_TRANSMISSION=YES');
}
const git = spawnSync('git', ['status', '--porcelain'], {cwd: root, encoding: 'utf8'});
if (git.status !== 0 || git.stdout.trim()) throw new Error('Canary requires a clean Git worktree');

const store = queueStoreFromEnvironment({mode: 'd1'});
const candidates = requestedIds.length ? requestedIds : (await store.listCanaryCandidates({limit: max})).map(({movie_id}) => movie_id);
const stages = [
  ['editorial', 'scripts/editorial/handoff-d1.mjs', (id) => [id, '--source-only', '--retry-now']],
  ['image', 'scripts/image/process-d1-one.mjs', (id) => [id]],
  ['video', 'scripts/video/process-d1-one.mjs', (id) => [id]],
  ['publish', 'scripts/publish/process-d1-one.mjs', (id) => [id]],
];
const run = (script, args) => new Promise((resolveRun) => {
  const child = spawn(process.execPath, [resolve(root, script), ...args], {cwd: root, env: process.env, windowsHide: true, stdio: 'inherit'});
  child.once('error', (error) => resolveRun({code: 1, error: error.message}));
  child.once('close', (code) => resolveRun({code: code ?? 1}));
});

const report = {schema_version: 1, started_at: new Date().toISOString(), maximum_works: max, selected: candidates, completed: [], failed: []};
for (const movieId of candidates) {
  const work = {movie_id: movieId, stages: []};
  try {
    const movie = await store.getMovie(movieId);
    if (!movie || movie.classification !== 'eligible' || movie.metadata_status !== 'validated') throw new Error(`${movieId}: not an eligible validated work`);
    for (const [stage, script, args] of stages) {
      const existing = await store.findJob({movieId, stage});
      if (existing?.status === 'completed') {
        work.stages.push({stage, status: 'already_completed'});
        continue;
      }
      const result = await run(script, args(movieId));
      const current = await store.findJob({movieId, stage});
      if (result.code !== 0 || current?.status !== 'completed') throw new Error(`${movieId}: ${stage} did not complete (exit=${result.code}, status=${current?.status ?? 'missing'})`);
      work.stages.push({stage, status: 'completed', attempt: current.attempt});
    }
    report.completed.push(work);
  } catch (error) {
    work.error = error.message;
    report.failed.push(work);
  }
}
report.finished_at = new Date().toISOString();
const directory = resolve(root, '.cc18-canary');
await mkdir(directory, {recursive: true});
const output = resolve(directory, `${report.started_at.replace(/[:.]/g, '-')}.json`);
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({...report, report_path: output}, null, 2));
if (report.failed.length) process.exitCode = 1;
