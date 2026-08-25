function parseAttributes(value) {
  const result = {};
  for (const match of value.matchAll(/([A-Z0-9-]+)=((?:"[^"]*")|[^,]*)/gi)) {
    result[match[1].toUpperCase()] = match[2].replace(/^"|"$/g, '');
  }
  return result;
}

export function parseHlsManifest(text, baseUrl) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const variants = [];
  const segments = [];
  let pendingVariant = null;
  let pendingDuration = null;
  let cursor = 0;

  for (const line of lines) {
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      pendingVariant = parseAttributes(line.slice('#EXT-X-STREAM-INF:'.length));
      continue;
    }
    if (line.startsWith('#EXTINF:')) {
      pendingDuration = Number.parseFloat(line.slice('#EXTINF:'.length).split(',')[0]);
      continue;
    }
    if (line.startsWith('#')) continue;
    const resolved = new URL(line, baseUrl);
    if (pendingVariant) {
      const base = new URL(baseUrl);
      if (!resolved.search && base.search && !line.includes('?')) resolved.search = base.search;
      const [width, height] = String(pendingVariant.RESOLUTION ?? '').split('x').map(Number);
      variants.push({
        url: resolved.href,
        bandwidth: Number(pendingVariant.BANDWIDTH ?? 0),
        width: Number.isFinite(width) ? width : null,
        height: Number.isFinite(height) ? height : null,
      });
      pendingVariant = null;
    } else if (Number.isFinite(pendingDuration)) {
      segments.push({index: segments.length, url: resolved.href, start: cursor, duration: pendingDuration, end: cursor + pendingDuration});
      cursor += pendingDuration;
      pendingDuration = null;
    }
  }

  return {type: variants.length ? 'master' : 'media', variants, segments, duration: cursor};
}

export function chooseVariant(variants) {
  if (!variants.length) throw new Error('Master playlist has no variants');
  return [...variants].sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || b.bandwidth - a.bandwidth)[0];
}

export function planSampleWindows(segments, {sampleWindows = 24, segmentsPerWindow = 2} = {}) {
  if (!segments.length) throw new Error('Media playlist has no segments');
  const count = Math.min(sampleWindows, segments.length);
  const selected = [];
  const seen = new Set();
  for (let i = 0; i < count; i += 1) {
    const ratio = count === 1 ? 0.5 : i / (count - 1);
    const center = Math.min(segments.length - 1, Math.round(ratio * (segments.length - 1)));
    const start = Math.max(0, Math.min(segments.length - segmentsPerWindow, center - Math.floor(segmentsPerWindow / 2)));
    const items = segments.slice(start, start + segmentsPerWindow);
    const key = items.map((item) => item.index).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push({
      index: selected.length,
      start: items[0].start,
      end: items.at(-1).end,
      segment_indexes: items.map((item) => item.index),
      segments: items,
    });
  }
  return selected;
}
