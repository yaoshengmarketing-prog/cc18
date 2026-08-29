import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseListing, parseWorkPage} from '../scripts/source/cc18-parser.mjs';

test('parses required fields from a CC18 work page fixture', async () => {
  const html = await readFile(new URL('./fixtures/cc18-work-minimal.html', import.meta.url), 'utf8');
  const item = parseWorkPage(html, 'https://cc18.tv/player.php?uuid=demo&cat=19');
  assert.equal(item.id, 'DEMO-123');
  assert.equal(item.release_date, '2026-08-25');
  assert.deepEqual(item.actress, ['測試演員']);
  assert.deepEqual(item.source_relations.performers, [{
    source_type: 'actor',
    source_id: '3',
    stable_source_id: 'cc18.tv:actor:3',
    source_name: '測試演員',
    source_url: 'https://cc18.tv/search.php?s_type=actor&s_tid=3',
    observed_at: item.fetched_at,
  }]);
  assert.equal(item.series, '測試系列');
  assert.deepEqual(item.source_tags, ['測試標籤']);
  assert.equal(item.cover_source_url, 'https://cc18.tv/preview/demo-800.jpg');
});

test('namespaces relation IDs by source type instead of numeric s_tid alone', () => {
  const html = '<h1>關聯測試 REL-001</h1><p class="movie_player_up_pic"><img src="/preview/rel.jpg"></p><div class="date">2026-08-25</div><div class="tag-info"><a href="/search.php?s_type=actor&s_tid=3">演員三</a><a href="/search.php?s_type=tag&s_tid=3">標籤三</a></div>';
  const item = parseWorkPage(html, 'https://cc18.tv/player.php?uuid=relation&cat=19');
  assert.deepEqual(item.actress, ['演員三']);
  assert.equal(item.source_relations.performers[0].stable_source_id, 'cc18.tv:actor:3');
  assert.notEqual(item.source_relations.performers[0].stable_source_id, 'cc18.tv:tag:3');
});

test('rejects non-canonical actor s_tid values instead of normalizing them', () => {
  for (const query of [
    's_type=actor&s_tid=03', 's_type=actor&s_tid=0', 's_type=actor&s_tid=%33',
    's_type=actor&s_tid=3&%73_tid=4', 's_type=actor&s_tid=3&s_%74id=4',
    's_type=actor&s_tid=\t3', 's_type=actor&s_tid=3\n',
  ]) {
    const html = `<h1>嚴格人物 STRICT-001</h1><p class="movie_player_up_pic"><img src="/preview/strict.jpg"></p><div class="date">2026-08-25</div><div class="tag-info"><a href="/search.php?${query}">非法人物</a></div>`;
    assert.throws(() => parseWorkPage(html, 'https://cc18.tv/player.php?uuid=strict&cat=19'), /invalid actor relation/u, query);
  }
});

test('rejects actor-like s_type values instead of silently skipping malformed relations', () => {
  for (const query of [
    's_type=Actor&s_tid=3',
    's_type=%20actor&s_tid=3',
    's_type=%09actor&s_tid=3',
    's_type=%0Aactor&s_tid=3',
    's_type=%00actor&s_tid=3',
    's_type=+actor&s_tid=3',
    's_type=%2Bactor&s_tid=3',
    '%20s_type=actor&s_tid=3',
    '%73_type=actor%ZZ&s_tid=3',
    '%73_type=%ZZactor&s_tid=3',
    's_type=actor%20&s_tid=3',
    's_type=actor%09&s_tid=3',
    's_type=actor%00&s_tid=3',
  ]) {
    const href = `/search.php?${query}`;
    const html = `<h1>嚴格人物 TYPE-001</h1><p class="movie_player_up_pic"><img src="/preview/strict.jpg"></p><div class="date">2026-08-25</div><div class="tag-info"><a href="${href}">非法人物</a></div>`;
    assert.throws(
      () => parseWorkPage(html, 'https://cc18.tv/player.php?uuid=strict-type&cat=19'),
      (error) => /TYPE-001: invalid actor relation/u.test(error.message) && error.message.includes(href),
      query,
    );
  }
});

test('rejects actor-like control, plus and malformed-percent insertions at the work-page boundary', () => {
  for (const href of [
    '/search.php?s%01_type=actor&s_tid=3',
    '/search.php?s_type=a%00ctor&s_tid=3',
    '/search.php?s_type=a+ctor&s_tid=3',
    '/search.php?%ZZs_type=actor&s_tid=3',
    '/search.php?s_type=a%63t%6Fr%ZZ&s_tid=3',
  ]) {
    const html = `<h1>人物候選錯誤 CAND-001</h1><p class="movie_player_up_pic"><img src="/preview/candidate.jpg"></p><div class="date">2026-08-25</div><div class="tag-info"><a href="${href}">人物</a></div>`;
    assert.throws(
      () => parseWorkPage(html, 'https://cc18.tv/player.php?uuid=candidate&cat=19'),
      (error) => error.message.includes('CAND-001') && error.message.includes(href),
      href,
    );
  }
});

