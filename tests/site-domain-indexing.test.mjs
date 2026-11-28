import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { onRequest } from '../functions/_middleware.js';

const routes = JSON.parse(await readFile(new URL('../public/_routes.json', import.meta.url)));

test('Pages middleware covers static pages as well as Functions', () => {
  assert.deepEqual(routes.include, ['/*']);
  assert.deepEqual(routes.exclude, ['/_astro/*', '/images/*']);
});

test('primary domain keeps its original response', async () => {
  const response = new Response('primary', { headers: { 'X-Existing': 'kept' } });
  const actual = await onRequest({
    request: new Request('https://jav.com.tw/works/ipzz-984/'),
    next: async () => response,
  });
  assert.equal(actual, response);
  assert.equal(actual.headers.get('X-Robots-Tag'), null);
});

test('production Pages hostname redirects pages with path and query intact', async () => {
  const actual = await onRequest({
    request: new Request('https://cc18.pages.dev/works/ipzz-984/?q=a%20b&x=1'),
    next: async () => { throw new Error('redirect must run before the route'); },
  });
  assert.equal(actual.status, 301);
  assert.equal(actual.headers.get('Location'), 'https://jav.com.tw/works/ipzz-984/?q=a%20b&x=1');
});

test('production Pages media stays on the R2 Function for existing media URLs', async () => {
  const response = new Response('media', {headers: {'Content-Type': 'image/jpeg'}});
  const actual = await onRequest({
    request: new Request('https://cc18.pages.dev/media/works/2026/11/IPZZ-984/hero-v1.jpg'),
    next: async () => response,
  });
  assert.equal(actual.status, 200);
  assert.equal(await actual.text(), 'media');
});

for (const hostname of ['preview.cc18.pages.dev']) {
  test(`${hostname} remains accessible but cannot be indexed`, async () => {
    const actual = await onRequest({
      request: new Request(`https://${hostname}/works/ipzz-984/`),
      next: async () => new Response('auxiliary', { headers: { 'X-Existing': 'kept' } }),
    });
    assert.equal(actual.status, 200);
    assert.equal(await actual.text(), 'auxiliary');
    assert.equal(actual.headers.get('X-Existing'), 'kept');
    assert.equal(actual.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  });
}
