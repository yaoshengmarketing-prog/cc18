import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {refreshSearchContentSourceHashes} from '../refresh-search-content-source-hash.mjs';

export const RECOVERY_RUN_ID = 42413107999;
export const RECOVERY_MOVIE_IDS = Object.freeze([
  'KNMB-131', 'SDNM-560', 'START-621', 'SDMM-238', 'PRIAN-058', 'PRIAN-055',
  'SDAM-179', 'FTKD-041', 'APNS-419', 'TPNS-037', 'CEAD-763', 'CEMD-880',
  'RGAV-005', 'TLDC-064', 'SNOS-290', 'HEYZO-3917', 'DSOD-061', 'SNOS-333',
  'DSOD-069', 'DSOD-054', 'ROE-541',
]);
const allowedIds = new Set(RECOVERY_MOVIE_IDS);
const digest = (text) => createHash('sha256').update(text).digest('hex');
const hashField = /^  "source_snapshot_hash": "(sha256:[a-f0-9]{64})",?$/gmu;
const fail = (movieId, message) => { throw new Error(`${movieId}: reviewed source binding recovery ${message}`); };

const reviewedEntry = (manifest, movieId) => {
  if (manifest?.schema_version !== 1 || manifest?.source_run_id !== RECOVERY_RUN_ID
    || !Array.isArray(manifest.records) || !manifest.records.length) {
    fail(movieId, 'manifest is invalid');
  }
  const seen = new Set();
  for (const entry of manifest.records) {
    if (!allowedIds.has(entry?.movie_id) || seen.has(entry.movie_id)) {
      fail(movieId, 'manifest contains an unrelated or duplicate work');
    }
    seen.add(entry.movie_id);
    for (const field of ['source_sha256', 'search_sha256', 'review_sha256']) {
      if (!/^[a-f0-9]{64}$/u.test(entry[field] ?? '')) fail(movieId, `manifest has invalid ${field}`);
    }
    if (!/^sha256:[a-f0-9]{64}$/u.test(entry.previous_source_snapshot_hash ?? '')) {
      fail(movieId, 'manifest has invalid previous_source_snapshot_hash');
    }
  }
  return manifest.records.find((entry) => entry.movie_id === movieId) ?? null;
};

// The manifest is a reviewed, repository-controlled allowlist of exact bytes.
// A passing automated QA report alone does not authorize adding a manifest entry.
export async function recoverReviewedSourceBinding({root, movieId, manifest}) {
  const entry = reviewedEntry(manifest, movieId);
  if (!entry) return {movie_id: movieId, changed: false, reason: 'not_targeted'};
  const sourcePath = resolve(root, 'data', 'source-records', `${movieId}.json`);
  const searchPath = resolve(root, 'data', 'search-content', `${movieId}.json`);
  const reviewPath = resolve(root, 'content', 'reviews', `${movieId}.md`);
  const [sourceText, searchText, reviewText] = await Promise.all([
    readFile(sourcePath, 'utf8'), readFile(searchPath, 'utf8'), readFile(reviewPath, 'utf8'),
  ]);
  const source = JSON.parse(sourceText);
  const search = JSON.parse(searchText);
  if (source.id !== movieId || search.movie_id !== movieId) fail(movieId, 'artifact identity mismatch');
  const matches = [...searchText.matchAll(hashField)];
  if (matches.length !== 1 || search.source_snapshot_hash !== matches[0][1]) {
    fail(movieId, 'requires exactly one canonical source_snapshot_hash field');
  }
  const match = matches[0];
  const actualSourceHash = digest(sourceText);
  // This migration has no work to do when the binding is already current.
  // Approval and R2 recovery may have changed review metadata since the first
  // repair. The existing fresh QA still validates those artifacts afterwards.
  if (match[1] === `sha256:${actualSourceHash}`) {
    return {movie_id: movieId, changed: false, reason: 'binding_already_current', source_sha256: actualSourceHash};
  }
  if (actualSourceHash !== entry.source_sha256) fail(movieId, 'source bytes differ from reviewed snapshot');
  if (digest(reviewText) !== entry.review_sha256) fail(movieId, 'review bytes differ from reviewed snapshot');
  const replaceHash = (value) => `${searchText.slice(0, match.index)}${match[0].replace(match[1], value)}${searchText.slice(match.index + match[0].length)}`;
  const nextSourceHash = `sha256:${entry.source_sha256}`;
  const currentSearchHash = digest(searchText);
  if (currentSearchHash !== entry.search_sha256) fail(movieId, 'search bytes differ from reviewed snapshot');
  if (match[1] !== entry.previous_source_snapshot_hash) fail(movieId, 'previous source hash differs from manifest');
  const expectedSearchText = replaceHash(nextSourceHash);
  await refreshSearchContentSourceHashes({root, targets: [movieId]});
  const repairedSearchText = await readFile(searchPath, 'utf8');
  if (repairedSearchText !== expectedSearchText) fail(movieId, 'did not produce the exact hash-only replacement');
  return {
    movie_id: movieId,
    changed: repairedSearchText !== searchText,
    reason: repairedSearchText !== searchText ? 'reviewed_hash_rebound' : 'already_rebound',
    source_sha256: entry.source_sha256,
    previous_search_sha256: entry.search_sha256,
    search_sha256: digest(repairedSearchText),
    review_sha256: entry.review_sha256,
  };
}
