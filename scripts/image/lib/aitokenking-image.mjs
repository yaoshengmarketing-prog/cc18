const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const safeTaskId = (value) => /^[A-Za-z0-9][A-Za-z0-9_-]{5,199}$/.test(value ?? '') ? value : null;
const safeErrorCode = (value) => /^[A-Za-z0-9_-]{1,80}$/.test(String(value ?? '')) ? String(value) : null;
export const safeProviderSummary = (value) => String(value ?? 'unknown error')
  .replace(/https?:\/\/[^\s"']+/gi, '[url]')
  .replace(/\b(?:Bearer\s+)?(?:sk[-_]|eyJ)[A-Za-z0-9._-]{12,}\b/gi, '[redacted]')
  .replace(/["']?(?:api[_-]?key|token|authorization|secret|cookie|session)["']?\s*[:=]\s*["']?[^\s,;"'}]+["']?/gi, '[redacted]')
  .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[redacted]')
  .replace(/\s+/g, ' ')
  .slice(0, 220);

export function imageFailureDiagnostic(error, {taskId = null, role = null} = {}) {
  return {
    provider_http_status: Number.isInteger(error?.status) ? error.status : null,
    provider_task_id: safeTaskId(error?.taskId) ?? safeTaskId(taskId),
    provider_error_code: safeErrorCode(error?.providerCode),
    provider_response_summary: safeProviderSummary(error?.providerSummary ?? error?.message),
    image_role: role,
  };
}

export function imageApiKey(config, environment = process.env) {
  return environment[config.api_key_env ?? 'AITOKENKING_API_KEY']?.trim();
}

export function imageEndpoint(config, path) {
  const base = new URL(config.base_url);
  if (base.protocol !== 'https:' || !(config.allowed_hosts ?? []).includes(base.hostname)) {
    throw new Error(`Image provider host is not allowlisted: ${base.hostname}`);
  }
  return new URL(`${base.pathname.replace(/\/$/, '')}/${path.replace(/^\//, '')}`, base.origin).toString();
}

const authorizedJson = async ({config, apiKey, path, method = 'GET', body, fetchImplementation = fetch}) => {
  const response = await fetchImplementation(imageEndpoint(config, path), {
    method,
    headers: {authorization: `Bearer ${apiKey}`, ...(body ? {'content-type': 'application/json'} : {})},
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (payload.code != null && Number(payload.code) !== 200)) {
    const summary = safeProviderSummary(payload.message ?? payload.data?.errorMessage);
    throw Object.assign(new Error(`Image provider returned HTTP ${response.status}: ${summary}`), {
      status: response.status,
      providerCode: safeErrorCode(payload.data?.errorCode ?? payload.data?.error_code ?? payload.code),
      taskId: safeTaskId(payload.data?.taskId),
      providerSummary: summary,
    });
  }
  return payload;
};

export async function listImageModels(options) {
  const payload = await authorizedJson({...options, path: 'image-models'});
  return payload.data ?? [];
}

export function selectImageSpec(config, models, role) {
  const model = models.find(({id}) => id === config.model);
  if (!model) throw Object.assign(new Error(`Configured image model is unavailable: ${config.model}`), {code: 'IMAGE_MODEL_UNAVAILABLE'});
  const ratio = config.roles?.[role]?.ratio;
  if (!model.ratios?.includes(ratio)) throw Object.assign(new Error(`${config.model} does not support ${ratio} for ${role}`), {code: 'IMAGE_RATIO_UNAVAILABLE'});
  const resolution = (config.preferred_resolutions ?? []).find((value) => model.resolutions?.includes(value));
  if (!resolution) throw Object.assign(new Error(`${config.model} has no configured supported resolution`), {code: 'IMAGE_RESOLUTION_UNAVAILABLE'});
  return {model: model.id, ratio, resolution, count: 1};
}

export async function createImageTask({config, apiKey, prompt, spec, fetchImplementation = fetch}) {
  const payload = await authorizedJson({
    config, apiKey, path: 'image-generations', method: 'POST', fetchImplementation,
    body: {model: spec.model, text: prompt, count: spec.count, resolution: spec.resolution, ratio: spec.ratio, imageUrls: []},
  });
  const taskId = payload.data?.taskId;
  if (!safeTaskId(taskId)) {
    const keys = payload.data && typeof payload.data === 'object' ? Object.keys(payload.data).sort().join(',') : 'none';
    throw new Error(`Image provider response contained no valid taskId (message=${safeProviderSummary(payload.message ?? 'none')}, data_keys=${keys})`);
  }
  return taskId;
}

export async function awaitImageTask({config, apiKey, taskId, fetchImplementation = fetch, waitImplementation = wait}) {
  const deadline = Date.now() + Number(config.poll_timeout_seconds ?? 600) * 1000;
  while (Date.now() < deadline) {
    await waitImplementation(Number(config.poll_interval_seconds ?? 15) * 1000);
    const payload = await authorizedJson({config, apiKey, path: `image-generations/${encodeURIComponent(taskId)}`, fetchImplementation});
    const data = payload.data ?? {};
    if (data.status === 'failed') {
      const summary = safeProviderSummary(data.errorMessage ?? data.message);
      throw Object.assign(new Error(`Image generation failed: ${summary}`), {
        code: 'IMAGE_GENERATION_FAILED', status: 200, taskId,
        providerCode: safeErrorCode(data.errorCode ?? data.error_code),
        providerSummary: summary,
      });
    }
    if (data.status !== 'success') continue;
    const images = Array.isArray(data.images) ? data.images : JSON.parse(data.images ?? '[]');
    const url = images[0];
    if (!url || new URL(url).protocol !== 'https:') throw new Error('Image task returned no HTTPS image URL');
    return {taskId, url};
  }
  throw Object.assign(new Error(`Image generation timed out: ${taskId}`), {code: 'IMAGE_GENERATION_TIMEOUT'});
}

export async function downloadGeneratedImage({url, maximumBytes, fetchImplementation = fetch}) {
  const response = await fetchImplementation(url);
  if (!response.ok) throw new Error(`Generated image download returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type')?.split(';')[0]?.toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) throw new Error(`Unexpected generated image content type: ${contentType}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maximumBytes) throw new Error(`Generated image size is invalid: ${bytes.length}`);
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  return {bytes, contentType, extension};
}
