import {createHash} from 'node:crypto';
import {lstat, mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

const SOURCE_RUN_ID = 42413107999;
const ORIGINALS = Object.freeze({
  'START-617': Object.freeze({
    source: 'ee2ea47777329b5eebece6deae7d9e7b7dea8c842aadc86968669176fd334523',
    response: '3da5061885172278e8cefbd7c9eb5906281254823ab8f8bc0c164aed6a01fde7',
  }),
  'START-650': Object.freeze({
    source: '4d0aa70b9192324706b6f891452fc81d9a74aea831b47bb8b92a489adb99460b',
    response: '9f6c03fb10e6193b7a7a66605ef1d940e24b9ce3d5d097a64f7df40d8912a708',
  }),
});
const BUNDLE_NAMES = Object.freeze({
  source: 'source-record.json',
  brief: 'editorial-brief.json',
  review: 'review.md',
  quality: 'review-quality.json',
  search: 'search-content.json',
  registry: 'registry-record.json',
  tags: 'tag-candidates.json',
  response: 'original-response.json',
});
const HASH = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const labelKey = (label) => label.normalize('NFKC').trim();
const fail = (code, detail) => {
  throw Object.assign(new Error(`Missing editorial recovery ${code}: ${detail}`), {
    code: `MISSING_EDITORIAL_RECOVERY_${code}`,
  });
};

export function isMissingEditorialRecoveryMovie(movieId) {
  return typeof movieId === 'string' && Object.hasOwn(ORIGINALS, movieId);
}

async function optionalFile(path) {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('NON_REGULAR_FILE', path);
    return await readFile(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function requiredFile(path) {
  const bytes = await optionalFile(path);
  if (bytes === null) fail('MISSING_FILE', path);
  return bytes;
}

function parse(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('INVALID_JSON', label);
  }
}

function validateManifest(manifest) {
  if (manifest?.schema_version !== 1 || manifest.source_run_id !== SOURCE_RUN_ID
      || manifest.origin_run_id !== 41805284692 || manifest.origin_artifact_id !== 13312462409
      || manifest.origin_artifact_sha256 !== 'db04fb9818979f4600d9dca4bc735d0a2c5c6744e857f8588c16f0bc15373938'
      || !Array.isArray(manifest.records) || manifest.records.length !== 2) {
    fail('INVALID_MANIFEST', 'expected the reviewed two-work recovery batch');
  }
  const seen = new Set();
  for (const record of manifest.records) {
    const id = record?.movie_id;
    if (!isMissingEditorialRecoveryMovie(id) || seen.has(id)) fail('INVALID_MANIFEST', 'unexpected or duplicate work');
    seen.add(id);
    if (Object.keys(record).some((key) => !['movie_id', 'source_sha256', 'original_response_sha256', 'files'].includes(key))
        || record.source_sha256 !== ORIGINALS[id].source
        || record.original_response_sha256 !== ORIGINALS[id].response
        || !record.files || typeof record.files !== 'object' || Array.isArray(record.files)
        || Object.keys(record.files).length !== Object.keys(BUNDLE_NAMES).length
        || Object.keys(record.files).some((key) => !Object.hasOwn(BUNDLE_NAMES, key))
        || Object.keys(BUNDLE_NAMES).some((key) => !HASH.test(record.files[key] ?? ''))
        || record.files.source !== ORIGINALS[id].source || record.files.response !== ORIGINALS[id].response) {
      fail('INVALID_MANIFEST', id);
    }
  }
}

function validatePayloads({movieId, bytes, payload}) {
  const {source, brief, quality, search, registry, tags, response} = payload;
  const frontmatter = bytes.review.toString('utf8').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? '';
  if (source?.id !== movieId || brief?.id !== movieId || quality?.id !== movieId
      || search?.movie_id !== movieId || registry?.id !== movieId || tags?.movie_id !== movieId
      || response?.movie_id !== movieId || !new RegExp(`^id: ${movieId}$`, 'm').test(frontmatter)) {
    fail('IDENTITY_MISMATCH', movieId);
  }
  if (!/^status: draft$/m.test(frontmatter) || !/^titleVersion: 1$/m.test(frontmatter)
      || registry.review_status !== 'draft' || quality.approved_for_publish !== false
      || quality.review_sha256 !== hash(bytes.review)
      || search.source_snapshot_hash !== `sha256:${ORIGINALS[movieId].source}`
      || response.source_sha256 !== ORIGINALS[movieId].source
      || typeof response.generation?.text !== 'string' || !response.generation.text.trim()
      || brief.generation_model !== response.generation?.usage?.model
      || !Array.isArray(brief.sections) || !brief.sections.length
      || registry.source_url !== source.source_url || registry.release_date !== source.release_date
      || JSON.stringify(registry.actress) !== JSON.stringify(source.actress)) {
    fail('INVALID_PAYLOAD', movieId);
  }
  if (!Array.isArray(tags.candidates) || !Array.isArray(source.source_tags)) fail('INVALID_TAG_PATCH', movieId);
  const sourceLabels = new Set(source.source_tags.map(labelKey));
  const seen = new Set();
  for (const candidate of tags.candidates) {
    if (typeof candidate?.label !== 'string') fail('INVALID_TAG_PATCH', movieId);
    const key = labelKey(candidate.label);
    if (!key || !sourceLabels.has(key) || seen.has(key)
        || candidate.status !== 'quarantined' || candidate.occurrences !== 1
        || !Array.isArray(candidate.source_ids) || candidate.source_ids.length !== 1 || candidate.source_ids[0] !== movieId
        || !DATE.test(candidate.first_seen ?? '') || !DATE.test(candidate.last_seen ?? '')
        || candidate.first_seen > candidate.last_seen) fail('INVALID_TAG_PATCH', movieId);
    seen.add(key);
  }
}

/** Restore only the two reviewed, missing drafts. This never runs a writer or changes D1. */
export async function recoverMissingEditorial({root, movieId, currentSourceText}) {
  if (!isMissingEditorialRecoveryMovie(movieId)) return {movie_id: movieId, restored: false, reason: 'not_targeted'};
  const base = resolve(root);
  const destinations = {
    source: resolve(base, 'data', 'source-records', `${movieId}.json`),
    brief: resolve(base, 'data', 'editorial-briefs', `${movieId}.json`),
    quality: resolve(base, 'data', 'review-quality', `${movieId}.json`),
    search: resolve(base, 'data', 'search-content', `${movieId}.json`),
    review: resolve(base, 'content', 'reviews', `${movieId}.md`),
  };
  if (await optionalFile(destinations.review) !== null) return {movie_id: movieId, restored: false, reason: 'review_exists'};
  if (typeof currentSourceText !== 'string' || hash(currentSourceText) !== ORIGINALS[movieId].source) {
    fail('CURRENT_SOURCE_MISMATCH', movieId);
  }

  const manifest = parse(await requiredFile(resolve(base, 'config', 'recover23-missing-editorial.json')), 'recovery manifest');
  validateManifest(manifest);
  const record = manifest.records.find((entry) => entry.movie_id === movieId);
  const bundle = resolve(base, 'data', 'editorial-recovery', String(SOURCE_RUN_ID), movieId);
  const bytes = {};
  for (const [key, filename] of Object.entries(BUNDLE_NAMES)) {
    bytes[key] = await requiredFile(resolve(bundle, filename));
    if (hash(bytes[key]) !== record.files[key]) fail('BUNDLE_HASH_MISMATCH', `${movieId}/${filename}`);
  }
  const payload = Object.fromEntries(Object.keys(BUNDLE_NAMES).filter((key) => key !== 'review').map((key) => [key, parse(bytes[key], key)]));
  validatePayloads({movieId, bytes, payload});

  const missing = [];
  for (const [key, path] of Object.entries(destinations)) {
    const existing = await optionalFile(path);
    if (existing !== null && !existing.equals(bytes[key])) fail('EXISTING_FILE_DIFFERS', path);
    if (existing === null) missing.push(key);
  }
  const registryPath = resolve(base, 'data', 'movie-registry.json');
  const tagsPath = resolve(base, 'data', 'tag-candidates.json');
  const registryBefore = await requiredFile(registryPath);
  const tagsBefore = await requiredFile(tagsPath);
  const registry = parse(registryBefore, 'registry');
  const tags = parse(tagsBefore, 'tag candidates');
  const taxonomy = parse(await requiredFile(resolve(base, 'data', 'taxonomy.json')), 'taxonomy');
  if (registry?.schema_version !== 1 || !Array.isArray(registry.records)
      || tags?.schema_version !== 1 || !Array.isArray(tags.candidates)
      || !taxonomy?.source_tag_map || typeof taxonomy.source_tag_map !== 'object' || Array.isArray(taxonomy.source_tag_map)
      || !Array.isArray(taxonomy.ignored_source_tags)) fail('INVALID_CURRENT_DATA', movieId);
  const existingRecords = registry.records.filter((entry) => entry.id === movieId);
  if (existingRecords.length > 1) fail('DUPLICATE_REGISTRY_RECORD', movieId);
  const existingRecord = existingRecords[0];
  if (existingRecord && existingRecord.review_status !== 'draft') fail('REGISTRY_NOT_DRAFT', movieId);
  if (existingRecord && (existingRecord.source_url !== payload.source.source_url
      || existingRecord.release_date !== payload.source.release_date)) fail('REGISTRY_SOURCE_MISMATCH', movieId);
  const registryAdded = !existingRecord;
  if (registryAdded) {
    registry.records.push(payload.registry);
    registry.updated_at = new Date().toISOString();
  }

  const handled = new Set([...Object.keys(taxonomy.source_tag_map), ...taxonomy.ignored_source_tags].map(labelKey));
  let tagCandidatesChanged = 0;
  for (const candidate of payload.tags.candidates) {
    const key = labelKey(candidate.label);
    if (handled.has(key)) continue;
    const matches = tags.candidates.filter((entry) => typeof entry.label === 'string' && labelKey(entry.label) === key);
    if (matches.length > 1) fail('DUPLICATE_TAG_CANDIDATE', movieId);
    const existing = matches[0];
    if (!existing) {
      tags.candidates.push(candidate);
      tagCandidatesChanged += 1;
    } else {
      if (!Array.isArray(existing.source_ids) || existing.source_ids.some((id) => typeof id !== 'string')) fail('INVALID_CURRENT_TAG', movieId);
      if (!existing.source_ids.includes(movieId)) {
        existing.source_ids = [...new Set([...existing.source_ids, movieId])];
        existing.occurrences = existing.source_ids.length;
        existing.last_seen = [existing.last_seen, candidate.last_seen].filter(Boolean).sort().at(-1);
        tagCandidatesChanged += 1;
      }
    }
  }

  // Finish every integrity, identity, state and conflict check before the first write.
  if (!(await requiredFile(registryPath)).equals(registryBefore) || !(await requiredFile(tagsPath)).equals(tagsBefore)) {
    fail('CONCURRENT_CHANGE', movieId);
  }
  for (const [key, path] of Object.entries(destinations)) {
    const current = await optionalFile(path);
    if (missing.includes(key) ? current !== null : current === null || !current.equals(bytes[key])) fail('CONCURRENT_CHANGE', path);
  }

  // An interrupted attempt can resume from identical files. The review is the final marker.
  for (const key of missing.filter((entry) => entry !== 'review')) {
    await mkdir(dirname(destinations[key]), {recursive: true});
    await writeFile(destinations[key], bytes[key], {flag: 'wx'});
  }
  if (registryAdded) await writeFile(registryPath, jsonText(registry));
  if (tagCandidatesChanged) await writeFile(tagsPath, jsonText(tags));
  await mkdir(dirname(destinations.review), {recursive: true});
  await writeFile(destinations.review, bytes.review, {flag: 'wx'});
  return {movie_id: movieId, restored: true, files_restored: missing, registry_added: registryAdded, tag_candidates_changed: tagCandidatesChanged};
}
