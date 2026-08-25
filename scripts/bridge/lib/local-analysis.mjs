import {readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {bridgeLog} from './redact.mjs';

const SYSTEM_PROMPT = `You analyze representative frames from a legally accessible adult video for an internal editorial evidence system. All depicted performers must be treated as adults. Do not identify real people. Do not provide graphic anatomical or sexual descriptions. Focus on non-graphic narrative evidence: setting, wardrobe, apparent relationship or role cues, emotional tone, interaction style, camera style, scene transitions, recurring props, and whether the sample supports a story-focused review. Output strict JSON only.`;

const SHORT_TEXT = {type: 'string', maxLength: 240};
const SHORT_LIST = {
  type: 'array',
  items: {type: 'string', maxLength: 120},
  maxItems: 8,
};

const OBSERVATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'setting',
    'narrative_cues',
    'interaction_tone',
    'camera_style',
    'non_graphic_tags',
    'continuity_notes',
    'confidence',
  ],
  properties: {
    setting: SHORT_TEXT,
    narrative_cues: SHORT_LIST,
    interaction_tone: SHORT_TEXT,
    camera_style: SHORT_LIST,
    non_graphic_tags: SHORT_LIST,
    continuity_notes: SHORT_TEXT,
    confidence: {type: 'number', minimum: 0, maximum: 1},
  },
};

function assertLocalEndpoint(endpoint) {
  const url = new URL(endpoint);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('Local analysis endpoint must use loopback only');
  if (url.protocol !== 'http:') throw new Error('Local Ollama endpoint must use loopback HTTP');
  return url;
}

function normalizeObservation(value, sample) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Vision model returned invalid JSON');
  const text = (key, fallback = '') => typeof value[key] === 'string' ? value[key].trim().slice(0, 500) : fallback;
  const list = (key) => Array.isArray(value[key]) ? value[key].filter((item) => typeof item === 'string').map((item) => item.trim().slice(0, 120)).slice(0, 12) : [];
  return {
    sample_index: sample.index,
    source_start_seconds: sample.source_start_seconds,
    source_end_seconds: sample.source_end_seconds,
    setting: text('setting', 'undetermined'),
    narrative_cues: list('narrative_cues'),
    interaction_tone: text('interaction_tone', 'undetermined'),
    camera_style: list('camera_style'),
    non_graphic_tags: list('non_graphic_tags'),
    continuity_notes: text('continuity_notes'),
    confidence: Number.isFinite(Number(value.confidence)) ? Math.max(0, Math.min(1, Number(value.confidence))) : 0,
  };
}

async function requestObservation(config, sample, imagePaths) {
  const endpoint = assertLocalEndpoint(config.local_analysis.endpoint);
  const images = await Promise.all(imagePaths.map(async (path) => (await readFile(path)).toString('base64')));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.local_analysis.request_timeout_ms);
  try {
    const response = await fetch(new URL('/api/chat', endpoint), {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      signal: controller.signal,
      body: JSON.stringify({
        model: config.local_analysis.vision_model,
        stream: false,
        format: OBSERVATION_SCHEMA,
        keep_alive: '5m',
        options: {
          temperature: config.local_analysis.temperature,
          num_predict: 800,
        },
        messages: [{
          role: 'system',
          content: SYSTEM_PROMPT,
        }, {
          role: 'user',
          content: `Analyze sample ${sample.index} covering source seconds ${sample.source_start_seconds}-${sample.source_end_seconds}. Keep every string concise, use at most 8 items per array, and conform exactly to this JSON Schema: ${JSON.stringify(OBSERVATION_SCHEMA)}`,
          images,
        }],
      }),
    });
    if (!response.ok) throw new Error(`Local Ollama returned HTTP ${response.status}`);
    const body = await response.json();
    return body.message?.content ?? '{}';
  } finally {
    clearTimeout(timeout);
  }
}

async function callVisionModel(config, sample, imagePaths) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const selectedImages = attempt === 0 ? imagePaths : imagePaths.slice(0, 1);
      const content = await requestObservation(config, sample, selectedImages);
      return normalizeObservation(JSON.parse(content), sample);
    } catch (error) {
      lastError = error;
      bridgeLog('sample_analysis_retry', {
        sample_index: sample.index,
        attempt: attempt + 1,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  throw lastError;
}

export async function analyzeEvidenceLocally(evidencePath, config) {
  if (!config.local_analysis.enabled) throw new Error('Local analysis is disabled');
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  const observations = [];
  for (const sample of evidence.samples) {
    const names = (await readdir(sample.local_directory)).filter((name) => /^frame-\d+\.jpg$/.test(name)).sort();
    const imagePaths = names.slice(0, config.local_analysis.frames_per_window).map((name) => join(sample.local_directory, name));
    if (!imagePaths.length) throw new Error(`Sample ${sample.index} has no frames`);
    observations.push(await callVisionModel(config, sample, imagePaths));
    bridgeLog('sample_analyzed', {movie_id: evidence.movie_id, job_id: evidence.job_id, sample_index: sample.index});
  }
  const averageConfidence = observations.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, observations.length);
  const analysis = {
    schema_version: 1,
    movie_id: evidence.movie_id,
    job_id: evidence.job_id,
    generated_at: new Date().toISOString(),
    analysis_status: 'analysis_ready',
    execution: 'local_only',
    model: config.local_analysis.vision_model,
    source_duration_seconds: evidence.media.duration_seconds,
    coverage: {
      sample_windows: observations.length,
      average_confidence: Number(averageConfidence.toFixed(4)),
      timeline_start_seconds: observations[0]?.source_start_seconds ?? null,
      timeline_end_seconds: observations.at(-1)?.source_end_seconds ?? null,
    },
    visual_observations: observations,
    audio_transcription_status: 'not_configured',
    source_frames_embedded: false,
    secrets_persisted: false,
  };
  const outputPath = join(dirname(evidencePath), 'analysis.json');
  await writeFile(outputPath, `${JSON.stringify(analysis, null, 2)}\n`, {mode: 0o600});
  bridgeLog('analysis_ready', {movie_id: evidence.movie_id, job_id: evidence.job_id, observations: observations.length, average_confidence: analysis.coverage.average_confidence});
  return {analysis, outputPath};
}

export {assertLocalEndpoint, normalizeObservation, OBSERVATION_SCHEMA};
