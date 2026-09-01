import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  loadPublishedWorkEvidenceCatalog,
  projectMovieMasterEvidence,
} from '../src/lib/movie-master.mjs';

const catalogCode = 'TEST-001';
const stableMovieId = `cc18:${catalogCode}`;
const publicMaster = () => ({
  stable_movie_id: stableMovieId,
  source: {catalog_code: catalogCode},
  editorial: {
    article_evidence_level: 'PUBLIC_METADATA',
    article_evidence_scope: 'SOURCE_TITLE_DESCRIPTION_TAGS',
  },
  evidence: {records: []},
  publishing: {canonical_url: '/works/test-001/'},
});
const publicSearch = (sampleWindows = 0) => ({
  movie_id: catalogCode,
  evidence_job_id: null,
  sample_windows: sampleWindows,
  timeline_summary: [],
});
const distributedFixture = () => {
  const jobId = '11111111-2222-3333-4444-555555555555';
  const timeline = [{
    phase: 'opening',
    label: '開端觀察',
    summary: '只描述已抽樣窗口內可見內容。',
    evidence_windows: [0, 2],
  }];
  const master = publicMaster();
  master.editorial = {
    article_evidence_level: 'DISTRIBUTED_SAMPLE',
    article_evidence_scope: 'DISTRIBUTED_VIDEO_SAMPLE',
  };
  master.evidence.records = [{
    evidence_id: `cc18:${catalogCode}:distributed-sample:${jobId}`,
    movie_id: stableMovieId,
    evidence_level: 'DISTRIBUTED_SAMPLE',
    evidence_status: 'VALID',
    validation_status: 'VALID',
    analysis_method: 'distributed_sampling',
    source_identity_hash: 'sha256:fixture',
    coverage_summary: {sample_windows: 3},
    observation_summary: timeline,
  }];
  const searchContent = {
    movie_id: catalogCode,
    evidence_job_id: jobId,
    source_snapshot_hash: 'sha256:fixture',
    sample_windows: 3,
    timeline_summary: structuredClone(timeline),
  };
  return {master, searchContent};
};

test('PUBLIC_METADATA projects only when Movie Master and Search Content deny video Evidence', () => {
  for (const windows of [0, null]) {
    const projected = projectMovieMasterEvidence({master: publicMaster(), searchContent: publicSearch(windows)});
    assert.equal(projected.evidence_level, 'PUBLIC_METADATA');
    assert.equal(projected.evidence_scope, 'SOURCE_TITLE_DESCRIPTION_TAGS');
    assert.equal(projected.sample_windows, null);
    assert.deepEqual(projected.timeline, []);
  }
});

test('Search Content cannot promote a PUBLIC_METADATA Movie Master', () => {
  for (const patch of [
    {evidence_job_id: 'job-only'},
    {sample_windows: 2},
    {timeline_summary: [{phase: 'opening'}]},
  ]) {
    assert.throws(
      () => projectMovieMasterEvidence({master: publicMaster(), searchContent: {...publicSearch(), ...patch}}),
      /PUBLIC_METADATA Search Content/u,
    );
  }
});

test('DISTRIBUTED_SAMPLE projects its timeline only from the validated Movie Master record', () => {
  const {master, searchContent} = distributedFixture();
  const projected = projectMovieMasterEvidence({master, searchContent});
  assert.equal(projected.evidence_level, 'DISTRIBUTED_SAMPLE');
  assert.equal(projected.evidence_scope, 'DISTRIBUTED_VIDEO_SAMPLE');
  assert.equal(projected.sample_windows, 3);
  assert.deepEqual(projected.timeline, master.evidence.records[0].observation_summary);
  assert.notEqual(projected.timeline, searchContent.timeline_summary);
});

