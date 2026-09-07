import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {assertEditorialProviderReady, extractResponseText, requestStructuredEditorial, responsesEndpoint, usageReceipt} from '../scripts/editorial/lib/openai-writer.mjs';

const config = {
  provider: 'aitokenking', base_url: 'https://api.aitokenking.com.tw/api/v1', api_key_env: 'AITOKENKING_API_KEY',
  allowed_hosts: ['api.aitokenking.com.tw'], model: 'gpt-5.4', reasoning_effort: 'medium', max_output_tokens: 100,
  request_timeout_seconds: 1, api_retry_count: 1, store: false,
  pricing: {
    as_of: '2026-08-26', input_per_million_tokens: 5, cached_input_per_million_tokens: 0.5, output_per_million_tokens: 22.5,
    payg_recharge_fee_percent: 5,
    direct_openai_reference: {input_per_million_tokens: 2.5, cached_input_per_million_tokens: 0.25, output_per_million_tokens: 15},
  },
};

test('repository provider configuration resolves to the allowlisted gateway endpoint', async () => {
  const repositoryConfig = JSON.parse(await readFile(new URL('../config/editorial-model.json', import.meta.url), 'utf8'));
  assert.equal(repositoryConfig.api_key_env, 'AITOKENKING_API_KEY');
  assert.equal(responsesEndpoint(repositoryConfig), 'https://api.aitokenking.com.tw/api/v1/responses');
});

test('provider preflight fails closed without a key', () => {
  assert.throws(() => assertEditorialProviderReady(config, {}), {code: 'EDITORIAL_PROVIDER_NOT_CONFIGURED'});
  assert.doesNotThrow(() => assertEditorialProviderReady(config, {AITOKENKING_API_KEY: 'test-only'}));
  assert.equal(responsesEndpoint(config), 'https://api.aitokenking.com.tw/api/v1/responses');
  assert.throws(() => responsesEndpoint({...config, base_url: 'https://example.com/v1'}), /not allowlisted/);
});

test('response text and estimated usage are extracted without storing content', () => {
  const response = {
    model: 'gpt-5.4-2026-08-06',
    output: [{content: [{type: 'output_text', text: '{"ok":true}'}]}],
    usage: {input_tokens: 1000, input_tokens_details: {cached_tokens: 200}, output_tokens: 500, total_tokens: 1500},
  };
  assert.equal(extractResponseText(response), '{"ok":true}');
  assert.deepEqual(usageReceipt(response, config), {
    provider: 'aitokenking', model: 'gpt-5.4-2026-08-06', input_tokens: 1000, cached_input_tokens: 200,
    output_tokens: 500, total_tokens: 1500, estimated_cost_usd: 0.01535, estimated_payg_cash_cost_usd: 0.016117,
    direct_openai_reference_usd: 0.00955, gateway_premium_usd: 0.0058, pricing_as_of: '2026-08-26', store: false,
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

test('provider content filter uses one deterministic source fallback without repeating the prompt', async () => {
  let calls = 0;
  const result = await requestStructuredEditorial({
    apiKey: 'test-only',
    config: {...config, api_retry_count: 3},
    schema: {type: 'object'},
    instructions: 'full draft',
    input: {movie_id: 'FILTER-001'},
    contentFilterFallbackText: '{}',
    fetchImplementation: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        error: {
          code: 'content_filter',
          message: 'request filtered',
          innererror: {code: 'ResponsibleAIPolicyViolation'},
        },
      }), {status: 400, headers: {'content-type': 'application/json'}});
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, {text: '{}', usage: null, fallback: 'provider_content_filter'});
});

test('gateway-wrapped provider content filter also falls back after one request', async () => {
  let calls = 0;
  const result = await requestStructuredEditorial({
    apiKey: 'test-only',
    config: {...config, api_retry_count: 3},
    schema: {type: 'object'},
    instructions: 'full draft',
    input: {movie_id: 'FILTER-002'},
    contentFilterFallbackText: '{}',
    fetchImplementation: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        error: {
          message: JSON.stringify({
            error: {
              code: 'content_filter',
              innererror: {code: 'ResponsibleAIPolicyViolation'},
            },
          }),
        },
      }), {status: 400, headers: {'content-type': 'application/json'}});
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.fallback, 'provider_content_filter');
});

