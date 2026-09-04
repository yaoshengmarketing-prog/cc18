import test from 'node:test';
import assert from 'node:assert/strict';
import {frontmatterValue, releaseIdFromHtml, selectPublishChanges, unexpectedPublishPaths, verifyLiveRelease, verifyPublicMedia} from '../scripts/publish/lib/publisher.mjs';

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

test('publisher commits one work and its generated projections while ignoring pre-existing untracked drafts', () => {
  const result = selectPublishChanges({
    movieId: 'TEST-001',
    trackedPaths: ['data/movie-registry.json', 'data/movie-master/index.json', 'data/search-index-v1.json'],
    untrackedPaths: [
      'content/reviews/TEST-001.md',
      'data/movie-master/test-001.json',
      'content/reviews/UNRELATED-002.md',
      'data/source-records/UNRELATED-002.json',
    ],
  });
  assert.deepEqual(result.selected, [
    'content/reviews/TEST-001.md',
    'data/movie-master/index.json',
    'data/movie-master/test-001.json',
    'data/movie-registry.json',
    'data/search-index-v1.json',
  ]);
  assert.deepEqual(result.ignoredUntracked, [
    'content/reviews/UNRELATED-002.md',
    'data/source-records/UNRELATED-002.json',
  ]);
  assert.throws(() => selectPublishChanges({movieId: 'TEST-001', trackedPaths: ['README.md']}), /unrelated tracked changes/);
});

test('publisher builds exact first-publish projections before validation and commit', async () => {
  const source = await import('node:fs/promises').then(({readFile}) => readFile(new URL('../scripts/publish/process-d1-one.mjs', import.meta.url), 'utf8'));
  const masterWrite = source.indexOf("'scripts/build-movie-master.mjs'), '--write', `--include-work=${movieId}`");
  const astroBuild = source.indexOf("'scripts/astro-build.mjs')");
  const masterCheck = source.indexOf("'scripts/build-movie-master.mjs'), '--check', `--include-work=${movieId}`");
  const gitAdd = source.indexOf("await run('git', ['add'");
  assert.ok(masterWrite >= 0 && masterWrite < astroBuild);
  assert.ok(astroBuild < masterCheck && masterCheck < gitAdd);
  assert.match(source, /job\?\.status === 'failed'[\s\S]*requeueFailedPublish/u);
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
