import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {isMissingEditorialRecoveryMovie, recoverMissingEditorial} from '../scripts/editorial/lib/recover-missing-editorial.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const manifestPath = 'config/recover23-missing-editorial.json';
const bundleRoot = 'data/editorial-recovery/42413107999';
const movieIds = ['START-617', 'START-650'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};
const destinationPaths = (movieId) => ({
  source: `data/source-records/${movieId}.json`,
  brief: `data/editorial-briefs/${movieId}.json`,
  review: `content/reviews/${movieId}.md`,
  quality: `data/review-quality/${movieId}.json`,
  search: `data/search-content/${movieId}.json`,
});
const bundleNames = {
  source: 'source-record.json',
  brief: 'editorial-brief.json',
  review: 'review.md',
  quality: 'review-quality.json',
  search: 'search-content.json',
  registry: 'registry-record.json',
  tags: 'tag-candidates.json',
  response: 'original-response.json',
};

async function fixture(t, {withBundle = true} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cc18-missing-editorial-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  if (withBundle) {
    await mkdir(join(root, 'config'), {recursive: true});
    await cp(join(repoRoot, manifestPath), join(root, manifestPath));
    await cp(join(repoRoot, bundleRoot), join(root, bundleRoot), {recursive: true});
    await cp(join(repoRoot, 'data/taxonomy.json'), join(root, 'data/taxonomy.json'));
    await writeJson(join(root, 'data/movie-registry.json'), {
      schema_version: 1,
      updated_at: '2026-10-01T00:00:00.000Z',
      records: [{id: 'OTHER-001', review_status: 'published', keep: 'unrelated registry data'}],
    });
    await writeJson(join(root, 'data/tag-candidates.json'), {
      schema_version: 1,
      policy: 'retain existing policy',
      candidates: [{
        label: 'unrelated-test-label',
        source_ids: ['OTHER-001'],
        occurrences: 1,
        first_seen: '2026-10-01',
        last_seen: '2026-10-01',
        status: 'quarantined',
        keep: 'unrelated tag data',
      }],
    });
  }
  return root;
}

