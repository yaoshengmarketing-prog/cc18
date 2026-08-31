import {resolve} from 'node:path';
import {parseFirstJsonObject} from './provider-normalization.mjs';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const tokenCost = ({inputTokens, cachedInputTokens, outputTokens}, pricing) => {
  if (!pricing) return null;
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  return (uncachedInputTokens * pricing.input_per_million_tokens
    + cachedInputTokens * pricing.cached_input_per_million_tokens
    + outputTokens * pricing.output_per_million_tokens) / 1_000_000;
};

export function loadLocalEditorialEnvironment(root) {
  try {
    process.loadEnvFile(resolve(root, '.dev.vars'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export function editorialApiKey(config, environment = process.env) {
  return environment[config.api_key_env ?? 'OPENAI_API_KEY']?.trim();
}

export function assertEditorialProviderReady(config, environment = process.env) {
  const keyName = config.api_key_env ?? 'OPENAI_API_KEY';
  if (!editorialApiKey(config, environment)) {
    throw Object.assign(
      new Error(`${keyName} is not configured; editorial job was not claimed`),
      {code: 'EDITORIAL_PROVIDER_NOT_CONFIGURED'},
    );
  }
}

export function responsesEndpoint(config) {
  const base = new URL(config.base_url ?? 'https://api.openai.com/v1');
  const allowedHosts = config.allowed_hosts ?? ['api.openai.com'];
  if (base.protocol !== 'https:' || !allowedHosts.includes(base.hostname)) {
    throw new Error(`Editorial provider host is not allowlisted: ${base.hostname}`);
  }
  return new URL(`${base.pathname.replace(/\/$/, '')}/responses`, base.origin).toString();
}

export function extractResponseText(response) {
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  throw new Error('OpenAI response contained no output_text');
}

export function usageReceipt(response, config) {
  const inputTokens = response.usage?.input_tokens ?? 0;
  const cachedInputTokens = response.usage?.input_tokens_details?.cached_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const pricing = config.pricing;
  const estimatedUsd = tokenCost({inputTokens, cachedInputTokens, outputTokens}, pricing);
  const directOpenaiUsd = tokenCost({inputTokens, cachedInputTokens, outputTokens}, pricing?.direct_openai_reference);
  const paygCashUsd = estimatedUsd === null
    ? null
    : estimatedUsd * (1 + Number(pricing?.payg_recharge_fee_percent ?? 0) / 100);
  return {
    provider: config.provider,
    model: response.model ?? config.model,
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    total_tokens: response.usage?.total_tokens ?? inputTokens + outputTokens,
    estimated_cost_usd: estimatedUsd === null ? null : Number(estimatedUsd.toFixed(6)),
    estimated_payg_cash_cost_usd: paygCashUsd === null ? null : Number(paygCashUsd.toFixed(6)),
    direct_openai_reference_usd: directOpenaiUsd === null ? null : Number(directOpenaiUsd.toFixed(6)),
    gateway_premium_usd: estimatedUsd === null || directOpenaiUsd === null ? null : Number((estimatedUsd - directOpenaiUsd).toFixed(6)),
    pricing_as_of: pricing?.as_of ?? null,
    store: false,
  };
}

export function assertNonBlankStructuredFields(text, requiredFields = []) {
  if (!requiredFields.length) return;
  const structured = parseFirstJsonObject(text);
  for (const field of requiredFields) {
    if (typeof structured[field] !== 'string' || !structured[field].trim()) {
      throw new Error(`Editorial provider returned blank required field: ${field}`);
    }
  }
}

export async function requestStructuredEditorial({
  apiKey,
  config,
  schema,
  instructions,
  input,
  requiredNonBlankFields = [],
  fetchImplementation = fetch,
}) {
  const attempts = Math.max(1, Number(config.api_retry_count ?? 1));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(config.request_timeout_seconds ?? 300) * 1000);
    try {
      const response = await fetchImplementation(responsesEndpoint(config), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: config.model,
          instructions,
          input: JSON.stringify(input),
          max_output_tokens: config.max_output_tokens,
          reasoning: {effort: config.reasoning_effort},
          store: false,
          text: {
            verbosity: 'medium',
            format: {
              type: 'json_schema',
              name: 'cc18_editorial_draft',
              strict: true,
              schema,
            },
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = Object.assign(
          new Error(`OpenAI Responses API returned HTTP ${response.status}: ${body.error?.message ?? 'unknown error'}`),
          {status: response.status},
        );
        if (![408, 409, 429].includes(response.status) && response.status < 500) throw error;
        lastError = error;
      } else {
        const text = extractResponseText(body);
        assertNonBlankStructuredFields(text, requiredNonBlankFields);
        return {text, usage: usageReceipt(body, config)};
      }
    } catch (error) {
      lastError = error;
      if (error?.status && ![408, 409, 429].includes(error.status) && error.status < 500) throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < attempts) await wait(500 * (2 ** (attempt - 1)));
  }
  throw lastError ?? new Error('OpenAI Responses API request failed');
}
