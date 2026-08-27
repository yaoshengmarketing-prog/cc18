import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {approveAfterAutomatedQa} from '../scripts/editorial/lib/approval.mjs';

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
