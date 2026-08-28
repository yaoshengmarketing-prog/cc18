import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ensureAllPerformersInTitle, fillMissingEditorialTitle} from '../scripts/editorial/lib/editorial-fallbacks.mjs';
import {appendEditorialUsage} from '../scripts/editorial/lib/usage-ledger.mjs';

test('missing provider title falls back to identity and a traceable source concept', () => {
  const result = {title: ''};
  const used = fillMissingEditorialTitle({
    result,
    movieId: 'TEST-001',
    source: {actress: ['測試演員']},
    safePublicSource: {core_source_concept: '來源企劃概念', safe_title_signals: []},
  });
  assert.equal(used, true);
  assert.equal(result.title, 'TEST-001 測試演員｜來源企劃概念');
});

test('multi-performer titles retain every source performer before publication', () => {
  const title = ensureAllPerformersInTitle({
    value: 'DSOD-006 一ノ瀬ラム｜空服員企劃解析',
    movieId: 'DSOD-006',
    performers: ['一ノ瀬ラム', '池田真理奈', '柚木れんか', '柊もみじ'],
    maximumLength: 90,
  });
  assert.equal(title, 'DSOD-006 一ノ瀬ラム、池田真理奈、柚木れんか、柊もみじ｜空服員企劃解析');
});

test('usage is recorded before downstream validation can fail', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc18-usage-'));
  try {
    await appendEditorialUsage({root, movieId: 'TEST-001', rewriteAttempt: 1, usage: {
      model: 'test', input_tokens: 100, cached_input_tokens: 10, output_tokens: 50,
      estimated_cost_usd: 0.02, estimated_payg_cash_cost_usd: 0.021,
      direct_openai_reference_usd: 0.01, gateway_premium_usd: 0.01,
    }});
    const receipt = JSON.parse(await readFile(join(root, 'data/editorial-usage/TEST-001.json'), 'utf8'));
    assert.equal(receipt.calls.length, 1);
    assert.equal(receipt.totals.estimated_cost_usd, 0.02);
  } finally {
    await rm(root, {recursive: true});
  }
});
