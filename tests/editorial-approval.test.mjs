import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {assertTitleOnlyChange, stripApprovedTitleFields} from '../scripts/editorial/refresh-approved-title-hash.mjs';
import {approveAfterAutomatedQa, assertFreshAutomatedQa} from '../scripts/editorial/lib/approval.mjs';

const approvalFixture = ({
  reviewStatus = 'draft',
  registryPublishedAt = null,
  markdownPublishedAt = '2026-08-26',
  body = '內容',
} = {}) => ({
  movieId: 'TEST-001',
  markdown: `---\nid: TEST-001\nreleaseDate: 2026-08-26\npublishedAt: ${markdownPublishedAt}\nstatus: ${reviewStatus}\n---\n\n${body}\n`,
  quality: {
    id: 'TEST-001',
    approved_for_publish: reviewStatus === 'published',
    approved_at: reviewStatus === 'published' ? '2026-08-25T03:04:05.000Z' : null,
  },
  registry: {
    updated_at: '2026-08-26T01:02:03.000Z',
    records: [{id: 'TEST-001', review_status: reviewStatus, published_at: registryPublishedAt}],
  },
});

test('first approval establishes the Registry date without promoting the draft legacy date', () => {
  const fixture = approvalFixture({registryPublishedAt: '2026-08-26'});
  const result = approveAfterAutomatedQa({
    ...fixture,
    publishedAt: '2026-08-27',
  });
  assert.match(result.markdown, /^status: published$/m);
  assert.match(result.markdown, /^publishedAt: 2026-08-27$/m);
  assert.equal(result.quality.approved_for_publish, true);
  assert.equal(result.quality.review_sha256, createHash('sha256').update(result.markdown).digest('hex'));
  assert.equal(result.registry.records[0].review_status, 'published');
  assert.equal(result.registry.records[0].published_at, '2026-08-27');
  assert.notEqual(result.registry.updated_at, '2026-08-26T01:02:03.000Z');
});

test('first approval inserts publishedAt after one valid releaseDate when the field is absent', () => {
  const fixture = approvalFixture();
  fixture.markdown = fixture.markdown.replace(/^publishedAt:.*\n/m, '');
  const result = approveAfterAutomatedQa({...fixture, publishedAt: '2026-08-27'});
  assert.match(result.markdown, /^releaseDate: 2026-08-26\npublishedAt: 2026-08-27$/m);
});

test('approval fails atomically when neither publishedAt nor a valid releaseDate can anchor it', () => {
  const fixture = approvalFixture();
  fixture.markdown = fixture.markdown.replace(/^releaseDate:.*\n/m, '').replace(/^publishedAt:.*\n/m, '');
  const before = structuredClone(fixture);
  assert.throws(
    () => approveAfterAutomatedQa({...fixture, publishedAt: '2026-08-27'}),
    /cannot safely add publishedAt without one valid releaseDate/,
  );
  assert.deepEqual(fixture, before);
});

test('approval rejects duplicate publishedAt fields without partial mutation', () => {
  const fixture = approvalFixture();
  fixture.markdown = fixture.markdown.replace(
    /^publishedAt:.*$/m,
    'publishedAt: 2026-08-25\npublishedAt: 2026-08-26',
  );
  const before = structuredClone(fixture);
  assert.throws(
    () => approveAfterAutomatedQa({...fixture, publishedAt: '2026-08-27'}),
    /duplicate publishedAt fields/,
  );
  assert.deepEqual(fixture, before);
});

test('one conflicting Markdown publishedAt is replaced by the authoritative Registry date', () => {
  const fixture = approvalFixture({
    reviewStatus: 'published',
    registryPublishedAt: '2026-08-25',
    markdownPublishedAt: '2026-09-30',
  });
  const result = approveAfterAutomatedQa({...fixture, publishedAt: '2026-10-01'});
  assert.equal([...result.markdown.matchAll(/^publishedAt:\s*(.+)$/gm)].length, 1);
  assert.match(result.markdown, /^publishedAt: 2026-08-25$/m);
});

