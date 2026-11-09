import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RECOVERY_MOVIE_IDS, RECOVERY_RUN_ID, recoverReviewedSourceBinding} from '../scripts/editorial/lib/recover23-source-binding.mjs';

const digest = (text) => createHash('sha256').update(text).digest('hex');
const movieId = 'KNMB-131';
const sourceRel = `data/source-records/${movieId}.json`;
const searchRel = `data/search-content/${movieId}.json`;
const reviewRel = `content/reviews/${movieId}.md`;
const fixture = async (root) => {
  for (const path of ['data/source-records', 'data/search-content', 'content/reviews']) await mkdir(join(root, path), {recursive: true});
  const sourceText = `${JSON.stringify({id: movieId, title: '來源事實', source_relations: {performers: []}}, null, 2)}\n`;
  const previousSourceHash = `sha256:${'1'.repeat(64)}`;
  const searchText = `${JSON.stringify({schema_version: 1, movie_id: movieId, generated_at: '2026-09-06T00:00:00Z', source_snapshot_hash: previousSourceHash, quick_decision: {thesis: '既有內容不變'}}, null, 2)}\n`;
  const reviewText = `---\nid: ${movieId}\nstatus: draft\n---\n\n## 保留原稿\n\n既有文章。\n`;
  await Promise.all([
    writeFile(join(root, sourceRel), sourceText), writeFile(join(root, searchRel), searchText), writeFile(join(root, reviewRel), reviewText),
  ]);
  const manifest = {
    schema_version: 1,
    source_run_id: RECOVERY_RUN_ID,
    records: [{movie_id: movieId, source_sha256: digest(sourceText), search_sha256: digest(searchText), review_sha256: digest(reviewText), previous_source_snapshot_hash: previousSourceHash}],
  };
  return {manifest, sourceText, searchText, reviewText, previousSourceHash};
};
const temporary = async (body) => {
  const root = await mkdtemp(join(tmpdir(), 'cc18-recover23-'));
  try { await body(root); } finally { await rm(root, {recursive: true, force: true}); }
};

test('allowlist is exactly the 21 snapshot-binding failures, excluding the two missing drafts', () => {
  assert.equal(RECOVERY_RUN_ID, 42413107999);
  assert.equal(RECOVERY_MOVIE_IDS.length, 21);
  assert.equal(new Set(RECOVERY_MOVIE_IDS).size, 21);
  assert.ok(!RECOVERY_MOVIE_IDS.includes('START-617'));
  assert.ok(!RECOVERY_MOVIE_IDS.includes('START-650'));
});

test('reviewed recovery replaces only the hash, preserves source and article, and is idempotent', () => temporary(async (root) => {
  const {manifest, sourceText, searchText, reviewText, previousSourceHash} = await fixture(root);
  const first = await recoverReviewedSourceBinding({root, movieId, manifest});
  assert.equal(first.changed, true);
  const expected = searchText.replace(previousSourceHash, `sha256:${digest(sourceText)}`);
  assert.equal(await readFile(join(root, searchRel), 'utf8'), expected);
  assert.equal(await readFile(join(root, sourceRel), 'utf8'), sourceText);
  assert.equal(await readFile(join(root, reviewRel), 'utf8'), reviewText);
  const second = await recoverReviewedSourceBinding({root, movieId, manifest});
  assert.equal(second.changed, false);
  assert.equal(second.reason, 'binding_already_current');
  assert.equal(await readFile(join(root, searchRel), 'utf8'), expected);
}));

test('a work outside the reviewed records is skipped without reading or creating its files', () => temporary(async (root) => {
  const {manifest} = await fixture(root);
  for (const target of ['SDNM-560', 'START-617', 'OTHER-001']) {
    assert.deepEqual(await recoverReviewedSourceBinding({root, movieId: target, manifest}), {movie_id: target, changed: false, reason: 'not_targeted'});
  }
}));

test('any reviewed source, article, or Search Content byte change fails before any hash write', async (t) => {
  for (const [path, label] of [[sourceRel, 'source'], [reviewRel, 'review'], [searchRel, 'search']]) {
    await t.test(label, () => temporary(async (root) => {
      const {manifest} = await fixture(root);
      await writeFile(join(root, path), `${await readFile(join(root, path), 'utf8')}\n`);
      const before = await readFile(join(root, searchRel), 'utf8');
      await assert.rejects(recoverReviewedSourceBinding({root, movieId, manifest}), new RegExp(`${label} bytes differ`));
      assert.equal(await readFile(join(root, searchRel), 'utf8'), before);
    }));
  }
});

