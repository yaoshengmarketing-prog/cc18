const RESPONSES_URL = 'https://api.openai.com/v1/responses';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function assertEditorialProviderReady(config, environment = process.env) {
  if (config.provider !== 'openai') return;
  if (!environment.OPENAI_API_KEY?.trim()) {
    throw Object.assign(
      new Error('OPENAI_API_KEY is not configured; editorial job was not claimed'),
      {code: 'EDITORIAL_PROVIDER_NOT_CONFIGURED'},
    );
  }
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
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const outputTokens = response.usage?.output_tokens ?? 0;
  const pricing = config.pricing;
  const estimatedUsd = pricing
    ? (uncachedInputTokens * pricing.input_per_million_tokens
      + cachedInputTokens * pricing.cached_input_per_million_tokens
      + outputTokens * pricing.output_per_million_tokens) / 1_000_000
    : null;
  return {
    provider: 'openai',
    model: response.model ?? config.model,
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    total_tokens: response.usage?.total_tokens ?? inputTokens + outputTokens,
    estimated_cost_usd: estimatedUsd === null ? null : Number(estimatedUsd.toFixed(6)),
    pricing_as_of: pricing?.as_of ?? null,
    store: false,
  };
}

export async function requestStructuredEditorial({
  apiKey,
  config,
  schema,
  instructions,
  input,
  fetchImplementation = fetch,
}) {
  const attempts = Math.max(1, Number(config.api_retry_count ?? 1));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(config.request_timeout_seconds ?? 300) * 1000);
    try {
      const response = await fetchImplementation(RESPONSES_URL, {
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
        return {text: extractResponseText(body), usage: usageReceipt(body, config)};
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
