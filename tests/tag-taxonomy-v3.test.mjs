import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const taxonomy = JSON.parse(await readFile(new URL('../data/taxonomy.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../src/lib/taxonomy.ts', import.meta.url), 'utf8');
const injected = source.replace(
  "import taxonomy from '../../data/taxonomy.json';",
  `const taxonomy = ${JSON.stringify(taxonomy)};`,
);
const javascript = ts.transpileModule(injected, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
}).outputText;
const helpers = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

test('taxonomy v3 declares every required group and stable source mappings', () => {
  assert.equal(taxonomy.schema_version, 3);
  const groups = new Set(taxonomy.groups.map(({id}) => id));
  for (const group of ['identity', 'body', 'clothing', 'relationship', 'setting', 'action', 'presentation', 'editorial']) {
    assert.ok(groups.has(group), `missing taxonomy group ${group}`);
  }
  for (const tag of taxonomy.tags) assert.ok(groups.has(tag.group), `${tag.id} has unknown group ${tag.group}`);
  const tagsById = new Map(taxonomy.tags.map((tag) => [tag.id, tag]));
  for (const [sourceLabel, id] of Object.entries(taxonomy.source_tag_map)) {
    assert.notEqual(tagsById.get(id)?.group, 'editorial', `${sourceLabel} must not become editorial evidence`);
  }
  assert.equal(taxonomy.source_tag_map['人妻・主婦'], 'married-woman');
  assert.equal(taxonomy.source_tag_map['騎乘位'], 'cowgirl-position');
  assert.equal(taxonomy.source_tag_map['全高清 (FHD)'], 'fhd');
});

test('source labels are preserved while aliases resolve to stable canonical IDs', () => {
  const sourceTags = [' 人妻・主婦 ', '顏射', '噴精', '未知新詞', '人妻・主婦'];
  assert.deepEqual(helpers.sourceTagIds(sourceTags), ['married-woman', 'facial']);
  assert.deepEqual(
    helpers.sourceTagItems(sourceTags).map(({label, id, kind}) => ({label, id, kind})),
    [
      {label: '人妻・主婦', id: 'married-woman', kind: 'source'},
      {label: '顏射', id: 'facial', kind: 'source'},
      {label: '噴精', id: 'facial', kind: 'source'},
      {label: '未知新詞', id: undefined, kind: 'source'},
    ],
  );
});

test('unmapped published source tags link by their verified CC18 tag identity', () => {
  const relation = {
    source_type: 'tag', source_id: '1774', stable_source_id: 'cc18.tv:tag:1774', source_name: '女同性戀',
  };
  assert.equal(helpers.sourceTagPath(relation), '/tags/source-1774/');
  assert.equal(helpers.sourceTagItems(['女同性戀'], [relation])[0].href, '/tags/source-1774/');
  assert.equal(helpers.sourceTagItems(['女同性戀'])[0].href, undefined);
  assert.equal(helpers.sourceTagPath({...relation, stable_source_id: 'cc18.tv:tag:111'}), undefined);
});

test('tag channels keep source facts separate from editorial interpretation', () => {
  const channels = helpers.buildTagChannels({
    sourceTags: ['自拍', 'OL', '未知新詞'],
    canonicalTagIds: ['story', 'close-perspective'],
    editorialTagIds: ['slow-burn'],
  });
  assert.deepEqual(channels, {
    sourceTags: ['自拍', 'OL', '未知新詞'],
    canonicalTagIds: ['self-shot', 'office-lady', 'close-perspective'],
    editorialTagIds: ['story', 'slow-burn'],
    unmappedSourceTags: ['未知新詞'],
  });
  assert.equal(helpers.editorialTagItems(['slow-burn'])[0].kind, 'editorial');
  assert.throws(() => helpers.editorialTagItems(['oral-sex']), /not editorial/);
});

test('candidate occurrences are derived from unique source evidence', () => {
  assert.equal(helpers.candidateOccurrenceCount({occurrences: 1, source_ids: ['A', 'B', 'B', 'C']}), 3);
  assert.equal(helpers.candidateOccurrenceCount({occurrences: 5, source_ids: ['A']}), 5);
});
