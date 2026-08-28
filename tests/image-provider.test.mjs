import test from 'node:test';
import assert from 'node:assert/strict';
import {awaitImageTask, createImageTask, imageEndpoint, selectImageSpec} from '../scripts/image/lib/aitokenking-image.mjs';
import {buildArtworkPrompts} from '../scripts/image/lib/artwork-prompt.mjs';
import {createHash} from 'node:crypto';
import {assertApprovedReviewForMedia} from '../scripts/image/lib/approval-gate.mjs';
import {readFile} from 'node:fs/promises';

const config = {
  base_url: 'https://api.aitokenking.com.tw/api/v1', allowed_hosts: ['api.aitokenking.com.tw'], model: 'seedream-4.5',
  preferred_resolutions: ['2k', '1080p'], roles: {article_hero: {ratio: '16:9'}}, poll_interval_seconds: 0, poll_timeout_seconds: 2,
};

test('image endpoint and advertised model parameters are allowlisted', () => {
  assert.equal(imageEndpoint(config, 'image-models'), 'https://api.aitokenking.com.tw/api/v1/image-models');
  assert.deepEqual(selectImageSpec(config, [{id: 'seedream-4.5', ratios: ['16:9'], resolutions: ['1080p', '2k']}], 'article_hero'), {
    model: 'seedream-4.5', ratio: '16:9', resolution: '2k', count: 1,
  });
});

test('submits and polls an asynchronous image task', async () => {
  const calls = [];
  const fetchImplementation = async (url, init = {}) => {
    calls.push({url, init});
    const body = url.endsWith('/image-generations')
      ? {code: 200, data: {taskId: 'img_test123'}}
      : {code: 200, data: {status: 'success', images: JSON.stringify(['https://assets.example/image.png'])}};
    return new Response(JSON.stringify(body), {status: 200, headers: {'content-type': 'application/json'}});
  };
  const taskId = await createImageTask({config, apiKey: 'secret', prompt: 'safe prompt', spec: {model: 'seedream-4.5', ratio: '16:9', resolution: '2k', count: 1}, fetchImplementation});
  const result = await awaitImageTask({config, apiKey: 'secret', taskId, fetchImplementation, waitImplementation: async () => {}});
  assert.equal(result.url, 'https://assets.example/image.png');
  assert.equal(JSON.parse(calls[0].init.body).imageUrls.length, 0);
});

test('treats a zero provider code as an error instead of a successful empty task', async () => {
  const fetchImplementation = async () => new Response(JSON.stringify({code: 0, message: 'request rejected'}), {status: 200, headers: {'content-type': 'application/json'}});
  await assert.rejects(() => createImageTask({config, apiKey: 'secret', prompt: 'safe prompt', spec: {model: 'seedream-4.5', ratio: '16:9', resolution: '2k', count: 1}, fetchImplementation}), /request rejected/);
});

test('accepts provider UUID task ids while rejecting path-shaped ids', async () => {
  const response = (taskId) => async () => new Response(JSON.stringify({code: 200, data: {taskId}}), {status: 200, headers: {'content-type': 'application/json'}});
  assert.equal(await createImageTask({config, apiKey: 'secret', prompt: 'safe', spec: {}, fetchImplementation: response('550e8400-e29b-41d4-a716-446655440000')}), '550e8400-e29b-41d4-a716-446655440000');
  await assert.rejects(() => createImageTask({config, apiKey: 'secret', prompt: 'safe', spec: {}, fetchImplementation: response('../task')}), /no valid taskId/);
});

test('artwork prompts convert youth-coded concepts into adult editorial scenes', () => {
  const prompts = buildArtworkPrompts({
    source: {id: 'TEST-001', title: '弓道少女的課程', description: ''},
    localCreativeBrief: {setting: '教室', themes: ['個人成長'], search_concepts: ['弓道少女']},
  });
  assert.match(prompts.article_hero, /adult|成年女性/);
  assert.doesNotMatch(prompts.article_hero, /少女|學生妹|女學生/);
  assert.match(prompts.vertical_scene, /9:16/);
});

test('artwork prompts exclude performer identity and sensitive source concepts', () => {
  const prompts = buildArtworkPrompts({
    source: {
      actress: ['測試演員'],
      title: '測試演員在美容院接受乳頭開發並達到高潮',
      description: '',
    },
    localCreativeBrief: {
      core_source_concept: '乳頭開發與高潮',
      setting: '美容院',
      themes: ['乳頭開發', '角色變化', '互動節奏'],
      search_concepts: ['測試演員', '測試演員別名', '美容院', '乳頭開發與高潮'],
    },
  });
  const combined = `${prompts.article_hero}\n${prompts.vertical_scene}`;
  assert.doesNotMatch(combined, /測試演員|測試演員別名|乳頭|高潮/);
  assert.match(combined, /美容院/);
  assert.match(combined, /fully clothed/);
});

test('image generation requires an approved review with an exact content hash', () => {
  const movieId = 'TEST-001';
  const markdown = '---\nid: TEST-001\nstatus: published\n---\n\n內容\n';
  const reviewHash = createHash('sha256').update(markdown).digest('hex');
  const quality = {id: movieId, approved_for_publish: true, review_sha256: reviewHash};
  const registry = {records: [{id: movieId, review_status: 'published'}]};
  assert.equal(assertApprovedReviewForMedia({movieId, markdown, quality, registry}), reviewHash);
  assert.throws(() => assertApprovedReviewForMedia({movieId, markdown: `${markdown}變更`, quality, registry}), /stale/);
  assert.throws(() => assertApprovedReviewForMedia({movieId, markdown: markdown.replace('published', 'draft'), quality, registry}), /not approved/);
});

test('image worker verifies R2 before provider access or D1 claim', async () => {
  const source = await readFile(new URL('../scripts/image/process-d1-one.mjs', import.meta.url), 'utf8');
  const preflight = source.indexOf("await listR2Objects({bucket: config.r2_bucket, prefix: '.cc18-upload-preflight/'})");
  const providerDiscovery = source.indexOf('await listImageModels');
  const d1Claim = source.indexOf('await store.claim');
  const paidGeneration = source.indexOf('await createImageTask');
  assert.ok(preflight >= 0);
  assert.ok(preflight < providerDiscovery);
  assert.ok(preflight < d1Claim);
  assert.ok(preflight < paidGeneration);
});