async function snapshot(root) {
  const entries = [];
  async function walk(relativePath = '') {
    for (const entry of (await readdir(join(root, relativePath), {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        entries.push([path, 'directory']);
        await walk(path);
      } else {
        entries.push([path, 'file', sha256(await readFile(join(root, path)))]);
      }
    }
  }
  await walk();
  return entries;
}

const sourceText = (root, id) => readFile(join(root, bundleRoot, id, bundleNames.source), 'utf8');
const bundleJson = (root, id, key) => json(join(root, bundleRoot, id, bundleNames[key]));

async function rejectWithoutWrites(root, operation) {
  const before = await snapshot(root);
  await assert.rejects(operation);
  assert.deepEqual(await snapshot(root), before, 'a rejected recovery must not change or create any file or directory');
}

async function modifyBundleAndRepin(root, id, key, modify) {
  const path = join(root, bundleRoot, id, bundleNames[key]);
  const payload = await json(path);
  await writeJson(path, modify(payload));
  const manifest = await json(join(root, manifestPath));
  manifest.records.find((record) => record.movie_id === id).files[key] = sha256(await readFile(path));
  await writeJson(join(root, manifestPath), manifest);
}

test('only the two exact missing-review IDs are eligible', () => {
  for (const id of movieIds) assert.equal(isMissingEditorialRecoveryMovie(id), true);
  for (const id of ['START-649', 'KNMB-131', 'start-617', 'START-617 ', '../START-617', 'START-617/../../outside', null, undefined]) {
    assert.equal(isMissingEditorialRecoveryMovie(id), false);
  }
});

test('unlisted IDs are no-ops even without a manifest or D1 source', async (t) => {
  const root = await fixture(t, {withBundle: false});
  const before = await snapshot(root);
  for (const movieId of ['START-649', 'KNMB-131', '../START-617', 'start-617']) {
    const result = await recoverMissingEditorial({root, movieId});
    assert.equal(result.restored, false);
    assert.equal(result.reason, 'not_targeted');
  }
  assert.deepEqual(await snapshot(root), before);
});

test('an existing review is never overwritten, even when recovery inputs are absent', async (t) => {
  const root = await fixture(t, {withBundle: false});
  const movieId = 'START-617';
  await mkdir(join(root, 'content/reviews'), {recursive: true});
  const review = 'Existing owner-reviewed content.\n';
  await writeFile(join(root, destinationPaths(movieId).review), review);
  const before = await snapshot(root);
  const result = await recoverMissingEditorial({root, movieId});
  assert.equal(result.restored, false);
  assert.equal(result.reason, 'review_exists');
  assert.deepEqual(await snapshot(root), before);
});

for (const movieId of movieIds) {
  test(`${movieId}: actual archived content restores completely and passes existing draft QA`, async (t) => {
    const root = await fixture(t);
    const registryBefore = await json(join(root, 'data/movie-registry.json'));
    const tagsBefore = await json(join(root, 'data/tag-candidates.json'));
    const source = await sourceText(root, movieId);
    const result = await recoverMissingEditorial({root, movieId, currentSourceText: source});
    assert.equal(result.restored, true);
    for (const [key, path] of Object.entries(destinationPaths(movieId))) {
      assert.deepEqual(await readFile(join(root, path)), await readFile(join(root, bundleRoot, movieId, bundleNames[key])), `${key} must be copied byte-for-byte`);
    }
    const review = await readFile(join(root, destinationPaths(movieId).review), 'utf8');
    assert.match(review, /^titleVersion: 1$/m);
    assert.match(review, /^status: draft$/m);
    const registryAfter = await json(join(root, 'data/movie-registry.json'));
    assert.deepEqual(registryAfter.records.filter(({id}) => id !== movieId), registryBefore.records);
    assert.deepEqual(registryAfter.records.find(({id}) => id === movieId), await bundleJson(root, movieId, 'registry'));
    assert.deepEqual((await json(join(root, 'data/tag-candidates.json'))).candidates.find(({label}) => label === 'unrelated-test-label'), tagsBefore.candidates[0]);

    for (const path of [
      'scripts/editorial/qa-draft.mjs',
      'scripts/editorial/lib/qa-rules.mjs',
      'scripts/editorial/lib/safe-editorial-payload.mjs',
      'scripts/editorial/lib/source-context.mjs',
    ]) {
      await mkdir(dirname(join(root, path)), {recursive: true});
      await cp(join(repoRoot, path), join(root, path));
    }
    const qa = spawnSync(process.execPath, [join(root, 'scripts/editorial/qa-draft.mjs'), movieId], {cwd: root, encoding: 'utf8'});
    assert.equal(qa.status, 0, `existing QA exited with ${qa.status}; stderr=${qa.stderr}`);
    const report = await json(join(root, 'data/review-quality', `${movieId}-automated.json`));
    assert.equal(report.passed, true);
    assert.deepEqual(report.issues, []);
    assert.deepEqual(report.repair_issues, []);
    assert.equal(report.review_sha256, sha256(await readFile(join(root, destinationPaths(movieId).review))));

    const beforeSecondRun = await snapshot(root);
    const second = await recoverMissingEditorial({root, movieId, currentSourceText: 'changed after initial restoration'});
    assert.equal(second.restored, false);
    assert.equal(second.reason, 'review_exists');
    assert.deepEqual(await snapshot(root), beforeSecondRun, 'retry must preserve restored review and all QA output');
  });
}

test('missing or changed D1 source refuses the old content before any output writes', async (t) => {
  for (const currentSourceText of [undefined, '', '{"id":"START-617","changed":true}\n']) {
    const root = await fixture(t);
    await rejectWithoutWrites(root, () => recoverMissingEditorial({root, movieId: 'START-617', currentSourceText}));
  }
});

test('every archived payload hash is enforced before any restoration writes', async (t) => {
  for (const key of Object.keys(bundleNames)) {
    const root = await fixture(t);
    const movieId = 'START-617';
    const currentSourceText = await sourceText(root, movieId);
    const path = join(root, bundleRoot, movieId, bundleNames[key]);
    await writeFile(path, `${await readFile(path, 'utf8')}\n`);
    await rejectWithoutWrites(root, () => recoverMissingEditorial({root, movieId, currentSourceText}));
  }
});

test('a missing bundle member is a hard error before any restoration writes', async (t) => {
  const root = await fixture(t);
  const movieId = 'START-650';
  const currentSourceText = await sourceText(root, movieId);
  await rm(join(root, bundleRoot, movieId, bundleNames.search));
  await rejectWithoutWrites(root, () => recoverMissingEditorial({root, movieId, currentSourceText}));
});

test('cross-work metadata is rejected even if a manifest hash is recomputed', async (t) => {
  for (const [key, identityKey] of [['brief', 'id'], ['quality', 'id'], ['search', 'movie_id'], ['registry', 'id'], ['tags', 'movie_id']]) {
    const root = await fixture(t);
    const movieId = 'START-617';
    const currentSourceText = await sourceText(root, movieId);
    await modifyBundleAndRepin(root, movieId, key, (payload) => ({...payload, [identityKey]: 'START-650'}));
    await rejectWithoutWrites(root, () => recoverMissingEditorial({root, movieId, currentSourceText}));
  }
});

test('conflicting pre-existing source, brief, quality, or search bytes are never overwritten', async (t) => {
  for (const key of ['source', 'brief', 'quality', 'search']) {
    const root = await fixture(t);
    const movieId = 'START-617';
    const currentSourceText = await sourceText(root, movieId);
    const path = join(root, destinationPaths(movieId)[key]);
    await mkdir(dirname(path), {recursive: true});
    await writeFile(path, '{"owner_existing_data":"retain"}\n');
    await rejectWithoutWrites(root, () => recoverMissingEditorial({root, movieId, currentSourceText}));
  }
});

test('matching partial artifacts can be completed without replacing their bytes', async (t) => {
  const root = await fixture(t);
  const movieId = 'START-650';
  const currentSourceText = await sourceText(root, movieId);
  for (const key of ['source', 'brief', 'quality', 'search']) {
    const path = join(root, destinationPaths(movieId)[key]);
    await mkdir(dirname(path), {recursive: true});
    await cp(join(root, bundleRoot, movieId, bundleNames[key]), path);
  }
  const expected = await Promise.all(['source', 'brief', 'quality', 'search'].map((key) => readFile(join(root, destinationPaths(movieId)[key]))));
  assert.equal((await recoverMissingEditorial({root, movieId, currentSourceText})).restored, true);
  for (const [i, key] of ['source', 'brief', 'quality', 'search'].entries()) {
    assert.deepEqual(await readFile(join(root, destinationPaths(movieId)[key])), expected[i]);
  }
});

test('a published or otherwise non-draft registry record blocks restoration', async (t) => {
  for (const status of ['published', 'approved', 'archived']) {
    const root = await fixture(t);
    const movieId = 'START-617';
    const currentSourceText = await sourceText(root, movieId);
    const registry = await json(join(root, 'data/movie-registry.json'));
    registry.records.push({...await bundleJson(root, movieId, 'registry'), review_status: status});
    await writeJson(join(root, 'data/movie-registry.json'), registry);
    await rejectWithoutWrites(root, () => recoverMissingEditorial({root, movieId, currentSourceText}));
  }
});

test('existing draft registry/media metadata is preserved and tag membership is merged without losing other works', async (t) => {
  const root = await fixture(t);
  const movieId = 'START-617';
  const currentSourceText = await sourceText(root, movieId);
  const registry = await json(join(root, 'data/movie-registry.json'));
  const existingRecord = {...await bundleJson(root, movieId, 'registry'), image_status: 'rendered', video_status: 'rendered', video_url: 'https://example.test/retained.mp4', owner_note: 'retain'};
  registry.records.push(existingRecord);
  await writeJson(join(root, 'data/movie-registry.json'), registry);
  const tags = await json(join(root, 'data/tag-candidates.json'));
  const patch = await bundleJson(root, movieId, 'tags');
  assert.ok(patch.candidates.length > 0, 'real archived content should exercise tag merging');
  const existingTag = {...patch.candidates[0], source_ids: ['OTHER-002'], occurrences: 1, status: 'under_review', first_seen: '2026-10-01', last_seen: '2026-11-01', owner_note: 'retain'};
  tags.candidates.push(existingTag);
  await writeJson(join(root, 'data/tag-candidates.json'), tags);
  assert.equal((await recoverMissingEditorial({root, movieId, currentSourceText})).restored, true);
  assert.deepEqual((await json(join(root, 'data/movie-registry.json'))).records.find(({id}) => id === movieId), existingRecord);
  const updated = (await json(join(root, 'data/tag-candidates.json'))).candidates;
  const match = updated.filter(({label}) => label.normalize('NFKC').trim() === existingTag.label.normalize('NFKC').trim());
  assert.equal(match.length, 1);
  assert.deepEqual(match[0].source_ids, ['OTHER-002', movieId]);
  assert.equal(match[0].occurrences, 2);
  assert.equal(match[0].first_seen, existingTag.first_seen);
  assert.equal(match[0].status, existingTag.status);
  assert.equal(match[0].owner_note, existingTag.owner_note);
  assert.deepEqual(updated.find(({label}) => label === 'unrelated-test-label'), tags.candidates[0]);
});

test('labels mapped or ignored by the current taxonomy are not reintroduced as candidates', async (t) => {
  const root = await fixture(t);
  const movieId = 'START-650';
  const currentSourceText = await sourceText(root, movieId);
  const patch = await bundleJson(root, movieId, 'tags');
  assert.ok(patch.candidates.length >= 2);
  const taxonomy = await json(join(root, 'data/taxonomy.json'));
  taxonomy.source_tag_map[patch.candidates[0].label] = ['existing-rule'];
  taxonomy.ignored_source_tags.push(...patch.candidates.slice(1).map(({label}) => label));
  await writeJson(join(root, 'data/taxonomy.json'), taxonomy);
  const before = await readFile(join(root, 'data/tag-candidates.json'), 'utf8');
  assert.equal((await recoverMissingEditorial({root, movieId, currentSourceText})).restored, true);
  assert.equal(await readFile(join(root, 'data/tag-candidates.json'), 'utf8'), before);
});

test('the reviewed batch and exact two-entry manifest cannot be widened', async (t) => {
  const mutations = [
    (manifest) => ({...manifest, source_run_id: 42413108000}),
    (manifest) => ({...manifest, records: [...manifest.records, {...manifest.records[0], movie_id: 'START-649'}]}),
    (manifest) => ({...manifest, records: [manifest.records[0], manifest.records[0]]}),
    (manifest) => ({...manifest, records: manifest.records.slice(0, 1)}),
    (manifest) => ({...manifest, records: manifest.records.map((entry, index) => index ? entry : {...entry, source_sha256: '0'.repeat(64)})}),
    (manifest) => ({...manifest, records: manifest.records.map((entry, index) => index ? entry : {...entry, original_response_sha256: '0'.repeat(64)})}),
    (manifest) => ({...manifest, records: manifest.records.map((entry, index) => index ? entry : {...entry, files: {...entry.files, source: {path: '../../outside', sha256: entry.files.source}}})}),
  ];
  for (const mutate of mutations) {
    const root = await fixture(t);
    const movieId = 'START-617';
    const currentSourceText = await sourceText(root, movieId);
    await writeJson(join(root, manifestPath), mutate(await json(join(root, manifestPath))));
    await rejectWithoutWrites(root, () => recoverMissingEditorial({root, movieId, currentSourceText}));
  }
});
