import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet, onRequestHead} from '../functions/media/[[path]].js';

const object = (range) => ({
  body: new Uint8Array(range ? range.length : 100),
  size: 100,
  range,
  httpEtag: '"test-etag"',
  writeHttpMetadata(headers) { headers.set('content-type', 'video/mp4'); },
});

const context = ({path, method = 'GET', range} = {}) => ({
  params: {path: path ?? ['works', '2026', '08', 'SNOS-360', 'vertical-v1.mp4']},
  request: new Request('https://cc18.pages.dev/media/test', {
    method,
    headers: range ? {range} : {},
  }),
  env: {
    MEDIA: {
      async get(_key, options) {
        return options?.range?.has('range') ? object({offset: 10, length: 10}) : object();
      },
      async head() { return object(); },
    },
  },
});

test('serves only an allowlisted immutable media key', async () => {
  const response = await onRequestGet(context());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
});

test('supports byte ranges for HTML5 video seeking', async () => {
  const response = await onRequestGet(context({range: 'bytes=10-19'}));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 10-19/100');
  assert.equal(response.headers.get('content-length'), '10');
});

test('does not expose bucket roots or arbitrary keys', async () => {
  const response = await onRequestGet(context({path: ['private', 'secret.txt']}));
  assert.equal(response.status, 404);
});

test('HEAD returns metadata without a body', async () => {
  const response = await onRequestHead(context({method: 'HEAD'}));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), '100');
  assert.equal(await response.text(), '');
});
