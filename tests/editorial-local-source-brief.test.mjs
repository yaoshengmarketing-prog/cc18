import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {coreConceptCandidates, createDeterministicSourceBrief, createLocalSourceBrief, normalizeLocalSourceBrief, resolveCoreSourceConcept} from '../scripts/editorial/lib/local-source-brief.mjs';
import {buildSafePublicSource} from '../scripts/editorial/lib/safe-editorial-payload.mjs';

test('source-only GitHub editorial bypasses the loopback analyzer preflight', async () => {
  const handoff = await readFile(new URL('../scripts/editorial/handoff-d1.mjs', import.meta.url), 'utf8');
  const builder = await readFile(new URL('../scripts/editorial/build-from-analysis.mjs', import.meta.url), 'utf8');
  assert.match(handoff, /const bridgeConfig = sourceOnly \? null : await loadBridgeConfig/);
  assert.match(handoff, /if \(!sourceOnly\) await assertLocalAnalyzerReady\(bridgeConfig\)/);
  assert.match(builder, /sourceOnly \? createDeterministicSourceBrief\(source\) : await createLocalSourceBrief/);
});

test('cloud source-only brief is deterministic and source-traceable', () => {
  const source = {
    id: 'SNOS-409',
    title: '我還不知道的性愛，請讓我接受研修！社會新鮮人的職業初體驗',
    description: '以研修形式推進的企劃',
    source_tags: ['AV女優片', '顏射', '720p'],
  };
  const local = createDeterministicSourceBrief(source);
  assert.equal(local.core_source_concept, '我還不知道的性愛');
  assert.ok(source.title.includes(local.core_source_concept));
  assert.equal(local.creative_seeds.length, 3);
  assert.ok(local.search_concepts.length >= 2);
});

const brief = {
  core_source_concept: '共享私人空間',
  premise: '兩位熟識角色因臨時安排被迫共享私人空間',
  relationship: '原本保持禮貌距離的同事',
  role_dynamic: '一方主動試探，另一方從克制轉為回應',
  central_tension: '日常關係與突然拉近的距離產生反差',
  setting: '旅館式私人房間',
  themes: ['距離變化', '關係轉折'],
  creative_seeds: ['從公事語氣逐步轉為私人對話', '用共享空間放大尷尬與期待', '以一次誤解推動關係改變'],
  search_concepts: ['同事', '共享私人空間'],
};

test('normalizes a complete non-graphic local creative brief', () => {
  assert.deepEqual(normalizeLocalSourceBrief(brief), brief);
  assert.throws(() => normalizeLocalSourceBrief({...brief, creative_seeds: []}), /incomplete/);
});

test('raw source is sent only to loopback and the external-safe payload contains the local brief', async () => {
  let request;
  const fetchImplementation = async (url, options) => {
    request = {url: String(url), body: JSON.parse(options.body)};
    return {ok: true, json: async () => ({message: {content: JSON.stringify(brief)}})};
  };
  const source = {
    id: 'TEST-001', release_date: '2026-08-27', actress: ['測試演員'], series: '同房系列',
    title: 'RAW TITLE 共享私人空間', description: 'RAW DESCRIPTION', source_tags: ['劇情'],
  };
  const local = await createLocalSourceBrief(source, {
    local_analysis: {endpoint: 'http://127.0.0.1:11434', vision_model: 'qwen2.5vl:7b', request_timeout_ms: 1000},
  }, fetchImplementation);
  assert.equal(new URL(request.url).hostname, '127.0.0.1');
  assert.match(request.body.messages[1].content, /RAW DESCRIPTION/);
  const safe = buildSafePublicSource(source, local);
  const externalPayload = JSON.stringify(safe);
  assert.doesNotMatch(externalPayload, /RAW TITLE|RAW DESCRIPTION/);
  assert.equal(safe.core_source_concept, '共享私人空間');
  assert.match(externalPayload, /距離變化/);
  assert.doesNotMatch(externalPayload, /兩位熟識角色因臨時安排/);
});

