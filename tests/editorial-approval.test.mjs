import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertTitleOnlyChange, stripApprovedTitleFields} from '../scripts/editorial/refresh-approved-title-hash.mjs';
import {approveAfterAutomatedQa, assertFreshAutomatedQa} from '../scripts/editorial/lib/approval.mjs';

test('automated QA approval updates content, quality hash, and registry atomically', () => {
  const result = approveAfterAutomatedQa({
    movieId: 'TEST-001',
    markdown: '---\nid: TEST-001\nreleaseDate: 2026-08-26\npublishedAt: 2026-08-26\nstatus: draft\n---\n\n內容\n',
    quality: {id: 'TEST-001', approved_for_publish: false},
    registry: {updated_at: null, records: [{id: 'TEST-001', review_status: 'draft', published_at: null}]},
    publishedAt: '2026-08-27',
  });
  assert.match(result.markdown, /^status: published$/m);
  assert.match(result.markdown, /^publishedAt: 2026-08-27$/m);
  assert.equal(result.quality.approved_for_publish, true);
  assert.equal(result.quality.review_sha256, createHash('sha256').update(result.markdown).digest('hex'));
  assert.equal(result.registry.records[0].review_status, 'published');
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
