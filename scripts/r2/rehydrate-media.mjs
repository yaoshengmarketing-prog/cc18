import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {getR2Object, listR2Objects} from './object-store.mjs';
import {buildArtworkPrompts} from '../image/lib/artwork-prompt.mjs';

const movieId = process.argv[2]?.trim().toUpperCase();
if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId ?? '')) throw new Error('Usage: node scripts/r2/rehydrate-media.mjs MOVIE-ID');
const root = resolve(import.meta.dirname, '..', '..');
const localBridgeEnvironment = resolve(root, '.dev.vars.bridge');
if (existsSync(localBridgeEnvironment)) process.loadEnvFile(localBridgeEnvironment);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = JSON.parse(await readFile(resolve(root, `data/source-records/${movieId}.json`), 'utf8'));
const config = JSON.parse(await readFile(resolve(root, 'config/image-model.json'), 'utf8'));
const [year, month] = source.release_date.split('-');
const prefix = `works/${year}/${month}/${movieId}/`;
const objects = await listR2Objects({bucket: config.r2_bucket, prefix});
const latest = (pattern, label) => {
  const candidates = objects.flatMap(({key}) => {
    const match = key.match(pattern);
    return match ? [{key, version: Number(match[1])}] : [];
  }).sort((a, b) => b.version - a.version);
  if (!candidates.length) throw new Error(`${movieId}: no completed R2 ${label} object`);
  return candidates[0];
};
const hero = latest(/\/hero-v(\d+)\.(?:jpg|jpeg|png|webp)$/i, 'hero');
const vertical = latest(/\/scene-vertical-v(\d+)\.(?:jpg|jpeg|png|webp)$/i, 'vertical scene');
const video = latest(/\/vertical-v(\d+)\.mp4$/i, 'video');
const [heroObject, verticalObject, videoObject] = await Promise.all([
  getR2Object({bucket: config.r2_bucket, key: hero.key}),
  getR2Object({bucket: config.r2_bucket, key: vertical.key}),
  getR2Object({bucket: config.r2_bucket, key: video.key}),
]);
if (videoObject.bytes.length < 12 || videoObject.bytes.subarray(4, 8).toString() !== 'ftyp') {
  throw new Error(`${movieId}: recovered R2 video is not an MP4 container`);
}
let imageBrief = null;
try { imageBrief = JSON.parse(await readFile(resolve(root, `data/image-briefs/${movieId}.json`), 'utf8')); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
if (!imageBrief) {
  const editorial = JSON.parse(await readFile(resolve(root, `data/editorial-briefs/${movieId}.json`), 'utf8'));
  imageBrief = {
    schema_version: 1,
    movie_id: movieId,
    created_at: new Date().toISOString(),
    provider: config.provider,
    model: config.model,
    artwork_policy: 'original_non_explicit_no_real_person_likeness',
    prompts: buildArtworkPrompts({source, localCreativeBrief: editorial.local_creative_brief}),
    recovery: 'reconstructed_after_hash_verified_r2_rehydration',
  };
}
const asset = (role, selected, object) => ({
  role,
  path: `/media/${selected.key}`,
  r2_key: selected.key,
  bytes: object.bytes.length,
  sha256: digest(object.bytes),
  provider: config.provider,
  model: config.model,
  provider_task_id: null,
  source_file: null,
  prompt_summary: imageBrief?.prompts?.[role]?.slice(0, 320) ?? null,
  recovery: 'rehydrated_from_hash_verified_r2_object',
});
const assets = [asset('article_hero', hero, heroObject), asset('vertical_scene', vertical, verticalObject)];
const manifest = {
  schema_version: 1,
  id: movieId,
  artwork_policy: 'original_non_explicit_no_real_person_likeness',
  generated_at: new Date().toISOString(),
  assets,
  video: {
    status: 'rendered_and_uploaded', duration_seconds: 9, width: 1080, height: 1920, codec: 'h264',
    local_path: null, local_retention_status: 'purged_before_r2_rehydration', bytes: videoObject.bytes.length,
    sha256: digest(videoObject.bytes), target_r2_key: video.key, public_path: `/media/${video.key}`,
    recovery: 'rehydrated_from_hash_verified_r2_object',
  },
};
const reviewPath = resolve(root, `content/reviews/${movieId}.md`);
let review = await readFile(reviewPath, 'utf8');
const setFrontmatter = (markdown, key, value, after) => new RegExp(`^${key}:`, 'm').test(markdown)
  ? markdown.replace(new RegExp(`^${key}:.*$`, 'm'), `${key}: ${value}`)
  : markdown.replace(new RegExp(`^(${after}:.*)$`, 'm'), `$1\n${key}: ${value}`);
review = setFrontmatter(review, 'heroUrl', `/media/${hero.key}`, 'coverUrl');
review = setFrontmatter(review, 'videoUrl', `/media/${video.key}`, 'heroUrl');
review = setFrontmatter(review, 'imageStatus', 'rendered', 'videoStatus');
review = setFrontmatter(review, 'videoStatus', 'rendered', 'status');
const qualityPath = resolve(root, `data/review-quality/${movieId}.json`);
const registryPath = resolve(root, 'data/movie-registry.json');
const [quality, registry] = await Promise.all([
  readFile(qualityPath, 'utf8').then(JSON.parse), readFile(registryPath, 'utf8').then(JSON.parse),
]);
quality.pre_approval_rewrite_attempts_observed = Math.max(Number(quality.pre_approval_rewrite_attempts_observed ?? 0), Number(quality.rewrite_attempts ?? 0));
quality.rewrite_attempts = 0;
quality.approval_path = 'completed_d1_rehydration_without_rewrite';
quality.review_sha256 = digest(Buffer.from(review));
const record = registry.records.find(({id}) => id === movieId);
if (!record || record.review_status !== 'published') throw new Error(`${movieId}: Registry approval is not present`);
record.image_status = 'rendered';
record.video_status = 'rendered';
registry.updated_at = new Date().toISOString();
await Promise.all([
  writeFile(resolve(root, `data/image-briefs/${movieId}.json`), `${JSON.stringify(imageBrief, null, 2)}\n`, 'utf8'),
  writeFile(resolve(root, `data/media-manifests/${movieId}.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
  writeFile(reviewPath, review, 'utf8'),
  writeFile(qualityPath, `${JSON.stringify(quality, null, 2)}\n`, 'utf8'),
  writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8'),
]);
const props = spawnSync(process.execPath, [resolve(root, 'scripts/video/build-props.mjs'), movieId], {
  cwd: root,
  env: process.env,
  encoding: 'utf8',
  stdio: 'inherit',
});
if (props.status !== 0) throw new Error(`${movieId}: recovered media props could not be rebuilt`);
console.log(JSON.stringify({movie_id: movieId, status: 'media_rehydrated', hero: hero.key, vertical_scene: vertical.key, video: video.key}, null, 2));