test('external creative brief deterministically removes graphic local-model prose', () => {
  const source = {
    id: 'TEST-002', release_date: '2026-08-27', actress: ['甲', '乙'], series: null,
    title: 'RAW', description: 'RAW', source_tags: ['HD'],
  };
  const graphicBrief = {
    core_source_concept: '弓道少女',
    premise: '包含口交、顏射與多人性行為的具體敘述',
    relationship: '講師指導具體性行為',
    role_dynamic: '以露骨動作訓練為主',
    central_tension: '如何完成口交技巧',
    setting: '攝影棚內',
    themes: ['成長與學習', '口交技巧', '個人興趣探索'],
    creative_seeds: ['描述口交細節', '加入顏射橋段', '描寫性器官'],
    search_concepts: ['弓道少女', '口交', '一日特訓', '9P', '10發'],
  };
  source.title = '弓道少女的一日特訓';
  const payload = JSON.stringify(buildSafePublicSource(source, graphicBrief));
  assert.doesNotMatch(payload, /口交|顏射|性行為|性器|露骨|9P|10發/);
  assert.match(payload, /成長與學習/);
  assert.equal(JSON.parse(payload).creative_seed_brief.setting, null);
  assert.equal(JSON.parse(payload).creative_seed_brief.premise, null);
  assert.doesNotMatch(payload, /逐步建立自信|初次嘗試與後段熟練/);
  assert.match(payload, /弓道少女|一日特訓/);
});

test('a composed model phrase resolves to one exact non-technical source candidate', () => {
  const source = {
    title: '超美貌Cosplayer脫掉後令人驚訝', series: null,
    description: '偽娘角色的企劃內容',
    source_tags: ['變性人', '亂交', '角色扮演', '720p', '独占配信'],
  };
  assert.equal(resolveCoreSourceConcept('變性人肛門亂交', source), '變性人');
  assert.equal(coreConceptCandidates(source).includes('720p'), false);
  assert.equal(coreConceptCandidates(source).includes('独占配信'), false);
});

test('a translated model concept falls back to an exact source phrase', () => {
  const source = {
    title: '密着マッサージ', series: null,
    description: '撮影企画の公開紹介', source_tags: ['720p'],
  };
  assert.equal(resolveCoreSourceConcept('油壓按摩體驗', source), '密着マッサージ');
});

test('selects a complete exact source phrase instead of a generic or broken dialogue fragment', () => {
  const source = {
    title: '『欸！要在這裡做嗎？』被同人監督設計', series: null,
    description: '作為色情拍攝來到工作室，在油壓按摩中放鬆。',
    source_tags: ['AV女優片', '720p'],
  };
  assert.equal(resolveCoreSourceConcept('色情拍攝、油壓按摩、巨大', source), '油壓按摩');
  assert.equal(coreConceptCandidates(source).includes('欸'), false);
  assert.equal(coreConceptCandidates(source).includes('AV女優片'), false);
});

test('retries one truncated local JSON response before returning a valid brief', async () => {
  let calls = 0;
  const fetchImplementation = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({message: {content: calls === 1 ? '{"core_source_concept":"共享' : JSON.stringify(brief)}}),
    };
  };
  const result = await createLocalSourceBrief({
    title: '共享私人空間', description: '同事共享房間', actress: [], series: null, source_tags: [],
  }, {
    local_analysis: {endpoint: 'http://127.0.0.1:11434', vision_model: 'qwen2.5vl:7b', request_timeout_ms: 1000},
  }, fetchImplementation);
  assert.equal(calls, 2);
  assert.equal(result.core_source_concept, '共享私人空間');
});

test('an incomplete local brief falls back to deterministic source data after bounded attempts', async () => {
  let calls = 0;
  const result = await createLocalSourceBrief({
    id: 'TEST-009', title: '共享私人空間', description: '同事共享房間', actress: [], series: null, source_tags: [],
  }, {
    local_analysis: {endpoint: 'http://127.0.0.1:11434', vision_model: 'qwen2.5vl:7b', request_timeout_ms: 1000},
  }, async () => {
    calls += 1;
    return {ok: true, json: async () => ({message: {content: '{}'}})};
  });
  assert.equal(calls, 2);
  assert.equal(result.core_source_concept, '共享私人空間');
});

test('a source with no traceable concept returns no brief instead of blocking the work', () => {
  assert.equal(createDeterministicSourceBrief({id: 'TEST-010', title: '', description: '', actress: [], series: null, source_tags: []}), null);
});