test('strictly classifies every tag-info search relation without lossy actor guessing', () => {
  const malformedActorRelations = [
    '/search.php?s%C2%A0_type=actor&s_tid=3',
    '/search.php?s_type=ac%C2%A0tor&s_tid=3',
    '/search.php?%E3%80%80s_type=actor&s_tid=3',
    '/search.php?s_type=act%E3%80%80or&s_tid=3',
    '/search.php?%s_type=actor&s_tid=3',
    '/search.php?s%_type=actor&s_tid=3',
    '/search.php?s%Z_type=actor&s_tid=3',
    '/search.php?s_type=a%ctor&s_tid=3',
    '/search.php?s_type=ac%Ztor&s_tid=3',
    '/search.php?s_type=%EF%BD%81ctor&s_tid=3',
  ];
  for (const href of malformedActorRelations) {
    const html = `<h1>關聯分類 CLASS-001</h1><p class="movie_player_up_pic"><img src="/preview/class.jpg"></p><div class="date">2026-08-25</div><div class="tag-info"><a href="${href}">人物</a></div>`;
    assert.throws(
      () => parseWorkPage(html, 'https://cc18.tv/player.php?uuid=class&cat=19'),
      (error) => error.message.includes('CLASS-001') && error.message.includes(href),
      href,
    );
  }

  const legalHtml = '<h1>合法關聯 CLASS-002</h1><p class="movie_player_up_pic"><img src="/preview/class.jpg"></p><div class="date">2026-08-25</div><div class="tag-info"><a href="/search.php?s_type=actor&s_tid=3">人物</a><a href="/search.php?s_type=tag&s_tid=4">標籤</a><a href="/search.php?s_type=fac&s_tid=5">片商</a><a href="/search.php?s_type=series&s_tid=6">系列</a></div>';
  const legal = parseWorkPage(legalHtml, 'https://cc18.tv/player.php?uuid=class-ok&cat=19');
  assert.deepEqual(legal.actress, ['人物']);
  assert.equal(legal.source_relations.performers.length, 1);
});

test('validates the raw work-page base before resolving relative actor links', () => {
  const html = '<h1>來源頁基準 BASE-001</h1><p class="movie_player_up_pic"><img src="/preview/base.jpg"></p><div class="date">2026-08-25</div><div class="tag-info"><a href="/search.php?s_type=actor&s_tid=3">人物</a></div>';
  const legal = parseWorkPage(html, 'https://www.cc18.tv/player.php?uuid=base&cat=19');
  assert.equal(legal.source_relations.performers[0].source_url, 'https://www.cc18.tv/search.php?s_type=actor&s_tid=3');
  for (const sourceUrl of [
    'https://cc18.tv:443/player.php?uuid=base&cat=19',
    'https://cc18.tv:0443/player.php?uuid=base&cat=19',
    'https://@cc18.tv/player.php?uuid=base&cat=19',
    'https://cc18.tv/foo/../player.php?uuid=base&cat=19',
    'https://cc18.tv\\player.php?uuid=base&cat=19',
    'https://%63c18.tv/player.php?uuid=base&cat=19',
    'https://ｃｃ１８.tv/player.php?uuid=base&cat=19',
  ]) {
    assert.throws(() => parseWorkPage(html, sourceUrl), /raw CC18 source page URL|canonical CC18 source page URL/u, sourceUrl);
  }
});

test('rejects duplicate actor relations instead of silently deduplicating them', () => {
  const html = '<h1>重複人物 DUP-001</h1><p class="movie_player_up_pic"><img src="/preview/dup.jpg"></p><div class="date">2026-08-25</div><div class="tag-info"><a href="/search.php?s_type=actor&s_tid=3">甲</a><a href="/search.php?s_type=actor&s_tid=3">甲</a></div>';
  assert.throws(() => parseWorkPage(html, 'https://cc18.tv/player.php?uuid=dup&cat=19'), /duplicate actor relation/u);
});

test('recognized actor relations fail on disallowed protocol, host and path', () => {
  for (const href of [
    'http://cc18.tv/search.php?s_type=actor&s_tid=3',
    'https://evil.example/search.php?s_type=actor&s_tid=3',
    'https://cc18.tv/other.php?s_type=actor&s_tid=3',
    'https://cc18.tv:443/search.php?s_type=actor&s_tid=3',
    'https://@cc18.tv/search.php?s_type=actor&s_tid=3',
    'https://cc18.tv/foo/../search.php?s_type=actor&s_tid=3',
    'https://cc18.tv\\search.php?s_type=actor&s_tid=3',
    'https://%63c18.tv/search.php?s_type=actor&s_tid=3',
    'https://ｃｃ１８.tv/search.php?s_type=actor&s_tid=3',
  ]) {
    const html = `<h1>來源錯誤 URL-001</h1><p class="movie_player_up_pic"><img src="/preview/url.jpg"></p><div class="date">2026-08-25</div><div class="tag-info"><a href="${href}">人物</a></div>`;
    assert.throws(() => parseWorkPage(html, 'https://cc18.tv/player.php?uuid=url&cat=19'), /invalid actor relation/u, href);
  }
});

test('deduplicates listing URLs and rejects other domains', () => {
  const html = '<a href="/player.php?uuid=abc&cat=19">A</a><a href="/player.php?uuid=abc&cat=19">A2</a><a href="/player.php?uuid=anime&cat=19&npage=cartoon">cartoon</a><a href="/comic_player.php?uuid=comic&cat=1">comic</a><a href="https://evil.example/player.php?uuid=x">X</a>';
  assert.deepEqual(parseListing(html), ['https://cc18.tv/player.php?uuid=abc&cat=19']);
});

test('keeps a catalogued work with no public synopsis as partial metadata', () => {
  const html = '<h1>有番號但沒有簡介 PART-001</h1><p class="movie_player_up_pic"><img src="/preview/partial.jpg"></p><div class="date">2026-08-25</div>';
  const item = parseWorkPage(html, 'https://cc18.tv/player.php?uuid=partial&cat=19');
  assert.equal(item.id, 'PART-001');
  assert.equal(item.description, null);
});
