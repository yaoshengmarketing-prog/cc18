import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildArtworkPrompts} from '../image/lib/artwork-prompt.mjs';

const movieId = process.argv[2]?.trim().toUpperCase();
if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId ?? '')) {
  throw new Error('Usage: node scripts/r2/rebuild-media-metadata.mjs MOVIE-ID');
}
const root = resolve(import.meta.dirname, '..', '..');
const readJson = (path) => readFile(resolve(root, path), 'utf8').then(JSON.parse);
const [source, editorial, manifest, config] = await Promise.all([
  readJson(`data/source-records/${movieId}.json`),
  readJson(`data/editorial-briefs/${movieId}.json`),
  readJson(`data/media-manifests/${movieId}.json`),
  readJson('config/image-model.json'),
]);
if (manifest.id !== movieId || manifest.video?.status !== 'rendered_and_uploaded') {
  throw new Error(`${movieId}: a rendered and uploaded media manifest is required`);
}
for (const role of ['article_hero', 'vertical_scene']) {
  const asset = manifest.assets?.find((item) => item.role === role);
  if (!asset?.r2_key || !asset?.sha256 || !asset?.bytes) throw new Error(`${movieId}: ${role} is not hash verified`);
}
if (!manifest.video?.target_r2_key || !manifest.video?.sha256 || !manifest.video?.bytes) {
  throw new Error(`${movieId}: video is not hash verified`);
}
const imageBrief = {
  schema_version: 1,
  movie_id: movieId,
  created_at: new Date().toISOString(),
  provider: config.provider,
  model: config.model,
  artwork_policy: 'original_non_explicit_no_real_person_likeness',
  prompts: buildArtworkPrompts({source, localCreativeBrief: editorial.local_creative_brief}),
  recovery: 'reconstructed_from_hash_verified_media_manifest',
};
await mkdir(resolve(root, 'data', 'image-briefs'), {recursive: true});
await writeFile(resolve(root, 'data', 'image-briefs', `${movieId}.json`), `${JSON.stringify(imageBrief, null, 2)}\n`, 'utf8');
const props = spawnSync(process.execPath, [resolve(root, 'scripts/video/build-props.mjs'), movieId], {
  cwd: root,
  env: process.env,
  encoding: 'utf8',
  stdio: 'inherit',
});
if (props.status !== 0) throw new Error(`${movieId}: media props could not be rebuilt`);
console.log(JSON.stringify({movie_id: movieId, status: 'media_metadata_rebuilt'}));