test('blank short_review uses one targeted repair request instead of regenerating the draft', async () => {
  let calls = 0;
  const requestBodies = [];
  const result = await requestStructuredEditorial({
    apiKey: 'test-only',
    config: {...config, api_retry_count: 2},
    schema: {type: 'object'},
    instructions: 'system',
    input: {movie_id: 'YAKO-099'},
    requiredNonBlankFields: ['short_review'],
    blankFieldRepair: {
      field: 'short_review',
      schema: {type: 'object', required: ['short_review'], properties: {short_review: {type: 'string'}}},
      instructions: 'repair short review only',
      input: {movie_id: 'YAKO-099', public_source: {core_source_concept: '來源設定'}, editorial_brief: {positioning: '選片定位'}},
    },
    fetchImplementation: async (_url, options) => {
      calls += 1;
      requestBodies.push(JSON.parse(options.body));
      const text = calls === 1
        ? '{"title":"YAKO-099 測試","short_review":"   ","sections":["keep"]}'
        : '{"short_review":"具體且可追溯的作品摘要。"}';
      return new Response(JSON.stringify({
        model: 'gpt-5.4', output: [{content: [{type: 'output_text', text}]}],
        usage: {input_tokens: 10, output_tokens: 5, total_tokens: 15},
      }), {status: 200, headers: {'content-type': 'application/json'}});
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(requestBodies[0].text.format.schema, {type: 'object'});
  assert.deepEqual(requestBodies[1].text.format.schema.required, ['short_review']);
  assert.equal(requestBodies[1].instructions, 'repair short review only');
  assert.deepEqual(JSON.parse(requestBodies[1].input), {
    movie_id: 'YAKO-099', public_source: {core_source_concept: '來源設定'}, editorial_brief: {positioning: '選片定位'},
  });
  assert.equal(JSON.parse(result.text).title, 'YAKO-099 測試');
  assert.deepEqual(JSON.parse(result.text).sections, ['keep']);
  assert.equal(JSON.parse(result.text).short_review, '具體且可追溯的作品摘要。');
});

test('a blank targeted short_review repair stops with provider, model and original failure', async () => {
  let calls = 0;
  await assert.rejects(() => requestStructuredEditorial({
    apiKey: 'test-only',
    config: {...config, api_retry_count: 2},
    schema: {type: 'object'},
    instructions: 'full draft',
    input: {movie_id: 'YAKO-099'},
    requiredNonBlankFields: ['short_review'],
    blankFieldRepair: {
      field: 'short_review',
      schema: {type: 'object', required: ['short_review'], properties: {short_review: {type: 'string'}}},
      instructions: 'repair short review only',
      input: {movie_id: 'YAKO-099', public_source: {}, editorial_brief: {}},
    },
    fetchImplementation: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        model: 'gpt-5.4', output: [{content: [{type: 'output_text', text: '{"short_review":"  "}'}]}],
        usage: {input_tokens: 10, output_tokens: 5, total_tokens: 15},
      }), {status: 200, headers: {'content-type': 'application/json'}});
    },
  }), /aitokenking\/gpt-5\.4 targeted short_review repair failed; original failure: Editorial provider returned blank required field: short_review/);
  assert.equal(calls, 2);
});

test('non-blank short_review continues without an unnecessary retry', async () => {
  let calls = 0;
  const result = await requestStructuredEditorial({
    apiKey: 'test-only',
    config: {...config, api_retry_count: 2},
    schema: {type: 'object'},
    instructions: 'system',
    input: {movie_id: 'YAKO-099'},
    requiredNonBlankFields: ['short_review'],
    fetchImplementation: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        model: 'gpt-5.4', output: [{content: [{type: 'output_text', text: '{"short_review":"正常摘要"}'}]}],
        usage: {input_tokens: 10, output_tokens: 5, total_tokens: 15},
      }), {status: 200, headers: {'content-type': 'application/json'}});
    },
  });
  assert.equal(calls, 1);
  assert.equal(JSON.parse(result.text).short_review, '正常摘要');
});
