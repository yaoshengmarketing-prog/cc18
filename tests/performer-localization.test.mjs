import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const approvedDisplays = new Map([
  ['cc18.tv:actor:30343', '相澤澪'],
  ['cc18.tv:actor:25064', '鷲尾芽衣'],
  ['cc18.tv:actor:28722', '淺野心'],
  ['cc18.tv:actor:25389', '七森莉莉'],
]);
const sourceTitleAliases = new Map([
  ['一之瀨蘭', {actorId: 'cc18.tv:actor:27185', sourceRef: 'data/source-records/DSOD-006.json'}],
  ['柚木蓮花', {actorId: 'cc18.tv:actor:29885', sourceRef: 'data/source-records/DSOD-006.json'}],
  ['柊紅葉', {actorId: 'cc18.tv:actor:54025', sourceRef: 'data/source-records/DSOD-006.json'}],
  ['星空音琉', {actorId: 'cc18.tv:actor:54454', sourceRef: 'data/source-records/SNOS-409.json'}],
]);

const buildExpectedPerformerSearch = (performers) => {
  const termsByActorId = new Map();
  for (const performer of performers) {
    const terms = [
      performer.display_name_zh_tw,
      performer.name_ja,
      performer.source_name,
      ...performer.aliases.filter(({searchable}) => searchable).map(({name}) => name),
    ].filter((term) => typeof term === 'string' && term.length > 0);
    termsByActorId.set(performer.source_actor_id, new Set(terms));
  }
  return (query) => {
    const needle = query.trim();
    if (!needle) return [];
    return [...termsByActorId]
      .filter(([, terms]) => [...terms].some((term) => term.includes(needle)))
      .map(([actorId]) => actorId);
  };
};

test('published performer relations accept optional localization without weakening stable IDs', async () => {
  const [localization, index] = await Promise.all([
    readJson('data/localization/performers-zh-tw.json'),
    readJson('data/movie-master/index.json'),
  ]);
  const publishedMasters = await Promise.all(index.entries
    .filter(({is_published: isPublished, is_demo: isDemo}) => isPublished && !isDemo)
    .map(({master_path: path}) => readJson(path)));
  const relationIds = publishedMasters.flatMap((master) => (
    master.source.performer_relations.map(({stable_source_id: id}) => id)
  ));
  const expectedIds = [...new Set(relationIds)].sort();
  const ids = localization.performers.map(({source_actor_id: id}) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.filter((id) => !expectedIds.includes(id)), []);
  for (const id of expectedIds) assert.match(id, /^cc18\.tv:actor:[1-9][0-9]*$/);
  assert.notEqual('cc18.tv:actor:3', 'cc18.tv:tag:3');
});

test('only the four approved Traditional Chinese display names are projected', async () => {
  const localization = await readJson('data/localization/performers-zh-tw.json');
  const actual = new Map(localization.performers
    .filter(({display_name_zh_tw: displayName}) => displayName !== null)
    .map(({source_actor_id: id, display_name_zh_tw: displayName}) => [id, displayName]));
  assert.deepEqual(actual, approvedDisplays);
});

test('source-attested title aliases are searchable but never formal display names', async () => {
  const localization = await readJson('data/localization/performers-zh-tw.json');
  const matchedAliases = new Map();
  for (const performer of localization.performers) {
    assert.ok(performer.source_name);
    assert.ok(performer.name_ja);
    assert.ok(Array.isArray(performer.aliases));
    assert.ok(Array.isArray(performer.source_references) && performer.source_references.length > 0);
    assert.ok(!sourceTitleAliases.has(performer.display_name_zh_tw));
    for (const alias of performer.aliases.filter(({type}) => type === 'SOURCE_TITLE_ALIAS')) {
      const expected = sourceTitleAliases.get(alias.name);
      assert.ok(expected);
      assert.equal(performer.source_actor_id, expected.actorId);
      assert.equal(alias.verification_status, 'SOURCE_ATTESTED');
      assert.equal(alias.searchable, true);
      assert.equal(alias.display_as_primary, false);
      assert.deepEqual(alias.source_references, [expected.sourceRef]);
      matchedAliases.set(alias.name, performer.source_actor_id);
    }
  }
  assert.deepEqual(matchedAliases, new Map([...sourceTitleAliases].map(([name, {actorId}]) => [name, actorId])));
});

