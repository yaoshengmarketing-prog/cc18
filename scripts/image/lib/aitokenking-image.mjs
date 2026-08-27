const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
  if (!response.ok || (payload.code && payload.code !== 200)) {
    throw Object.assign(new Error(`Image provider returned HTTP ${response.status}: ${payload.message ?? 'unknown error'}`), {status: response.status});
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
  if (!/^img_[A-Za-z0-9_-]+$/.test(taskId ?? '')) throw new Error('Image provider response contained no valid taskId');
  return taskId;
}

export async function awaitImageTask({config, apiKey, taskId, fetchImplementation = fetch, waitImplementation = wait}) {
  const deadline = Date.now() + Number(config.poll_timeout_seconds ?? 600) * 1000;
  while (Date.now() < deadline) {
    await waitImplementation(Number(config.poll_interval_seconds ?? 15) * 1000);
    const payload = await authorizedJson({config, apiKey, path: `image-generations/${taskId}`, fetchImplementation});
    const data = payload.data ?? {};
    if (data.status === 'failed') throw Object.assign(new Error(`Image generation failed: ${data.errorMessage ?? data.message ?? 'unknown error'}`), {code: 'IMAGE_GENERATION_FAILED'});
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
