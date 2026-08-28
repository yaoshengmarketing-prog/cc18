import {spawn} from 'node:child_process';
import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {queueStoreFromEnvironment} from '../queue/store.mjs';
import {loadLocalEditorialEnvironment} from './lib/openai-writer.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const option = (name) => process.argv.slice(2).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const max = Number(option('--max') ?? 1);
if (!Number.isInteger(max) || max < 1 || max > 3) throw new Error('--max must be an integer from 1 to 3');
if (process.env.CC18_ALLOW_EDITORIAL_TRANSMISSION !== 'YES') {
  throw new Error('Draft batch requires CC18_ALLOW_EDITORIAL_TRANSMISSION=YES');
}

loadLocalEditorialEnvironment(root);
const store = queueStoreFromEnvironment({mode: 'd1'});
const registry = JSON.parse(await readFile(resolve(root, 'data/movie-registry.json'), 'utf8'));
const excluded = registry.records.map(({id}) => id);
const before = await store.queueHealth();
if (before.stale_leases.length) throw new Error(`Draft batch refuses ${before.stale_leases.length} stale lease(s)`);

const candidates = await store.listCanaryCandidates({limit: max, excludeMovieIds: excluded});
const selected = candidates.map(({movie_id}) => movie_id);
const startedAt = new Date().toISOString();
const runId = startedAt.replace(/[:.]/g, '-');
const artifactDirectory = resolve(root, '.cc18-canary', `draft-batch-${runId}`);
await mkdir(artifactDirectory, {recursive: true});

const runOne = (movieId) => new Promise((resolveRun) => {
  const child = spawn(process.execPath, [resolve(root, 'scripts/editorial/draft-canary-d1.mjs'), movieId], {
    cwd: root,
    env: process.env,
    windowsHide: true,
    stdio: 'inherit',
  });
  child.once('error', (error) => resolveRun({code: 1, error: error.message}));
  child.once('close', (code) => resolveRun({code: code ?? 1}));
});

const artifactSources = (movieId) => [
  ['review.md', resolve(root, 'content', 'reviews', `${movieId}.md`)],
  ['source-record.json', resolve(root, 'data', 'source-records', `${movieId}.json`)],
  ['editorial-brief.json', resolve(root, 'data', 'editorial-briefs', `${movieId}.json`)],
  ['quality.json', resolve(root, 'data', 'review-quality', `${movieId}.json`)],
  ['quality-automated.json', resolve(root, 'data', 'review-quality', `${movieId}-automated.json`)],
  ['search-content.json', resolve(root, 'data', 'search-content', `${movieId}.json`)],
  ['usage.json', resolve(root, 'data', 'editorial-usage', `${movieId}.json`)],
];

async function collectArtifacts(movieId) {
  const workDirectory = resolve(artifactDirectory, movieId);
  await mkdir(workDirectory, {recursive: true});
  const copied = [];
  for (const [name, source] of artifactSources(movieId)) {
    try {
      await cp(source, resolve(workDirectory, name));
      copied.push(name);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const optionalJson = async (path) => {
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  };
  return {
    copied,
    quality: await optionalJson(resolve(root, 'data', 'review-quality', `${movieId}-automated.json`)),
    usage: await optionalJson(resolve(root, 'data', 'editorial-usage', `${movieId}.json`)),
  };
}

const completed = [];
const failed = [];
for (const movieId of selected) {
  const result = await runOne(movieId);
  const artifacts = await collectArtifacts(movieId);
  const receipt = {
    calls: artifacts.usage?.calls?.length ?? 0,
    estimated_cost_usd: artifacts.usage?.totals?.estimated_cost_usd ?? 0,
    estimated_payg_cash_cost_usd: artifacts.usage?.totals?.estimated_payg_cash_cost_usd ?? 0,
    artifacts: artifacts.copied,
  };
  if (result.code !== 0) {
    failed.push({movie_id: movieId, error: result.error ?? `draft canary exited with ${result.code}`, qa_passed: artifacts.quality?.passed ?? false, ...receipt});
    continue;
  }
  completed.push({
    movie_id: movieId,
    qa_passed: artifacts.quality?.passed === true,
    qa_metrics: artifacts.quality?.metrics,
    ...receipt,
  });
}

const after = await store.queueHealth();
const report = {
  schema_version: 1,
  event: 'draft_only_batch_finished',
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  maximum_works: max,
  selected,
  completed,
  failed,
  queue_empty: selected.length === 0,
  queue_mutated: false,
  image_enqueued: false,
  video_rendered: false,
  committed: false,
  published: false,
  stale_leases_before: before.stale_leases.length,
  stale_leases_after: after.stale_leases.length,
  estimated_cost_usd: [...completed, ...failed].reduce((sum, item) => sum + item.estimated_cost_usd, 0),
  estimated_payg_cash_cost_usd: [...completed, ...failed].reduce((sum, item) => sum + item.estimated_payg_cash_cost_usd, 0),
};
await writeFile(resolve(artifactDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (process.env.GITHUB_OUTPUT) {
  await writeFile(process.env.GITHUB_OUTPUT, `artifact_dir=${artifactDirectory}\n`, {encoding: 'utf8', flag: 'a'});
}
console.log(JSON.stringify({...report, artifact_dir: artifactDirectory}, null, 2));
if (failed.length || after.stale_leases.length) process.exitCode = 1;
