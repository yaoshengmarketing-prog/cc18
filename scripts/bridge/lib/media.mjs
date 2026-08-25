import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {access, mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {promisify} from 'node:util';
import {assertAllowedUrl} from './config.mjs';
import {chooseVariant, parseHlsManifest, planSampleWindows} from './hls.mjs';
import {bridgeLog, safeUrlShape} from './redact.mjs';

const execFileAsync = promisify(execFile);

async function fetchText(url, sourceUrl, config) {
  assertAllowedUrl(url, config.security.allowed_media_hosts, {requireHttps: config.security.require_https});
  const response = await fetch(url, {headers: {origin: new URL(sourceUrl).origin, referer: sourceUrl}});
  if (!response.ok) throw new Error(`Media playlist returned HTTP ${response.status}`);
  return response.text();
}

export async function resolveMediaPlaylist(initialUrl, initialText, sourceUrl, config) {
  let url = initialUrl;
  let parsed = parseHlsManifest(initialText, initialUrl);
  if (parsed.type === 'master') {
    const variant = chooseVariant(parsed.variants);
    url = variant.url;
    parsed = parseHlsManifest(await fetchText(url, sourceUrl, config), url);
  }
  if (parsed.type !== 'media') throw new Error('Expected an HLS media playlist');
  for (const segment of parsed.segments) {
    assertAllowedUrl(segment.url, config.security.allowed_media_hosts, {requireHttps: config.security.require_https});
  }
  return {playlistUrl: url, ...parsed};
}

async function downloadSegment(segment, outputPath, sourceUrl, config, budget) {
  const response = await fetch(segment.url, {headers: {origin: new URL(sourceUrl).origin, referer: sourceUrl}});
  if (!response.ok) throw new Error(`Media segment returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assertSamplingBudget(config, budget, bytes.length);
  budget.used += bytes.length;
  await writeFile(outputPath, bytes, {mode: 0o600});
  return {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
}

async function extractArtifacts(segmentPaths, outputDirectory) {
  const [{default: ffmpegPath}] = await Promise.all([import('ffmpeg-static')]);
  if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary path');
  const concatPath = join(outputDirectory, 'segments.txt');
  const concatText = segmentPaths.map((path) => `file '${resolve(path).replaceAll("'", "'\\''")}'`).join('\n');
  await writeFile(concatPath, `${concatText}\n`, {mode: 0o600});
  const framePattern = join(outputDirectory, 'frame-%02d.jpg');
  const audioPath = join(outputDirectory, 'audio.wav');
  await execFileAsync(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', concatPath,
    '-vf', 'fps=1/5', '-frames:v', '4', framePattern,
    '-vn', '-ac', '1', '-ar', '16000', audioPath,
  ], {windowsHide: true, maxBuffer: 1024 * 1024});
  const files = await readdir(outputDirectory);
  return {
    frames: files.filter((name) => /^frame-\d+\.jpg$/.test(name)).sort().map((name) => join(outputDirectory, name)),
    audio: audioPath,
  };
}

export async function createLocalEvidence({movieId, jobId, sourceUrl, playlist, player, config}) {
  const jobDirectory = join(config.runtime_dir, 'jobs', jobId);
  const segmentDirectory = join(jobDirectory, 'segments');
  const sampleDirectory = join(jobDirectory, 'samples');
  await mkdir(segmentDirectory, {recursive: true});
  await mkdir(sampleDirectory, {recursive: true});
  const windows = planSampleWindows(playlist.segments, {
    sampleWindows: config.sampling.sample_windows,
    segmentsPerWindow: config.sampling.segments_per_window,
  });
  const uniqueSegments = [...new Map(windows.flatMap((window) => window.segments).map((segment) => [segment.index, segment])).values()];
  const budget = {used: 0, runtime_base: await directoryBytes(config.runtime_dir)};
  const downloaded = new Map();

  for (const segment of uniqueSegments) {
    const output = join(segmentDirectory, `${String(segment.index).padStart(6, '0')}.ts`);
    const metadata = await downloadSegment(segment, output, sourceUrl, config, budget);
    downloaded.set(segment.index, {path: output, ...metadata});
  }

  const samples = [];
  for (const window of windows) {
    const output = join(sampleDirectory, String(window.index).padStart(3, '0'));
    await mkdir(output, {recursive: true});
    const segmentPaths = window.segment_indexes.map((index) => downloaded.get(index).path);
    const artifacts = await extractArtifacts(segmentPaths, output);
    samples.push({
      index: window.index,
      source_start_seconds: window.start,
      source_end_seconds: window.end,
      segment_indexes: window.segment_indexes,
      frame_count: artifacts.frames.length,
      audio_available: Boolean(artifacts.audio),
      local_directory: output,
    });
  }

  const evidence = {
    schema_version: 1,
    movie_id: movieId,
    job_id: jobId,
    source_url: sourceUrl,
    generated_at: new Date().toISOString(),
    analysis_status: 'samples_ready',
    source_access_mode: 'local_browser_bridge',
    media: {
      duration_seconds: player?.duration_seconds ?? playlist.duration,
      width: player?.width ?? null,
      height: player?.height ?? null,
      playlist: safeUrlShape(playlist.playlistUrl),
      sampled_bytes: budget.used,
    },
    coverage: {
      requested_windows: config.sampling.sample_windows,
      completed_windows: samples.length,
      timeline_start_seconds: samples[0]?.source_start_seconds ?? null,
      timeline_end_seconds: samples.at(-1)?.source_end_seconds ?? null,
    },
    samples,
    secrets_persisted: false,
  };
  const evidencePath = join(jobDirectory, 'evidence.json');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {mode: 0o600});
  bridgeLog('samples_ready', {movie_id: movieId, job_id: jobId, windows: samples.length, sampled_bytes: budget.used});
  return {evidence, evidencePath};
}

export async function cleanupExpiredRuntime(config, now = Date.now()) {
  const jobsDirectory = join(config.runtime_dir, 'jobs');
  const retentionMs = config.sampling.failed_retention_hours * 60 * 60 * 1000;
  let removed = 0;
  for (const name of await readdir(jobsDirectory).catch(() => [])) {
    const path = join(jobsDirectory, name);
    const details = await stat(path);
    const analysisPath = join(path, 'analysis.json');
    const hasAnalysis = await access(analysisPath).then(() => true).catch(() => false);
    if (hasAnalysis) {
      await purgeRawArtifacts(join(path, 'evidence.json'));
    } else if (now - details.mtimeMs > retentionMs) {
      await rm(path, {recursive: true, force: true});
      removed += 1;
    }
  }
  return removed;
}

export async function purgeRawArtifacts(evidencePath) {
  const jobDirectory = dirname(evidencePath);
  await Promise.all([
    rm(join(jobDirectory, 'segments'), {recursive: true, force: true}),
    rm(join(jobDirectory, 'samples'), {recursive: true, force: true}),
  ]);
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  evidence.raw_artifacts_status = 'purged';
  evidence.raw_artifacts_purged_at = new Date().toISOString();
  for (const sample of evidence.samples ?? []) sample.local_artifacts_available = false;
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {mode: 0o600});
  return jobDirectory;
}

async function directoryBytes(path) {
  let total = 0;
  for (const entry of await readdir(path, {withFileTypes: true}).catch(() => [])) {
    const child = join(path, entry.name);
    total += entry.isDirectory() ? await directoryBytes(child) : (await stat(child)).size;
  }
  return total;
}

export function assertSamplingBudget(config, budget, additionalBytes) {
  if (budget.used + additionalBytes > config.sampling.max_total_bytes) {
    throw new Error('Media sampling byte budget exceeded');
  }
  if ((budget.runtime_base ?? 0) + budget.used + additionalBytes > config.sampling.max_runtime_bytes) {
    throw new Error('Media Bridge runtime storage limit would be exceeded');
  }
}

export async function assertRuntimeBudget(config) {
  const used = await directoryBytes(config.runtime_dir);
  if (used > config.sampling.max_runtime_bytes) {
    throw new Error(`Media Bridge runtime storage limit exceeded: ${used} bytes`);
  }
  return used;
}
