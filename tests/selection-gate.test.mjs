import assert from 'node:assert/strict';
import test from 'node:test';
import {jaccard, selectionIssues, shingles} from '../scripts/editorial/lib/selection-gate.mjs';
import {publicMetaDescription} from '../src/lib/meta-description.mjs';

const dimensions = ['identity_integrity', 'specificity', 'originality', 'narrative_coherence', 'analysis_depth', 'search_value', 'decision_value', 'low_repetition'];
const quality = {evidence: [{}, {}, {}], scores: Object.fromEntries(dimensions.map((key) => [key, 8]))};
const source = {title: '公開作品設定', description: '作品資料', source_tags: []};
const longBody = '公開資料可以協助讀者比較作品題材與演員設定。'.repeat(40);

test('selection gate accepts a grounded full-length draft with complete evidence and scores', () => {
  assert.deepEqual(selectionIssues({body: longBody, quality, source, scoreDimensions: dimensions}), []);
});

test('selection gate identifies all publication blockers and respects explicit risk approval', () => {
  const risky = {title: '女子高生設定', description: '來源說明'};
  const issues = selectionIssues({body: '短文', publicCopy: '目前沒有足夠的分散影片引用', quality: {evidence: [], scores: null},
    source: risky, scoreDimensions: dimensions, similarity: 0.7});
  assert.deepEqual(issues.map(({code}) => code), [
    'selection_body_too_short', 'selection_evidence_missing', 'selection_scores_missing',
    'selection_similarity', 'selection_internal_copy', 'selection_risk_review_required',
  ]);
  assert.ok(!selectionIssues({body: longBody, quality, source: risky, scoreDimensions: dimensions, approvedRisks: ['女子高生']})
    .some(({code}) => code === 'selection_risk_review_required'));
});

test('4-shingle similarity and thin-page meta copy', () => {
  assert.equal(jaccard(shingles('甲乙丙丁戊'), shingles('甲乙丙丁戊')), 1);
  assert.equal(jaccard(shingles('甲乙丙丁'), shingles('戊己庚辛')), 0);
  assert.equal(publicMetaDescription('SNOS-290｜目前沒有足夠的分散影片引用', 'title'),
    'SNOS-290｜整理公開作品資料、演員與題材設定，協助依作品資訊選片。');
});

test('v1.2 narrow standard: generic student, cosplay and childhood-friend terms do not require review', () => {
  for (const title of ['轉學生與老師', '女子大生', 'JK打扮的成年演員', '幼馴染', '義妹', '蘿莉系', '嬌小', '幼小嬌小的身體']) {
    assert.ok(!selectionIssues({body: longBody, quality, source: {title, description: '來源說明'}, scoreDimensions: dimensions})
      .some(({code}) => code === 'selection_risk_review_required'), title);
  }
});
