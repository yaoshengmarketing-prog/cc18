import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile} from 'node:fs/promises';
import {resolve, relative} from 'node:path';
import {spawnSync} from 'node:child_process';

const root = resolve(import.meta.dirname, '..', '..');
const artifactRoot = resolve(root, '.cc18-canary');
const artifactArgument = process.argv.find((value) => value.startsWith('--artifact='))?.slice('--artifact='.length);
const movieIds = process.argv.slice(2)
  .filter((value) => !value.startsWith('--'))
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);

if (!artifactArgument || !movieIds.length || movieIds.some((id) => !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(id))) {
  throw new Error('Usage: node scripts/editorial/adopt-draft-artifact.mjs --artifact=<directory> MOVIE-ID [...]');
}

const artifactDirectory = resolve(root, artifactArgument);
const artifactRelative = relative(artifactRoot, artifactDirectory);
if (artifactRelative.startsWith('..') || artifactRelative === '') {
  throw new Error('Draft artifact must be a child directory of .cc18-canary');
}

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const run = (script, args) => {
  const result = spawnSync(process.execPath, [resolve(root, script), ...args], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`${args[0]}: ${script} exited with ${result.status ?? 1}`);
};

for (const movieId of movieIds) {
  const workDirectory = resolve(artifactDirectory, movieId);
  const sourcePath = resolve(workDirectory, 'source-record.json');
  const briefPath = resolve(workDirectory, 'editorial-brief.json');
  const reviewPath = resolve(workDirectory, 'review.md');
  const qualityPath = resolve(workDirectory, 'quality-automated.json');
  const usagePath = resolve(workDirectory, 'usage.json');
  const [source, brief, review, quality] = await Promise.all([
    json(sourcePath),
    json(briefPath),
    readFile(reviewPath, 'utf8'),
    json(qualityPath),
  ]);
  if ([source.id, brief.id, quality.id].some((id) => id !== movieId)) throw new Error(`${movieId}: artifact identity mismatch`);
  if (quality.passed !== true || quality.issues?.length) throw new Error(`${movieId}: artifact QA did not pass`);
  const reviewHash = createHash('sha256').update(review).digest('hex');
  if (quality.review_sha256 !== reviewHash) throw new Error(`${movieId}: artifact review hash mismatch`);

  await Promise.all([
    mkdir(resolve(root, 'data', 'source-records'), {recursive: true}),
    mkdir(resolve(root, 'data', 'editorial-briefs'), {recursive: true}),
    mkdir(resolve(root, 'data', 'editorial-usage'), {recursive: true}),
  ]);
  await Promise.all([
    copyFile(sourcePath, resolve(root, 'data', 'source-records', `${movieId}.json`)),
    copyFile(briefPath, resolve(root, 'data', 'editorial-briefs', `${movieId}.json`)),
    copyFile(usagePath, resolve(root, 'data', 'editorial-usage', `${movieId}.json`)),
  ]);
  run('scripts/editorial/build-from-analysis.mjs', [movieId, '--source-only', '--repair-existing']);
  run('scripts/editorial/qa-draft.mjs', [movieId]);
  console.log(JSON.stringify({movie_id: movieId, status: 'adopted_from_qa_artifact'}));
}