const assertApprovalEntryWiring = async (entryPoint) => {
  const source = await readFile(new URL(`../${entryPoint}`, import.meta.url), 'utf8');
  const assignment = source.match(/const\s+(\w+)\s*=\s*approveAfterAutomatedQa\s*\(/u);
  assert.ok(assignment, `${entryPoint} must assign the shared approval result`);
  const resultName = assignment[1];
  assert.match(source, new RegExp(`writeFile\\(reviewPath, ${resultName}\\.markdown, ['"]utf8['"]\\)`), entryPoint);
  assert.match(source, new RegExp(`JSON\\.stringify\\(${resultName}\\.quality, null, 2\\)`), entryPoint);
  assert.match(source, new RegExp(`JSON\\.stringify\\(${resultName}\\.registry, null, 2\\)`), entryPoint);
  const afterApprovalWrites = source.slice(source.indexOf('await Promise.all', assignment.index));
  assert.doesNotMatch(afterApprovalWrites, /(?:publishedAt|published_at)\s*=/u, `${entryPoint} must not overwrite dates after shared approval`);
  assert.doesNotMatch(afterApprovalWrites, /writeFile\(reviewPath,\s*markdown\b/u, `${entryPoint} must write returned Markdown`);
  return source;
};

test('all reapproval entry points satisfy the shared approval wiring contract and preserve dates', async () => {
  const entryPoints = [
    'scripts/editorial/finalize-qa-d1.mjs',
    'scripts/editorial/handoff-d1.mjs',
    'scripts/editorial/rehydrate-completed.mjs',
  ];

  for (const entryPoint of entryPoints) {
    await assertApprovalEntryWiring(entryPoint);
    const fixture = approvalFixture({
      reviewStatus: 'published',
      registryPublishedAt: '2026-08-25',
      markdownPublishedAt: '2026-09-30',
      body: `由 ${entryPoint} 再次核准`,
    });
    const originalRegistryUpdatedAt = fixture.registry.updated_at;
    const result = approveAfterAutomatedQa({...fixture, publishedAt: '2026-10-01'});
    assert.match(result.markdown, /^publishedAt: 2026-08-25$/m, entryPoint);
    assert.equal(result.registry.records[0].published_at, '2026-08-25', entryPoint);
    assert.equal(result.quality.approved_at, '2026-08-25T03:04:05.000Z', entryPoint);
    assert.equal(result.registry.updated_at, originalRegistryUpdatedAt, entryPoint);
  }
});

test('a repaired published review keeps its first published date when it re-enters handoff approval', async () => {
  const handoffSource = await assertApprovalEntryWiring('scripts/editorial/handoff-d1.mjs');
  assert.ok(handoffSource.indexOf('repair-draft.mjs') < handoffSource.indexOf('const approvedArtifacts = approveAfterAutomatedQa'));
  const fixture = approvalFixture({
    reviewStatus: 'published',
    registryPublishedAt: '2026-08-25',
    markdownPublishedAt: '2026-08-25',
    body: '局部修稿後內容',
  });
  const result = approveAfterAutomatedQa({...fixture, publishedAt: '2026-10-02'});
  assert.match(result.markdown, /^publishedAt: 2026-08-25$/m);
  assert.equal(result.registry.records[0].published_at, '2026-08-25');
  assert.equal(result.quality.review_sha256, createHash('sha256').update(result.markdown).digest('hex'));
});

test('published records with missing or invalid first dates fail closed without partial mutation', () => {
  for (const registryPublishedAt of [null, '', '2026-02-30', '08/25/2026']) {
    const fixture = approvalFixture({reviewStatus: 'published', registryPublishedAt});
    const before = structuredClone(fixture);
    assert.throws(
      () => approveAfterAutomatedQa({...fixture, publishedAt: '2026-10-03'}),
      /missing a valid first published_at; human confirmation is required/,
    );
    assert.deepEqual(fixture, before);
  }
});

test('repeating an identical approval is idempotent even when a later proposed date is supplied', () => {
  const first = approveAfterAutomatedQa({...approvalFixture(), publishedAt: '2026-08-27'});
  const firstSnapshot = structuredClone(first);
  const second = approveAfterAutomatedQa({
    movieId: 'TEST-001',
    markdown: first.markdown,
    quality: first.quality,
    registry: first.registry,
    publishedAt: '2026-11-01',
  });
  assert.deepEqual(second, firstSnapshot);
});

test('approved title hash refresh accepts only the approved title frontmatter fields', () => {
  const before = `---\nid: TEST-001\ntitle: "舊標題"\nseoTitle: "舊 SEO"\nsocialTitle: "舊社群"\ntitleSignals:\n  - "舊訊號一"\n  - "舊訊號二"\ntitleVersion: 1\nshortReview: "摘要"\n---\n\n正文\n`;
  const after = `---\nid: TEST-001\ntitle: "新標題"\ndisplayShortTitle: "新短標題"\nseoTitle: "新 SEO"\nsocialTitle: "新 SEO"\ntitleSignals:\n  - "新訊號一"\n  - "新訊號二"\ntitleVersion: 2\nshortReview: "摘要"\n---\n\n正文\n`;
  assertTitleOnlyChange({movieId: 'TEST-001', previousMarkdown: before, nextMarkdown: after});
  assert.equal(stripApprovedTitleFields(before), stripApprovedTitleFields(after));
  assert.throws(() => assertTitleOnlyChange({
    movieId: 'TEST-001', previousMarkdown: before, nextMarkdown: after.replace('正文', '正文遭修改'),
  }), /outside approved title frontmatter fields/);
});

test('automated QA report must match the exact draft hash', () => {
  const markdown = '---\nid: TEST-001\nstatus: draft\n---\n\n內容\n';
  const report = {
    id: 'TEST-001',
    passed: true,
    issues: [],
    review_sha256: createHash('sha256').update(markdown).digest('hex'),
  };
  assert.equal(assertFreshAutomatedQa({movieId: 'TEST-001', markdown, report}), report.review_sha256);
  assert.throws(() => assertFreshAutomatedQa({movieId: 'TEST-001', markdown: `${markdown}已修改`, report}), /stale/);
});

test('PASS_WITH_NOTES remains publishable while LOCAL_REPAIR does not', () => {
  const markdown = '---\nid: TEST-001\nstatus: draft\n---\n\n內容\n';
  const hash = createHash('sha256').update(markdown).digest('hex');
  assert.equal(assertFreshAutomatedQa({
    movieId: 'TEST-001',
    markdown,
    report: {id: 'TEST-001', status: 'PASS_WITH_NOTES', passed: true, issues: [], notes: ['formulaic_pivot_observed'], review_sha256: hash},
  }), hash);
  assert.throws(() => assertFreshAutomatedQa({
    movieId: 'TEST-001',
    markdown,
    report: {id: 'TEST-001', status: 'LOCAL_REPAIR', passed: false, issues: [], repair_issues: ['formulaic_machine_voice'], review_sha256: hash},
  }), /not approved/);
});
