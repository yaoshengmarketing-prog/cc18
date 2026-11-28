import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {onRequest as middleware} from '../functions/_middleware.js';
import {onRequestGet, onRequestHead} from '../functions/media/[[path]].js';
import {excludedIds, isExcluded} from '../src/lib/exclusions.mjs';
import {loadPublishedMovieCardCatalog} from '../src/lib/movie-master.mjs';
import {FileQueueStore} from '../scripts/queue/store.mjs';

const expectedIds = `DANDYA-045 DSOD-093 DSOD-094 DVMM-453 FNEW-024 FSBK-028 FTKD-045 GVH-884 HALT-093 HHF-113 IDPC-004 IENF-458 IENF-470 IPZZ-924 MIDA-781 MIDA-840 MUKD-585 MUKD-595 MURIKURI-015 NACT-188 NHDTC-254 NHDTC-258 PIYO-240 SDMM-239 SNOS-372 SNOS-388 SNOS-403 TEND-039 YAKO-099`.split(' ');

test('exclusion files are the authority for current takedown IDs', () => {
  assert.deepEqual([...excludedIds()].sort(), expectedIds.sort());
  assert.ok(isExcluded('dsod-093'));
  assert.equal(isExcluded('APAK-337'), false);
  assert.equal(isExcluded('SNOS-290'), false);
});

test('middleware returns 410 for works with case and slash variants and media', async () => {
  for (const path of ['/works/dsod-093/', '/works/DSOD-093', '/media/works/2026/10/DSOD-093/hero-v1.webp']) {
    const response = await middleware({request: new Request(`https://jav.com.tw${path}`), next: () => { throw new Error('excluded request reached next'); }});
    assert.equal(response.status, 410);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  }
});

test('media GET and HEAD reject excluded work before R2 access', async () => {
  const context = {params: {path: ['works', '2026', '10', 'DSOD-093', 'hero-v1.webp']}, request: new Request('https://jav.com.tw/media/works/2026/10/DSOD-093/hero-v1.webp'), env: {MEDIA: {get() {throw new Error('R2 reached');}, head() {throw new Error('R2 reached');}}}};
  assert.equal((await onRequestGet(context)).status, 410);
  assert.equal((await onRequestHead(context)).status, 410);
});

test('queue refuses excluded publication and cancels existing claim candidates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cc18-exclusions-'));
  try {
    const store = new FileQueueStore(join(dir, 'queue.json'));
    assert.equal(await store.enqueueJob({movieId: 'DSOD-093', stage: 'publish'}), null);
    assert.equal(await store.claim({stage: 'publish', workerId: 'test'}), null);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('public aggregate catalog omits excluded works', async () => {
  const catalog = await loadPublishedMovieCardCatalog();
  assert.ok(catalog.cards.length > 0);
  assert.ok(catalog.cards.every(({catalog_code}) => !isExcluded(catalog_code)));
  assert.equal(catalog.cards.length, catalog.index.published_count);
});
