import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalSourceBrief, normalizeLocalSourceBrief} from '../scripts/editorial/lib/local-source-brief.mjs';
import {buildSafePublicSource} from '../scripts/editorial/lib/safe-editorial-payload.mjs';

const brief = {
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
    title: 'RAW TITLE', description: 'RAW DESCRIPTION', source_tags: ['劇情'],
  };
  const local = await createLocalSourceBrief(source, {
    local_analysis: {endpoint: 'http://127.0.0.1:11434', vision_model: 'qwen2.5vl:7b', request_timeout_ms: 1000},
  }, fetchImplementation);
  assert.equal(new URL(request.url).hostname, '127.0.0.1');
  assert.match(request.body.messages[1].content, /RAW DESCRIPTION/);
  const safe = buildSafePublicSource(source, local);
  const externalPayload = JSON.stringify(safe);
  assert.doesNotMatch(externalPayload, /RAW TITLE|RAW DESCRIPTION/);
  assert.match(externalPayload, /距離變化/);
  assert.doesNotMatch(externalPayload, /兩位熟識角色因臨時安排/);
});

test('external creative brief deterministically removes graphic local-model prose', () => {
  const source = {
    id: 'TEST-002', release_date: '2026-08-27', actress: ['甲', '乙'], series: null,
    title: 'RAW', description: 'RAW', source_tags: ['HD'],
  };
  const graphicBrief = {
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
  assert.match(payload, /棚內場景/);
  assert.match(payload, /弓道少女|一日特訓/);
});