test('Evidence authority mismatches fail closed', () => {
  const cases = [
    ['public scope', () => ({master: publicMaster(), searchContent: publicSearch()}), ({master}) => { master.editorial.article_evidence_scope = 'DISTRIBUTED_VIDEO_SAMPLE'; }],
    ['public record', () => ({master: publicMaster(), searchContent: publicSearch()}), ({master}) => { master.evidence.records.push({}); }],
    ['unknown level', () => ({master: publicMaster(), searchContent: publicSearch()}), ({master}) => { master.editorial.article_evidence_level = 'UNKNOWN'; }],
    ['distributed scope', distributedFixture, ({master}) => { master.editorial.article_evidence_scope = 'SOURCE_TITLE_DESCRIPTION_TAGS'; }],
    ['missing record', distributedFixture, ({master}) => { master.evidence.records = []; }],
    ['multiple records', distributedFixture, ({master}) => { master.evidence.records.push(structuredClone(master.evidence.records[0])); }],
    ['record movie ID', distributedFixture, ({master}) => { master.evidence.records[0].movie_id = 'cc18:OTHER-001'; }],
    ['record level', distributedFixture, ({master}) => { master.evidence.records[0].evidence_level = 'PUBLIC_METADATA'; }],
    ['evidence status', distributedFixture, ({master}) => { master.evidence.records[0].evidence_status = 'STALE'; }],
    ['validation status', distributedFixture, ({master}) => { master.evidence.records[0].validation_status = 'INVALID'; }],
    ['analysis method', distributedFixture, ({master}) => { master.evidence.records[0].analysis_method = 'full_view'; }],
    ['window count zero', distributedFixture, ({master}) => { master.evidence.records[0].coverage_summary.sample_windows = 0; }],
    ['job ID', distributedFixture, ({searchContent}) => { searchContent.evidence_job_id = 'other-job'; }],
    ['source hash', distributedFixture, ({searchContent}) => { searchContent.source_snapshot_hash = 'sha256:other'; }],
    ['window count mismatch', distributedFixture, ({searchContent}) => { searchContent.sample_windows = 2; }],
    ['timeline mismatch', distributedFixture, ({searchContent}) => { searchContent.timeline_summary[0].summary = 'different'; }],
    ['timeline window out of range', distributedFixture, ({master, searchContent}) => {
      master.evidence.records[0].observation_summary[0].evidence_windows = [3];
      searchContent.timeline_summary[0].evidence_windows = [3];
    }],
  ];
  for (const [label, makeFixture, mutate] of cases) {
    const fixture = makeFixture();
    mutate(fixture);
    assert.throws(
      () => projectMovieMasterEvidence(fixture),
      Error,
      label,
    );
  }
});

test('the live published catalog is exactly 15 PUBLIC_METADATA and one valid HUNTC-568 sample', async () => {
  const {records} = await loadPublishedWorkEvidenceCatalog();
  assert.equal(records.length, 16);
  assert.equal(records.filter(({evidence_level: level}) => level === 'PUBLIC_METADATA').length, 15);
  assert.equal(records.filter(({evidence_level: level}) => level === 'DISTRIBUTED_SAMPLE').length, 1);
  const sampled = records.find(({evidence_level: level}) => level === 'DISTRIBUTED_SAMPLE');
  assert.equal(sampled.catalog_code, 'HUNTC-568');
  assert.equal(sampled.sample_windows, 24);
  assert.equal(sampled.timeline.length, 3);
});

test('work route emits one semantic Evidence notice in the approved component order', async () => {
  const [route, notice, guide] = await Promise.all([
    readFile(new URL('../src/pages/works/[id].astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/EvidenceNotice.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DecisionGuide.astro', import.meta.url), 'utf8'),
  ]);
  const order = ['<WorkFacts ', '<EvidenceNotice ', '<TopicElements ', '<DecisionGuide '].map((token) => route.indexOf(token));
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  assert.match(route, /loadPublishedWorkEvidenceCatalog\(\)/u);
  assert.doesNotMatch(route, /search\?\.sample_windows|本篇另參考|完整影片內容請以原始作品頁為準/u);
  assert.match(notice, /依據：公開來源資料/u);
  assert.match(notice, /依據：分散影片抽樣/u);
  assert.match(notice, />資料依據</u);
  assert.match(notice, /查看資料與編輯方法/u);
  assert.match(notice, /data-evidence-notice/u);
  assert.doesNotMatch(notice, /data-evidence-level|EVIDENCE SCOPE|aria-live|<script|tabindex="[1-9]/u);
  assert.doesNotMatch(guide, /content\.sample_windows|content\.timeline_summary|尚未加入影片時間軸判讀/u);
});
