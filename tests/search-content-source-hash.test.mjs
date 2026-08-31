import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceSnapshotHash} from '../scripts/editorial/lib/search-content.mjs';
import {refreshSearchContentSourceHashes} from '../scripts/editorial/refresh-search-content-source-hash.mjs';

const expectedHash = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;

const fixture = async (root, id, {sourceId = id, searchId = id} = {}) => {
  await mkdir(join(root, 'data', 'source-records'), {recursive: true});
  await mkdir(join(root, 'data', 'search-content'), {recursive: true});
  const sourceText = `${JSON.stringify({id: sourceId, title: '來源'}, null, 2)}\n`;
  const searchText = `${JSON.stringify({
    schema_version: 1,
    movie_id: searchId,
    generated_at: '2026-01-01T00:00:00.000Z',
    source_snapshot_hash: `sha256:${'0'.repeat(64)}`,
    quick_decision: {thesis: '保持不變'},
  }, null, 2)}\n`;
  await writeFile(join(root, 'data', 'source-records', `${id}.json`), sourceText);
  await writeFile(join(root, 'data', 'search-content', `${id}.json`), searchText);
  return {sourceText, searchText};
};

test('sourceSnapshotHash exactly preserves the formal raw-text algorithm', () => {
  const text = '{\n  "id": "TEST-001"\n}\n';
  assert.equal(sourceSnapshotHash(text), expectedHash(text));
  assert.notEqual(sourceSnapshotHash(`${text}\n`), sourceSnapshotHash(text), 'any raw Source Record change must stale the prior hash');
});

test('hash-only refresh changes only the hash and is idempotent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc18-source-hash-'));
  try {
    const {sourceText, searchText} = await fixture(root, 'TEST-001');
    const first = await refreshSearchContentSourceHashes({root, targets: ['TEST-001']});
    assert.equal(first.changed, 1);
    const updated = await readFile(join(root, 'data', 'search-content', 'TEST-001.json'), 'utf8');
    assert.equal(updated, searchText.replace(`sha256:${'0'.repeat(64)}`, expectedHash(sourceText)));
    assert.match(updated, /"generated_at": "2026-01-01T00:00:00\.000Z"/u);
    const second = await refreshSearchContentSourceHashes({root, targets: ['TEST-001']});
    assert.equal(second.changed, 0);
    assert.equal(await readFile(join(root, 'data', 'search-content', 'TEST-001.json'), 'utf8'), updated);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('preflights every target before writing any Search Content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc18-source-hash-preflight-'));
  try {
    const {searchText} = await fixture(root, 'GOOD-001');
    await fixture(root, 'BAD-002', {searchId: 'OTHER-999'});
    await assert.rejects(
      refreshSearchContentSourceHashes({root, targets: ['GOOD-001', 'BAD-002']}),
      /Search Content identity mismatch/u,
    );
    assert.equal(await readFile(join(root, 'data', 'search-content', 'GOOD-001.json'), 'utf8'), searchText);
    await assert.rejects(refreshSearchContentSourceHashes({root, targets: ['GOOD-001', 'GOOD-001']}), /Duplicate catalog code/u);
    await assert.rejects(refreshSearchContentSourceHashes({root, targets: ['bad-001']}), /Invalid catalog code/u);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('missing Source Record or Search Content causes zero writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc18-source-hash-missing-'));
  try {
    const {searchText} = await fixture(root, 'GOOD-001');
    await assert.rejects(refreshSearchContentSourceHashes({root, targets: ['GOOD-001', 'MISS-002']}), /Source Record not found/u);
    assert.equal(await readFile(join(root, 'data', 'search-content', 'GOOD-001.json'), 'utf8'), searchText);
    await mkdir(join(root, 'data', 'source-records'), {recursive: true});
    await writeFile(join(root, 'data', 'source-records', 'MISS-003.json'), '{"id":"MISS-003"}\n');
    await assert.rejects(refreshSearchContentSourceHashes({root, targets: ['GOOD-001', 'MISS-003']}), /Search Content not found/u);
    assert.equal(await readFile(join(root, 'data', 'search-content', 'GOOD-001.json'), 'utf8'), searchText);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('duplicate or non-canonical hash fields fail before any write', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc18-source-hash-field-'));
  try {
    const {searchText} = await fixture(root, 'GOOD-001');
    await fixture(root, 'BAD-002');
    const badPath = join(root, 'data', 'search-content', 'BAD-002.json');
    const duplicate = (await readFile(badPath, 'utf8')).replace(
      '  "source_snapshot_hash":',
      `  "source_snapshot_hash_copy": "sha256:${'1'.repeat(64)}",\n  "source_snapshot_hash":`,
    ).replace('"source_snapshot_hash_copy"', '"source_snapshot_hash"');
    await writeFile(badPath, duplicate);
    await assert.rejects(refreshSearchContentSourceHashes({root, targets: ['GOOD-001', 'BAD-002']}), /exactly one canonical source_snapshot_hash/u);
    assert.equal(await readFile(join(root, 'data', 'search-content', 'GOOD-001.json'), 'utf8'), searchText);
  } finally { await rm(root, {recursive: true, force: true}); }
});