test('performer search contract supports continuous partial matches and deduplicates by stable actor ID', async () => {
  const localization = await readJson('data/localization/performers-zh-tw.json');
  const search = buildExpectedPerformerSearch(localization.performers);
  const cases = new Map([
    ['星空ねる', 'cc18.tv:actor:54454'],
    ['星空音琉', 'cc18.tv:actor:54454'],
    ['ねる', 'cc18.tv:actor:54454'],
    ['音琉', 'cc18.tv:actor:54454'],
    ['星空', 'cc18.tv:actor:54454'],
    ['一ノ瀬ラム', 'cc18.tv:actor:27185'],
    ['一之瀨蘭', 'cc18.tv:actor:27185'],
    ['ラム', 'cc18.tv:actor:27185'],
    ['瀨蘭', 'cc18.tv:actor:27185'],
    ['柚木れんか', 'cc18.tv:actor:29885'],
    ['柚木蓮花', 'cc18.tv:actor:29885'],
    ['れんか', 'cc18.tv:actor:29885'],
    ['蓮花', 'cc18.tv:actor:29885'],
    ['柊もみじ', 'cc18.tv:actor:54025'],
    ['柊紅葉', 'cc18.tv:actor:54025'],
    ['もみじ', 'cc18.tv:actor:54025'],
    ['紅葉', 'cc18.tv:actor:54025'],
  ]);
  for (const [query, actorId] of cases) assert.deepEqual(search(query), [actorId], query);

  // `星空` simultaneously matches source/name_ja and its searchable alias, but returns one entity.
  assert.equal(search('星空').length, 1);
});

test('published Source Records preserve the current typed performer relation set and original names', async () => {
  const [index, registry] = await Promise.all([
    readJson('data/movie-master/index.json'),
    readJson('data/movie-registry.json'),
  ]);
  const publishedEntries = index.entries.filter(({is_published: isPublished}) => isPublished);
  const publishedCodes = registry.records
    .filter(({review_status: status}) => status === 'published')
    .map(({id}) => id)
    .sort();
  assert.deepEqual(publishedEntries.map(({catalog_code: code}) => code).sort(), publishedCodes);
  const publishedSources = await Promise.all(publishedEntries
    .map(({catalog_code: catalogCode}) => readJson(`data/source-records/${catalogCode}.json`)));
  const expectedRecordsWithPerformers = publishedSources.filter(({actress}) => actress.length > 0).length;
  const expectedRelationCount = publishedSources.reduce((count, {actress}) => count + actress.length, 0);
  let recordsWithPerformers = 0;
  let relationCount = 0;
  for (const source of publishedSources) {
    const relations = source.source_relations?.performers ?? [];
    if (source.actress.length === 0) {
      assert.deepEqual(relations, []);
      continue;
    }
    recordsWithPerformers += 1;
    relationCount += relations.length;
    assert.deepEqual(relations.map(({source_name: sourceName}) => sourceName), source.actress);
    for (const relation of relations) {
      assert.equal(relation.source_type, 'actor');
      assert.equal(relation.stable_source_id, `cc18.tv:actor:${relation.source_id}`);
      assert.equal(relation.observed_at, source.fetched_at);
      const url = new URL(relation.source_url);
      assert.equal(url.searchParams.get('s_type'), 'actor');
      assert.equal(url.searchParams.get('s_tid'), relation.source_id);
    }
  }
  assert.equal(recordsWithPerformers, expectedRecordsWithPerformers);
  assert.equal(relationCount, expectedRelationCount);
});
