import test from 'node:test';
import assert from 'node:assert/strict';
import {awaitImageTask, createImageTask, imageEndpoint, selectImageSpec} from '../scripts/image/lib/aitokenking-image.mjs';
import {buildArtworkPrompts} from '../scripts/image/lib/artwork-prompt.mjs';

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
