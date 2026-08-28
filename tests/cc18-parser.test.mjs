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
