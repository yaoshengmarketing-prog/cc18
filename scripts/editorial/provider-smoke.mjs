import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {
  assertEditorialProviderReady,
  editorialApiKey,
  loadLocalEditorialEnvironment,
  requestStructuredEditorial,
} from './lib/openai-writer.mjs';

const root = resolve(import.meta.dirname, '..', '..');
loadLocalEditorialEnvironment(root);
const config = JSON.parse(await readFile(resolve(root, 'config/editorial-model.json'), 'utf8'));
assertEditorialProviderReady(config);

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {status: {type: 'string', enum: ['ok']}},
};
const result = await requestStructuredEditorial({
  apiKey: editorialApiKey(config),
  config: {...config, max_output_tokens: 80, reasoning_effort: 'none', api_retry_count: 1},
  schema,
  instructions: 'Return only the requested structured value. Do not add prose.',
  input: {task: 'API connectivity and strict JSON Schema smoke test', expected: {status: 'ok'}},
});
const parsed = JSON.parse(result.text);
if (parsed.status !== 'ok') throw new Error('Provider smoke test returned an unexpected structured value');
console.log(JSON.stringify({status: 'ok', provider: result.usage.provider, model: result.usage.model, usage: result.usage}, null, 2));
