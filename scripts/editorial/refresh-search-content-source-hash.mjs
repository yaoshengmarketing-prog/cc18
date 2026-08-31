import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sourceSnapshotHash} from './lib/search-content.mjs';

const CATALOG_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/u;
const HASH_FIELD_PATTERN = /^  "source_snapshot_hash": "(sha256:[a-f0-9]{64})",?$/gmu;

const fail = (message) => { throw new Error(message); };

const validateTargets = (targets) => {
  if (!Array.isArray(targets) || targets.length === 0) fail('At least one explicit catalog code is required');
  const seen = new Set();
  for (const target of targets) {
    if (typeof target !== 'string' || !CATALOG_CODE_PATTERN.test(target)) {
      fail(`Invalid catalog code: ${JSON.stringify(target)}`);
    }
    if (seen.has(target)) fail(`Duplicate catalog code: ${target}`);
    seen.add(target);
  }
};

const preflightTarget = async ({root, target}) => {
  const sourcePath = resolve(root, 'data', 'source-records', `${target}.json`);
  const searchPath = resolve(root, 'data', 'search-content', `${target}.json`);
  let sourceText;
  let searchText;
  try { sourceText = await readFile(sourcePath, 'utf8'); } catch (error) {
    if (error?.code === 'ENOENT') fail(`${target}: Source Record not found`);
    throw error;
  }
  try { searchText = await readFile(searchPath, 'utf8'); } catch (error) {
    if (error?.code === 'ENOENT') fail(`${target}: Search Content not found`);
    throw error;
  }

  let source;
  let search;
  try { source = JSON.parse(sourceText); } catch { fail(`${target}: Source Record is not valid JSON`); }
  try { search = JSON.parse(searchText); } catch { fail(`${target}: Search Content is not valid JSON`); }
  if (source?.id !== target) fail(`${target}: Source Record identity mismatch`);
  if (search?.movie_id !== target) fail(`${target}: Search Content identity mismatch`);

  const matches = [...searchText.matchAll(HASH_FIELD_PATTERN)];
  if (matches.length !== 1 || search.source_snapshot_hash !== matches[0][1]) {
    fail(`${target}: Search Content must contain exactly one canonical source_snapshot_hash field`);
  }
  const nextHash = sourceSnapshotHash(sourceText);
  const currentHash = matches[0][1];
  const nextText = currentHash === nextHash
    ? searchText
    : `${searchText.slice(0, matches[0].index)}${matches[0][0].replace(currentHash, nextHash)}${searchText.slice(matches[0].index + matches[0][0].length)}`;
  return {target, searchPath, currentHash, nextHash, searchText, nextText};
};

export async function refreshSearchContentSourceHashes({root, targets}) {
  validateTargets(targets);
  const plans = [];
  for (const target of targets) plans.push(await preflightTarget({root, target}));
  let changed = 0;
  for (const plan of plans) {
    if (plan.nextText === plan.searchText) continue;
    await writeFile(plan.searchPath, plan.nextText, 'utf8');
    changed += 1;
  }
  return {targets: plans.length, changed, results: plans.map(({target, currentHash, nextHash}) => ({target, currentHash, nextHash}))};
}

const main = async () => {
  const root = resolve(import.meta.dirname, '../..');
  const result = await refreshSearchContentSourceHashes({root, targets: process.argv.slice(2)});
  console.log(`Search Content source hash refresh complete: ${result.targets} target(s), ${result.changed} file(s) changed.`);
};

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
