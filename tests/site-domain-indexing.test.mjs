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

for (const hostname of ['cc18.pages.dev', 'preview.cc18.pages.dev']) {
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
