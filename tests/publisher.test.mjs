import test from 'node:test';
import assert from 'node:assert/strict';
import {frontmatterValue, releaseIdFromHtml, unexpectedPublishPaths, verifyLiveRelease, verifyPublicMedia} from '../scripts/publish/lib/publisher.mjs';

const releaseId = 'a'.repeat(64);

test('publisher permits only files belonging to one work plus the shared registry', () => {
  assert.deepEqual(unexpectedPublishPaths([
    'content/reviews/SDAB-358.md',
    'data/movie-registry.json',
    'data/source-records/SDAB-358.json',
    'data/review-quality/SDAB-358-automated.json',
    'data/tag-candidates.json',
    'video/examples/sdab-358.json',
  ], 'SDAB-358'), []);
  assert.deepEqual(unexpectedPublishPaths(['README.md', 'content/reviews/OTHER-1.md'], 'SDAB-358'), ['README.md', 'content/reviews/OTHER-1.md']);
});

test('publisher reads bounded frontmatter and release metadata', () => {
  assert.equal(frontmatterValue('---\nvideoUrl: /media/work.mp4\n---\nbody', 'videoUrl'), '/media/work.mp4');
  assert.equal(releaseIdFromHtml(`<meta name="cc18-release-id" content="${releaseId}">`), releaseId);
});

test('live release requires the exact review hash and requested video at the work URL', async () => {
  const fetchImpl = async () => new Response(`<meta name="cc18-release-id" content="${releaseId}"><video src="/media/work.mp4"></video>`);
  assert.deepEqual(await verifyLiveRelease({fetchImpl, pageUrl: 'https://cc18.pages.dev/works/sdab-358/', releaseId, videoPath: '/media/work.mp4'}), {ready: true, reason: null});
  const mismatch = await verifyLiveRelease({fetchImpl, pageUrl: 'https://cc18.pages.dev/works/sdab-358/', releaseId: 'b'.repeat(64), videoPath: '/media/work.mp4'});
  assert.equal(mismatch.ready, false);
  assert.equal(mismatch.reason, 'release_id_mismatch');
});

test('public video verification requires mp4 and byte ranges', async () => {
  const fetchImpl = async () => new Response(null, {headers: {'content-type': 'video/mp4', 'accept-ranges': 'bytes'}});
  await verifyPublicMedia({fetchImpl, baseUrl: 'https://cc18.pages.dev', path: '/media/work.mp4', kind: 'video'});
  await assert.rejects(
    verifyPublicMedia({fetchImpl: async () => new Response(null, {headers: {'content-type': 'text/plain'}}), baseUrl: 'https://cc18.pages.dev', path: '/media/work.mp4', kind: 'video'}),
    /not video\/mp4/,
  );
});
