import test from 'node:test';
import assert from 'node:assert/strict';
import {
  facStableIdFromSourceId,
  parseFacSourceId,
  parseFacStableId,
} from '../src/lib/fac-identity.mjs';
import {parseWorkPage} from '../scripts/source/cc18-parser.mjs';
import {validateFacRelations} from '../scripts/build-movie-master.mjs';

const relation = ({id = '35', name = 'S1 Style', urlId = id, stableId = `cc18.tv:fac:${id}`, type = 'fac'} = {}) => ({
  source_type: type,
  source_id: id,
  stable_source_id: stableId,
  source_name: name,
  source_url: `https://cc18.tv/search.php?s_type=fac&s_tid=${urlId}`,
  observed_at: '2026-09-01T00:00:00.000Z',
});

const validate = ({catalogCode = 'TEST-001', relations = [relation()], names = new Map(), isPublished = true} = {}) => validateFacRelations({
  catalogCode,
  source: {studio: 'not-an-identity-source', source_relations: {fac: relations}},
  isPublished,
  facNamesByStableId: names,
});

const shell = (content) => `<h1>來源 fac FAC-001</h1><p class="movie_player_up_pic"><img src="/preview/fac.jpg"></p><div class="date">2026-09-01</div><div class="content">${content}</div>`;

test('fac identity codec accepts only canonical positive source IDs', () => {
  assert.equal(parseFacSourceId('35'), '35');
  assert.equal(facStableIdFromSourceId('35'), 'cc18.tv:fac:35');
  assert.deepEqual(parseFacStableId('cc18.tv:fac:35'), {sourceId: '35', stableId: 'cc18.tv:fac:35'});
  for (const value of ['0', '-1', '+1', '01', ' 1', '1 ', '1.0', '%31', 'abc', '', null]) {
    assert.throws(() => parseFacSourceId(value));
  }
});

test('parser reads only direct product-metadata fac relations and preserves source order', () => {
  const html = shell('<div class="note"><a href="/search.php?s_type=fac&s_tid=35">S1 Style</a><a href="/search.php?s_type=fac&s_tid=1214">mercury（マーキュリー）</a></div><div class="recommend"><span class="name text-secondary"><a href="/search.php?s_type=fac&s_tid=999">推薦卡片商</a></span></div>');
  const parsed = parseWorkPage(html, 'https://cc18.tv/player.php?uuid=fac&cat=19');
  assert.deepEqual(parsed.source_relations.fac.map(({source_id: sourceId}) => sourceId), ['35', '1214']);
  assert.deepEqual(parsed.source_relations.fac.map(({source_name: sourceName}) => sourceName), ['S1 Style', 'mercury（マーキュリー）']);
  assert.ok(parsed.source_relations.fac.every(({observed_at: observedAt}) => observedAt === parsed.fetched_at));
  assert.ok(parsed.source_relations.fac.every(({stable_source_id: stableId}) => stableId !== 'cc18.tv:fac:999'));
  assert.equal(parsed.studio, null, 'multiple direct fac relations must not be collapsed into one legacy studio');
});

test('legacy studio projects only one verified direct fac and ignores recommendation fac links', () => {
  const recommendation = '<div class="recommend"><span class="name text-secondary"><a href="/search.php?s_type=fac&s_tid=999">推薦卡片商</a></span></div>';
  const single = parseWorkPage(
    shell(`<div class="note"><a href="/search.php?s_type=fac&s_tid=35">S1 Style</a></div>${recommendation}`),
    'https://cc18.tv/player.php?uuid=single-fac&cat=19',
  );
  assert.equal(single.studio, 'S1 Style');
  assert.deepEqual(single.source_relations.fac.map(({source_id: sourceId}) => sourceId), ['35']);

  const empty = parseWorkPage(
    shell(recommendation),
    'https://cc18.tv/player.php?uuid=no-direct-fac&cat=19',
  );
  assert.equal(empty.studio, null);
  assert.deepEqual(empty.source_relations.fac, []);
});

test('parser preserves an explicit empty fac set and rejects duplicate or malformed direct fac', () => {
  assert.deepEqual(parseWorkPage(shell(''), 'https://cc18.tv/player.php?uuid=empty&cat=19').source_relations.fac, []);
  assert.throws(
    () => parseWorkPage(shell('<div class="note"><a href="/search.php?s_type=fac&s_tid=35">S1</a><a href="/search.php?s_type=fac&s_tid=35">S1</a></div>'), 'https://cc18.tv/player.php?uuid=duplicate&cat=19'),
    /duplicate fac relation/u,
  );
  for (const href of ['/search.php?s_type=fac&s_tid=0', '/search.php?s_type=fac&s_tid=035', '/search.php?s_type=fac&s_tid=%33%35']) {
    assert.throws(
      () => parseWorkPage(shell(`<div class="note"><a href="${href}">fac</a></div>`), 'https://cc18.tv/player.php?uuid=invalid&cat=19'),
      (error) => error.message.includes('FAC-001') && error.message.includes(href),
      href,
    );
  }
});

test('Movie Master projection preserves multiple fac identities without inferring studio semantics', () => {
  const names = new Map();
  const relations = [relation({id: '35', name: 'S1 Style'}), relation({id: '1214', name: 'mercury（マーキュリー）'})];
  const first = validate({catalogCode: 'ONE-001', relations, names});
  const second = validate({catalogCode: 'TWO-002', relations, names});
  assert.deepEqual(first, second);
  assert.deepEqual(first.map(({stable_source_id: stableId}) => stableId), ['cc18.tv:fac:35', 'cc18.tv:fac:1214']);
});

test('Movie Master projection fails closed on contradictions and preserves same-name different IDs', () => {
  assert.throws(() => validate({relations: [relation({stableId: 'cc18.tv:fac:999'})]}), /invalid fac relation identity/u);
  assert.throws(() => validate({relations: [relation({urlId: '999'})]}), /URL\/identity mismatch/u);
  assert.throws(() => validate({relations: [relation({type: 'tag'})]}), /invalid fac relation identity/u);
  assert.throws(() => validate({relations: [relation(), relation()]}), /duplicate fac relation/u);
  assert.throws(() => validate({relations: [{...relation(), observed_at: 'not-a-date'}]}), /invalid fac observed_at/u);
  const sharedNames = new Map();
  validate({catalogCode: 'ONE-001', names: sharedNames});
  assert.throws(() => validate({catalogCode: 'TWO-002', relations: [relation({name: '另一名稱'})], names: sharedNames}), /conflicting names/u);
  const sameName = new Map();
  const projected = validate({relations: [relation({id: '35', name: '同名'}), relation({id: '36', name: '同名'})], names: sameName});
  assert.equal(projected.length, 2);
  assert.equal(sameName.size, 2);
});

test('published works require an explicit fac array and raw studio never creates identity', () => {
  const input = (isPublished) => validateFacRelations({
    catalogCode: 'TEST-001',
    source: {studio: 'S1 Style', source_relations: {}},
    isPublished,
    facNamesByStableId: new Map(),
  });
  assert.deepEqual(input(false), []);
  assert.throws(() => input(true), /published fac relations must be an array/u);
  assert.deepEqual(validate({relations: []}), []);
});
