const normalizePath = (value) => value.replaceAll('\\', '/');

export const allowedPublishPaths = (movieId) => {
  const id = movieId.toUpperCase();
  const slug = id.toLowerCase();
  return new Set([
    `content/reviews/${id}.md`,
    'data/movie-registry.json',
    `data/review-quality/${id}.json`,
    `data/review-quality/${id}-automated.json`,
    `data/media-manifests/${id}.json`,
    `data/search-content/${id}.json`,
    `data/source-records/${id}.json`,
    `data/image-briefs/${id}.json`,
    `data/editorial-briefs/${id}.json`,
    `data/editorial-usage/${id}.json`,
    `data/movie-master/${slug}.json`,
    'data/movie-master/index.json',
    'data/search-index-v1.json',
    'data/tag-candidates.json',
    `video/examples/${slug}.json`,
  ]);
};

export const unexpectedPublishPaths = (paths, movieId) => {
  const allowed = allowedPublishPaths(movieId);
  return [...new Set(paths.map(normalizePath))].filter((path) => !allowed.has(path)).sort();
};

export const selectPublishChanges = ({trackedPaths = [], untrackedPaths = [], movieId}) => {
  const allowed = allowedPublishPaths(movieId);
  const normalizedTracked = [...new Set(trackedPaths.map(normalizePath).filter(Boolean))];
  const unexpectedTracked = normalizedTracked.filter((path) => !allowed.has(path)).sort();
  if (unexpectedTracked.length) {
    throw new Error(`Publisher refuses unrelated tracked changes: ${unexpectedTracked.join(', ')}`);
  }
  const selected = [...new Set([
    ...normalizedTracked,
    ...untrackedPaths.map(normalizePath).filter((path) => allowed.has(path)),
  ])].sort();
  return {
    selected,
    ignoredUntracked: [...new Set(untrackedPaths.map(normalizePath).filter((path) => path && !allowed.has(path)))].sort(),
  };
};

export const frontmatterValue = (markdown, name) => {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  return frontmatter.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? null;
};

export const releaseIdFromHtml = (html) => html.match(/<meta\s+name=["']cc18-release-id["']\s+content=["']([a-f0-9]{64})["']\s*\/?\s*>/i)?.[1] ?? null;

export async function verifyLiveRelease({fetchImpl = fetch, pageUrl, releaseId, videoPath = null}) {
  const url = new URL(pageUrl);
  url.searchParams.set('release', releaseId.slice(0, 12));
  url.searchParams.set('checked_at', String(Date.now()));
  const response = await fetchImpl(url, {headers: {'cache-control': 'no-cache'}});
  if (!response.ok) return {ready: false, reason: `page_http_${response.status}`};
  const html = await response.text();
  if (releaseIdFromHtml(html) !== releaseId) return {ready: false, reason: 'release_id_mismatch'};
  if (videoPath && (!html.includes('<video') || !html.includes(videoPath))) return {ready: false, reason: 'video_missing'};
  return {ready: true, reason: null};
}

export async function verifyPublicMedia({fetchImpl = fetch, baseUrl, path, kind}) {
  if (!path) return;
  const response = await fetchImpl(new URL(path, baseUrl), {method: 'HEAD'});
  if (!response.ok) throw Object.assign(new Error(`${kind} media returned HTTP ${response.status}`), {code: 'PUBLISH_MEDIA_UNAVAILABLE'});
  const contentType = response.headers.get('content-type') ?? '';
  if (kind === 'video' && !contentType.startsWith('video/mp4')) throw Object.assign(new Error('Published video is not video/mp4'), {code: 'PUBLISH_MEDIA_INVALID'});
  if (kind === 'video' && response.headers.get('accept-ranges') !== 'bytes') throw Object.assign(new Error('Published video does not support byte ranges'), {code: 'PUBLISH_MEDIA_INVALID'});
  if (kind === 'image' && !contentType.startsWith('image/')) throw Object.assign(new Error('Published hero is not an image'), {code: 'PUBLISH_MEDIA_INVALID'});
}
