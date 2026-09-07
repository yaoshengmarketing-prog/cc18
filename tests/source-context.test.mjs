import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSourceContext, auditWriterSource} from '../scripts/editorial/lib/source-context.mjs';

test('transmits intact source sentences with verifiable offsets, including negation', () => {
  const source = {description: '這不是訪談，而是一部旅行紀錄。\n兩位同事在旅館重逢。'};
  const {excerpts} = buildSourceContext(source);
  assert.equal(excerpts.length, 2);
  for (const item of excerpts) assert.equal(source.description.slice(item.source_start, item.source_start + item.text.length), item.text);
  assert.match(excerpts[0].text, /不是訪談/);
});
test('does not splice a graphic sentence into a misleading neutral assertion', () => {
  const {excerpts, audit} = buildSourceContext({description: '旅行企劃包括性交描寫。攝影師接受訪談。'});
  assert.deepEqual(excerpts.map(x => x.text), ['攝影師接受訪談。']);
  assert.equal(audit.omitted_sentences.graphic, 1);
});
test('distinguishes absent source from source omitted during transmission', () => {
  const publicSource = {source_context: []};
  assert.equal(auditWriterSource({source: {}, publicSource}).context_status, 'source_description_missing');
  assert.equal(auditWriterSource({source: {description: '一句沒有背景的宣傳語。'}, publicSource}).context_status,
    'description_present_but_no_context_transmitted');
});
test('source context availability never asserts review quality', () => {
  const source = {description: '這是旅行紀錄。'};
  const publicSource = {source_context: buildSourceContext(source).excerpts};
  const audit = auditWriterSource({source, publicSource});
  assert.equal(audit.context_status, 'source_context_available');
  assert.equal(audit.quality_assured, false);
});
test('bounds payload by complete sentences and records omissions', () => {
  const {excerpts, audit} = buildSourceContext({description: Array.from({length: 10}, (_, i) => `旅行 ${i}${'背景'.repeat(200)}。`).join('')});
  assert.ok(excerpts.reduce((n, x) => n + x.text.length, 0) <= 2400);
  assert.ok(excerpts.every(x => x.text.endsWith('。')));
  assert.ok(audit.omitted_sentences.budget > 0);
});