test('an already current binding is left to normal QA without changing other Search fields', () => temporary(async (root) => {
  const {manifest} = await fixture(root);
  await recoverReviewedSourceBinding({root, movieId, manifest});
  const changed = (await readFile(join(root, searchRel), 'utf8')).replace('既有內容不變', '未經審閱的新內容');
  await writeFile(join(root, searchRel), changed);
  const result = await recoverReviewedSourceBinding({root, movieId, manifest});
  assert.equal(result.reason, 'binding_already_current');
  assert.equal(result.changed, false);
  assert.equal(await readFile(join(root, searchRel), 'utf8'), changed);
}));

test('a completed binding repair does not block later approval dates or R2 metadata', () => temporary(async (root) => {
  const {manifest, reviewText} = await fixture(root);
  await recoverReviewedSourceBinding({root, movieId, manifest});
  const approved = reviewText.replace('status: draft', 'status: published\npublishedAt: 2026-11-09\nvideoStatus: rendered\nvideoUrl: /media/verified.mp4');
  await writeFile(join(root, reviewRel), approved);
  const before = await readFile(join(root, searchRel), 'utf8');
  const result = await recoverReviewedSourceBinding({root, movieId, manifest});
  assert.equal(result.reason, 'binding_already_current');
  assert.equal(result.changed, false);
  assert.equal(await readFile(join(root, reviewRel), 'utf8'), approved);
  assert.equal(await readFile(join(root, searchRel), 'utf8'), before);
}));

test('a later source change with an old binding is still rejected without a write', () => temporary(async (root) => {
  const {manifest, sourceText} = await fixture(root);
  await recoverReviewedSourceBinding({root, movieId, manifest});
  await writeFile(join(root, sourceRel), sourceText.replace('來源事實', '不同的來源事實'));
  const before = await readFile(join(root, searchRel), 'utf8');
  await assert.rejects(recoverReviewedSourceBinding({root, movieId, manifest}), /source bytes differ/);
  assert.equal(await readFile(join(root, searchRel), 'utf8'), before);
}));

test('manifest cannot extend the migration to other works or silently accept duplicate entries', async (t) => {
  for (const kind of ['other_run', 'unrelated_id', 'duplicate', 'invalid_hash', 'old_hash_mismatch']) {
    await t.test(kind, () => temporary(async (root) => {
      const {manifest, searchText} = await fixture(root);
      if (kind === 'other_run') manifest.source_run_id += 1;
      if (kind === 'unrelated_id') manifest.records.push({...manifest.records[0], movie_id: 'OTHER-001'});
      if (kind === 'duplicate') manifest.records.push({...manifest.records[0]});
      if (kind === 'invalid_hash') manifest.records[0].review_sha256 = 'invalid';
      if (kind === 'old_hash_mismatch') manifest.records[0].previous_source_snapshot_hash = `sha256:${'2'.repeat(64)}`;
      await assert.rejects(recoverReviewedSourceBinding({root, movieId, manifest}), /reviewed source binding recovery/);
      assert.equal(await readFile(join(root, searchRel), 'utf8'), searchText);
    }));
  }
});

test('exact byte pins do not override work identity or a malformed hash field', async (t) => {
  for (const kind of ['source_id', 'search_id', 'duplicate_hash']) {
    await t.test(kind, () => temporary(async (root) => {
      const {manifest, sourceText, searchText} = await fixture(root);
      let nextSource = sourceText;
      let nextSearch = searchText;
      if (kind === 'source_id') nextSource = sourceText.replace(movieId, 'OTHER-001');
      if (kind === 'search_id') nextSearch = searchText.replace(movieId, 'OTHER-001');
      if (kind === 'duplicate_hash') nextSearch = searchText.replace('  "source_snapshot_hash":', `  "source_snapshot_hash": "sha256:${'3'.repeat(64)}",\n  "source_snapshot_hash":`);
      await writeFile(join(root, sourceRel), nextSource);
      await writeFile(join(root, searchRel), nextSearch);
      manifest.records[0].source_sha256 = digest(nextSource);
      manifest.records[0].search_sha256 = digest(nextSearch);
      await assert.rejects(recoverReviewedSourceBinding({root, movieId, manifest}), /identity mismatch|exactly one canonical/);
      assert.equal(await readFile(join(root, searchRel), 'utf8'), nextSearch);
    }));
  }
});

test('missing draft or source remains a hard error and does not change Search Content', async (t) => {
  for (const path of [reviewRel, sourceRel]) {
    await t.test(path, () => temporary(async (root) => {
      const {manifest, searchText} = await fixture(root);
      await rm(join(root, path));
      await assert.rejects(recoverReviewedSourceBinding({root, movieId, manifest}), {code: 'ENOENT'});
      assert.equal(await readFile(join(root, searchRel), 'utf8'), searchText);
    }));
  }
});
