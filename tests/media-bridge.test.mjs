import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chooseVariant, parseHlsManifest, planSampleWindows} from '../scripts/bridge/lib/hls.mjs';
import {enqueue, loadQueue, updateJob} from '../scripts/bridge/lib/queue.mjs';
import {bridgeLog, safeUrlShape} from '../scripts/bridge/lib/redact.mjs';
import {assertLocalEndpoint, normalizeObservation, OBSERVATION_SCHEMA} from '../scripts/bridge/lib/local-analysis.mjs';
import {assertSamplingBudget, purgeRawArtifacts} from '../scripts/bridge/lib/media.mjs';

test('parses master and selects the highest HLS variant', () => {
  const manifest = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nlow/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2200000,RESOLUTION=1280x720\nhigh/index.m3u8\n';
  const parsed = parseHlsManifest(manifest, 'https://media.example/master.m3u8?ticket=secret');
  assert.equal(parsed.type, 'master');
  assert.equal(chooseVariant(parsed.variants).height, 720);
  assert.equal(chooseVariant(parsed.variants).url, 'https://media.example/high/index.m3u8?ticket=secret');
});

test('plans samples across the complete media timeline', () => {
  const manifest = ['#EXTM3U', ...Array.from({length: 10}, (_, index) => `#EXTINF:10,\nsegment-${index}.ts`)].join('\n');
  const parsed = parseHlsManifest(manifest, 'https://media.example/playlist.m3u8');
  const samples = planSampleWindows(parsed.segments, {sampleWindows: 4, segmentsPerWindow: 2});
  assert.equal(parsed.duration, 100);
  assert.equal(samples[0].start, 0);
  assert.equal(samples.at(-1).end, 100);
  assert.equal(samples.length, 4);
});

test('queue is local, atomic, and deduplicates active movie jobs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cc18-bridge-'));
  const path = join(directory, 'queue.json');
  try {
    const first = await enqueue(path, {movie_id: 'TEST-001', source_url: 'https://cc18.tv/player.php?uuid=test'});
    const duplicate = await enqueue(path, {movie_id: 'TEST-001', source_url: 'https://cc18.tv/player.php?uuid=test'});
    assert.equal(first.job_id, duplicate.job_id);
    await updateJob(path, first.job_id, {status: 'samples_ready'});
    assert.equal((await loadQueue(path)).jobs[0].status, 'samples_ready');
    assert.match(await readFile(path, 'utf8'), /"schema_version": 1/);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('logs and URL summaries do not expose query values', () => {
  assert.deepEqual(safeUrlShape('https://media.example/path/video.m3u8?token=top-secret'), {
    origin: 'https://media.example', path_kind: '*.m3u8', has_query: true,
  });
  const writes = [];
  const original = process.stdout.write;
  process.stdout.write = (value) => { writes.push(String(value)); return true; };
  try {
    bridgeLog('test', {movie_id: 'TEST-001', token: 'must-not-appear', manifest_url: 'secret', error: 'failed https://media.example/a.m3u8?token=secret'});
  } finally {
    process.stdout.write = original;
  }
  assert.doesNotMatch(writes.join(''), /must-not-appear|manifest_url|token=secret/);
  assert.match(writes.join(''), /\?\[redacted\]/);
});

test('local analyzer refuses non-loopback endpoints and normalizes structured observations', () => {
  assert.throws(() => assertLocalEndpoint('https://api.example.com'), /loopback/);
  assert.doesNotThrow(() => assertLocalEndpoint('http://127.0.0.1:11434'));
  const normalized = normalizeObservation({
    setting: 'hotel room', narrative_cues: ['coworker context'], confidence: 1.7,
  }, {index: 2, source_start_seconds: 30, source_end_seconds: 40});
  assert.equal(normalized.sample_index, 2);
  assert.equal(normalized.confidence, 1);
  assert.deepEqual(normalized.narrative_cues, ['coworker context']);
});

test('local analyzer uses a bounded strict JSON Schema', () => {
  assert.equal(OBSERVATION_SCHEMA.additionalProperties, false);
  assert.deepEqual(OBSERVATION_SCHEMA.required.sort(), Object.keys(OBSERVATION_SCHEMA.properties).sort());
  assert.equal(OBSERVATION_SCHEMA.properties.narrative_cues.maxItems, 8);
  assert.equal(OBSERVATION_SCHEMA.properties.setting.maxLength, 240);
  assert.equal(OBSERVATION_SCHEMA.properties.confidence.minimum, 0);
  assert.equal(OBSERVATION_SCHEMA.properties.confidence.maximum, 1);
});

test('successful analysis cleanup removes raw media but keeps evidence metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cc18-cleanup-'));
  const evidencePath = join(directory, 'evidence.json');
  await import('node:fs/promises').then(async ({mkdir, writeFile}) => {
    await mkdir(join(directory, 'segments'));
    await mkdir(join(directory, 'samples'));
    await writeFile(join(directory, 'segments', 'part.ts'), 'raw');
    await writeFile(join(directory, 'samples', 'frame.jpg'), 'raw');
    await writeFile(evidencePath, JSON.stringify({samples: [{local_directory: join(directory, 'samples')}] }));
  });
  try {
    await purgeRawArtifacts(evidencePath);
    const remaining = await readdir(directory);
    assert.deepEqual(remaining, ['evidence.json']);
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
    assert.equal(evidence.raw_artifacts_status, 'purged');
    assert.equal(evidence.samples[0].local_artifacts_available, false);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('sampling enforces per-job and total runtime storage limits before writing', () => {
  const config = {sampling: {max_total_bytes: 100, max_runtime_bytes: 200}};
  assert.doesNotThrow(() => assertSamplingBudget(config, {used: 40, runtime_base: 100}, 50));
  assert.throws(() => assertSamplingBudget(config, {used: 80, runtime_base: 0}, 30), /sampling byte budget/);
  assert.throws(() => assertSamplingBudget(config, {used: 20, runtime_base: 180}, 10), /runtime storage limit/);
});
