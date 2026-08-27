import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {basename, resolve} from 'node:path';
import {spawn} from 'node:child_process';

const root = resolve(import.meta.dirname, '..', '..');
const argument = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const movieId = process.argv[2]?.trim().toUpperCase();
const heroPath = argument('hero');
const verticalPath = argument('vertical');
const provider = argument('provider') ?? 'unknown';
const model = argument('model') ?? 'unknown';
const taskIds = (argument('task-ids') ?? '').split(',').filter(Boolean);
const requestedVersion = Number(argument('version') ?? 0);
if (!Number.isInteger(requestedVersion) || requestedVersion < 0) throw new Error('--version must be a non-negative integer');
if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId ?? '') || !heroPath || !verticalPath) {
  throw new Error('Usage: npm run image:finalize -- MOVIE-ID --hero=PATH --vertical=PATH [--provider=NAME] [--model=NAME]');
}

const signature = (bytes) => {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return {extension: 'png', contentType: 'image/png'};
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return {extension: 'jpg', contentType: 'image/jpeg'};
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return {extension: 'webp', contentType: 'image/webp'};
  throw new Error('Unsupported or invalid image signature');
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = (command, args, {environment = process.env} = {}) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(command, args, {cwd: root, stdio: 'inherit', env: environment});
  child.once('error', rejectRun);
  child.once('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`${command} exited with ${code}`)));
});

const source = JSON.parse(await readFile(resolve(root, `data/source-records/${movieId}.json`), 'utf8'));
const imageConfig = JSON.parse(await readFile(resolve(root, 'config/image-model.json'), 'utf8'));
const wrangler = resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const wranglerEnvironment = {...process.env};
if (process.env.CC18_R2_AUTH_MODE === 'oauth') delete wranglerEnvironment.CLOUDFLARE_API_TOKEN;
let imageBrief = null;
try { imageBrief = JSON.parse(await readFile(resolve(root, `data/image-briefs/${movieId}.json`), 'utf8')); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
const [year, month] = source.release_date.split('-');
const manifestPath = resolve(root, `data/media-manifests/${movieId}.json`);
let existing = null;
try { existing = JSON.parse(await readFile(manifestPath, 'utf8')); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
const versions = (existing?.assets ?? []).flatMap(({r2_key}) => [...String(r2_key).matchAll(/-v(\d+)\./g)].map((match) => Number(match[1])));
const version = Math.max(Math.max(0, ...versions) + 1, requestedVersion || 1);
const inputs = [
  {role: 'article_hero', localPath: resolve(heroPath), filename: `hero-v${version}`},
  {role: 'vertical_scene', localPath: resolve(verticalPath), filename: `scene-vertical-v${version}`},
];
const verifyDirectory = resolve(root, '.cc18-image', 'verify', `${movieId}-${process.pid}`);
await mkdir(verifyDirectory, {recursive: true});

const assets = [];
try {
  for (const [index, input] of inputs.entries()) {
    const bytes = await readFile(input.localPath);
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error(`${input.role}: invalid image size`);
    const {extension, contentType} = signature(bytes);
    const r2Key = `works/${year}/${month}/${movieId}/${input.filename}.${extension}`;
    await run(process.execPath, [wrangler, 'r2', 'object', 'put', `${imageConfig.r2_bucket}/${r2Key}`, '--remote', '--file', input.localPath, '--content-type', contentType, '--cache-control', 'public, max-age=31536000, immutable', '--force'], {environment: wranglerEnvironment});
    const verificationPath = resolve(verifyDirectory, `${input.filename}.${extension}`);
    await run(process.execPath, [wrangler, 'r2', 'object', 'get', `${imageConfig.r2_bucket}/${r2Key}`, '--remote', '--file', verificationPath], {environment: wranglerEnvironment});
    const verified = await readFile(verificationPath);
    if (digest(verified) !== digest(bytes)) throw new Error(`${input.role}: R2 hash verification failed`);
    assets.push({
      role: input.role,
      path: `/media/${r2Key}`,
      r2_key: r2Key,
      bytes: bytes.length,
      sha256: digest(bytes),
      provider,
      model,
      provider_task_id: taskIds[index] ?? null,
      source_file: basename(input.localPath),
      prompt_summary: imageBrief?.prompts?.[input.role]?.slice(0, 320) ?? null,
    });
  }
} finally {
  await rm(verifyDirectory, {recursive: true, force: true});
}

const manifest = {
  schema_version: 1,
  id: movieId,
  artwork_policy: 'original_non_explicit_no_real_person_likeness',
  generated_at: new Date().toISOString(),
  assets,
  video: existing?.video ?? {status: 'pending'},
};
await mkdir(resolve(root, 'data', 'media-manifests'), {recursive: true});
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const reviewPath = resolve(root, `content/reviews/${movieId}.md`);
let review = await readFile(reviewPath, 'utf8');
const heroUrl = assets.find(({role}) => role === 'article_hero').path;
review = /^heroUrl:/m.test(review)
  ? review.replace(/^heroUrl:.*$/m, `heroUrl: ${heroUrl}`)
  : review.replace(/^(coverUrl:.*)$/m, `$1\nheroUrl: ${heroUrl}`);
review = /^imageStatus:/m.test(review)
  ? review.replace(/^imageStatus:.*$/m, 'imageStatus: rendered')
  : review.replace(/^(videoStatus:.*)$/m, 'imageStatus: rendered\n$1');
await writeFile(reviewPath, review);

const registryPath = resolve(root, 'data/movie-registry.json');
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const record = registry.records.find(({id}) => id === movieId);
if (!record) throw new Error(`${movieId}: registry record not found`);
record.image_status = 'rendered';
registry.updated_at = new Date().toISOString();
await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
console.log(JSON.stringify({movie_id: movieId, image_status: 'rendered', version, assets}, null, 2));
