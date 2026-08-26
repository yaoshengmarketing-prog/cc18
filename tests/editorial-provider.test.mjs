import assert from 'node:assert/strict';
import test from 'node:test';
import {assertEditorialProviderReady, extractResponseText, requestStructuredEditorial, usageReceipt} from '../scripts/editorial/lib/openai-writer.mjs';

const config = {
  provider: 'openai', model: 'gpt-5.4', reasoning_effort: 'medium', max_output_tokens: 100,
  request_timeout_seconds: 1, api_retry_count: 1, store: false,
  pricing: {as_of: '2026-08-26', input_per_million_tokens: 2.5, cached_input_per_million_tokens: 0.25, output_per_million_tokens: 15},
};

test('provider preflight fails closed without a key', () => {
  assert.throws(() => assertEditorialProviderReady(config, {}), {code: 'EDITORIAL_PROVIDER_NOT_CONFIGURED'});
  assert.doesNotThrow(() => assertEditorialProviderReady(config, {OPENAI_API_KEY: 'test-only'}));
});

test('response text and estimated usage are extracted without storing content', () => {
  const response = {
    model: 'gpt-5.4-2026-08-06',
    output: [{content: [{type: 'output_text', text: '{"ok":true}'}]}],
    usage: {input_tokens: 1000, input_tokens_details: {cached_tokens: 200}, output_tokens: 500, total_tokens: 1500},
  };
  assert.equal(extractResponseText(response), '{"ok":true}');
  assert.deepEqual(usageReceipt(response, config), {
    provider: 'openai', model: 'gpt-5.4-2026-08-06', input_tokens: 1000, cached_input_tokens: 200,
    output_tokens: 500, total_tokens: 1500, estimated_cost_usd: 0.00955, pricing_as_of: '2026-08-26', store: false,
  });
});

test('structured request uses Responses API schema and store false', async () => {
  let requestBody;
  const result = await requestStructuredEditorial({
    apiKey: 'test-only', config, schema: {type: 'object'}, instructions: 'system', input: {movie_id: 'TEST-001'},
    fetchImplementation: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        model: 'gpt-5.4', output: [{content: [{type: 'output_text', text: '{"ok":true}'}]}],
        usage: {input_tokens: 10, output_tokens: 5, total_tokens: 15},
      }), {status: 200, headers: {'content-type': 'application/json'}});
    },
  });
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.text.format.type, 'json_schema');
  assert.equal(requestBody.text.format.strict, true);
  assert.equal(result.text, '{"ok":true}');
});
