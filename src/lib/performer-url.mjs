export const PERFORMER_STABLE_ID_PATTERN = /^cc18\.tv:actor:([1-9][0-9]*)$/u;
export const PERFORMER_ROUTE_SEGMENT_PATTERN = /^cc18-tv-actor-([1-9][0-9]*)$/u;
export const PERFORMER_SOURCE_ID_PATTERN = /^[1-9][0-9]*$/u;

const requireRawMatch = (value, pattern, label) => {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a raw string`);
  const match = value.match(pattern);
  if (!match) throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  return match;
};

export const parsePerformerSourceId = (value) => requireRawMatch(
  value,
  PERFORMER_SOURCE_ID_PATTERN,
  'performer source ID',
)[0];

export const performerStableIdFromSourceId = (sourceId) => (
  `cc18.tv:actor:${parsePerformerSourceId(sourceId)}`
);

export const performerRouteSegmentFromSourceId = (sourceId) => (
  `cc18-tv-actor-${parsePerformerSourceId(sourceId)}`
);

export const parsePerformerStableId = (value) => {
  const sourceId = requireRawMatch(value, PERFORMER_STABLE_ID_PATTERN, 'performer stable ID')[1];
  return {
    sourceId,
    stableId: value,
    routeSegment: performerRouteSegmentFromSourceId(sourceId),
    href: `/actresses/${performerRouteSegmentFromSourceId(sourceId)}/`,
  };
};

export const parsePerformerRouteSegment = (value) => {
  const sourceId = requireRawMatch(value, PERFORMER_ROUTE_SEGMENT_PATTERN, 'performer route segment')[1];
  const stableId = performerStableIdFromSourceId(sourceId);
  return {
    sourceId,
    stableId,
    routeSegment: value,
    href: `/actresses/${value}/`,
  };
};

export const performerRouteSegment = (stableId) => parsePerformerStableId(stableId).routeSegment;
export const performerHref = (stableId) => parsePerformerStableId(stableId).href;

const SOURCE_HOSTS = new Set(['cc18.tv', 'www.cc18.tv']);
const ASCII_CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;

export const parseCc18SourcePageUrl = (value) => {
  if (typeof value !== 'string') throw new TypeError('CC18 source page URL must be a raw string');
  if (value !== value.trim() || ASCII_CONTROL_PATTERN.test(value) || value.includes('\\') || value.includes('#')) {
    throw new Error(`Invalid raw CC18 source page URL: ${JSON.stringify(value)}`);
  }
  if (!/^https:\/\/(?:www\.)?cc18\.tv\//u.test(value)) {
    throw new Error(`Non-canonical raw CC18 source page URL: ${JSON.stringify(value)}`);
  }
  let url;
  try { url = new URL(value); } catch { throw new Error(`Invalid CC18 source page URL: ${JSON.stringify(value)}`); }
  if (url.protocol !== 'https:' || !SOURCE_HOSTS.has(url.hostname) || url.port !== ''
    || url.username !== '' || url.password !== '' || url.hash !== '' || url.href !== value) {
    throw new Error(`Non-canonical CC18 source page URL: ${JSON.stringify(value)}`);
  }
  return url;
};

const SOURCE_RELATION_TYPES = new Set(['actor', 'tag', 'fac', 'series']);

export const parseCc18SearchRelationUrl = (value, {baseUrl} = {}) => {
  if (typeof value !== 'string') throw new TypeError('CC18 search relation URL must be a raw string');
  if (value !== value.trim() || ASCII_CONTROL_PATTERN.test(value)) {
    throw new Error(`Invalid raw CC18 search relation URL: ${JSON.stringify(value)}`);
  }
  let canonicalInput;
  if (/^https:\/\/(?:www\.)?cc18\.tv\/search\.php\?/u.test(value)) canonicalInput = value;
  else if (baseUrl !== undefined && /^\/search\.php\?/u.test(value)) canonicalInput = value;
  else throw new Error(`Non-canonical raw CC18 search relation URL: ${JSON.stringify(value)}`);
  if (canonicalInput.includes('#') || canonicalInput.includes('\\')) {
    throw new Error(`Invalid raw CC18 search relation URL structure: ${JSON.stringify(value)}`);
  }
  const queryStart = canonicalInput.indexOf('?');
  const rawQuery = canonicalInput.slice(queryStart + 1);
  const entries = rawQuery.split('&').map((part) => {
    const separator = part.indexOf('=');
    if (separator < 1 || part.indexOf('=', separator + 1) >= 0) {
      throw new Error(`Invalid CC18 search relation URL query: ${JSON.stringify(value)}`);
    }
    const key = part.slice(0, separator);
    const rawValue = part.slice(separator + 1);
    if (/%/u.test(key) || /%/u.test(rawValue)) {
      throw new Error(`Encoded CC18 search relation identity is not allowed: ${JSON.stringify(value)}`);
    }
    return [key, rawValue];
  });
  if (entries.length !== 2 || entries.some(([key]) => !['s_type', 's_tid'].includes(key))) {
    throw new Error(`CC18 search relation URL only allows s_type and s_tid: ${JSON.stringify(value)}`);
  }
  const types = entries.filter(([key]) => key === 's_type').map(([, item]) => item);
  const ids = entries.filter(([key]) => key === 's_tid').map(([, item]) => item);
  if (types.length !== 1 || !SOURCE_RELATION_TYPES.has(types[0]) || ids.length !== 1) {
    throw new Error(`Invalid CC18 search relation URL identity query: ${JSON.stringify(value)}`);
  }
  const sourceId = parsePerformerSourceId(ids[0]);
  let url;
  try {
    const base = baseUrl === undefined ? undefined : parseCc18SourcePageUrl(baseUrl);
    url = base === undefined ? new URL(value) : new URL(value, base);
  } catch {
    throw new Error(`Invalid CC18 search relation URL: ${JSON.stringify(value)}`);
  }
  if (url.protocol !== 'https:' || !SOURCE_HOSTS.has(url.hostname) || url.port !== ''
    || url.username !== '' || url.password !== '' || url.pathname !== '/search.php' || url.hash !== '') {
    throw new Error(`Disallowed CC18 search relation URL: ${JSON.stringify(value)}`);
  }
  const decodedKeys = [...url.searchParams.keys()];
  if (decodedKeys.length !== 2 || decodedKeys.filter((key) => key === 's_type').length !== 1
    || decodedKeys.filter((key) => key === 's_tid').length !== 1) {
    throw new Error(`Duplicate or encoded CC18 search relation identity query: ${JSON.stringify(value)}`);
  }
  return {
    sourceType: types[0],
    sourceId,
    absoluteUrl: url.href,
  };
};

export const parsePerformerSourceUrl = (value, options = {}) => {
  const relation = parseCc18SearchRelationUrl(value, options);
  if (relation.sourceType !== 'actor') {
    throw new Error(`CC18 search relation is not an actor: ${JSON.stringify(value)}`);
  }
  return {
    sourceId: relation.sourceId,
    stableId: performerStableIdFromSourceId(relation.sourceId),
    absoluteUrl: relation.absoluteUrl,
  };
};

export const performerSourceIdFromUrl = (value) => parsePerformerSourceUrl(value).sourceId;
