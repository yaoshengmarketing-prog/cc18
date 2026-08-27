import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';

const root = resolve(import.meta.dirname, '..', '..');
const argument = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const movieId = process.argv[2]?.trim().toUpperCase();
const inputPath = resolve(argument('input') ?? '');
const requestedVersion = Number(argument('version') ?? 0);
if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId ?? '') || !argument('input')) throw new Error('Usage: node scripts/video/finalize-video.mjs MOVIE-ID --input=PATH [--version=N]');
if (!Number.isInteger(requestedVersion) || requestedVersion < 0) throw new Error('--version must be a non-negative integer');
const run = (command, args) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(command, args, {cwd: root, stdio: 'inherit'});
  child.once('error', rejectRun);
  child.once('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`${command} exited with ${code}`)));
});
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

const bytes = await readFile(inputPath);
if (bytes.length < 12 || bytes.subarray(4, 8).toString() !== 'ftyp') throw new Error('Rendered output is not a valid MP4 container');
const source = JSON.parse(await readFile(resolve(root, `data/source-records/${movieId}.json`), 'utf8'));
const config = JSON.parse(await readFile(resolve(root, 'config/image-model.json'), 'utf8'));
const manifestPath = resolve(root, `data/media-manifests/${movieId}.json`);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const previousVersion = Number(String(manifest.video?.target_r2_key ?? '').match(/vertical-v(\d+)\.mp4$/)?.[1] ?? 0);
const version = Math.max(previousVersion + 1, requestedVersion || 1);
const [year, month] = source.release_date.split('-');
const r2Key = `works/${year}/${month}/${movieId}/vertical-v${version}.mp4`;
const wrangler = resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const verifyDirectory = resolve(root, '.cc18-video', 'verify', `${movieId}-${process.pid}`);
const verifyPath = resolve(verifyDirectory, `vertical-v${version}.mp4`);
await mkdir(verifyDirectory, {recursive: true});
try {
  await run(process.execPath, [wrangler, 'r2', 'object', 'put', `${config.r2_bucket}/${r2Key}`, '--remote', '--file', inputPath, '--content-type', 'video/mp4', '--cache-control', 'public, max-age=31536000, immutable', '--force']);
  await run(process.execPath, [wrangler, 'r2', 'object', 'get', `${config.r2_bucket}/${r2Key}`, '--remote', '--file', verifyPath]);
  const verified = await readFile(verifyPath);
  if (digest(verified) !== digest(bytes)) throw new Error('R2 video hash verification failed');
} finally {
  await rm(verifyDirectory, {recursive: true, force: true});
}

manifest.video = {
  status: 'rendered_and_uploaded', duration_seconds: 9, width: 1080, height: 1920, codec: 'h264',
  local_path: null, local_retention_status: 'purged_after_r2_hash_verification', bytes: bytes.length,
  sha256: digest(bytes), target_r2_key: r2Key, public_path: `/media/${r2Key}`,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const reviewPath = resolve(root, `content/reviews/${movieId}.md`);
let review = await readFile(reviewPath, 'utf8');
review = /^videoUrl:/m.test(review)
  ? review.replace(/^videoUrl:.*$/m, `videoUrl: /media/${r2Key}`)
  : review.replace(/^(heroUrl:.*)$/m, `$1\nvideoUrl: /media/${r2Key}`);
review = review.replace(/^videoStatus:.*$/m, 'videoStatus: rendered');
await writeFile(reviewPath, review);

const qualityPath = resolve(root, `data/review-quality/${movieId}.json`);
const quality = JSON.parse(await readFile(qualityPath, 'utf8'));
quality.review_sha256 = digest(Buffer.from(review));
await writeFile(qualityPath, `${JSON.stringify(quality, null, 2)}\n`);
const registryPath = resolve(root, 'data/movie-registry.json');
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const record = registry.records.find(({id}) => id === movieId);
if (!record) throw new Error(`${movieId}: registry record not found`);
record.video_status = 'rendered';
registry.updated_at = new Date().toISOString();
await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
console.log(JSON.stringify({movie_id: movieId, video_status: 'rendered', version, public_path: `/media/${r2Key}`, bytes: bytes.length, sha256: digest(bytes)}, null, 2));
