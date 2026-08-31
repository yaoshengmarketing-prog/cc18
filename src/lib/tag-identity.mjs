export const TAG_SOURCE_ID_PATTERN = /^[1-9][0-9]*$/u;
export const TAG_STABLE_ID_PATTERN = /^cc18\.tv:tag:([1-9][0-9]*)$/u;

const requireRawMatch = (value, pattern, label) => {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a raw string`);
  const match = value.match(pattern);
  if (!match) throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  return match;
};

export const parseTagSourceId = (value) => requireRawMatch(
  value,
  TAG_SOURCE_ID_PATTERN,
  'tag source ID',
)[0];

export const tagStableIdFromSourceId = (sourceId) => (
  `cc18.tv:tag:${parseTagSourceId(sourceId)}`
);

export const parseTagStableId = (value) => {
  const sourceId = requireRawMatch(value, TAG_STABLE_ID_PATTERN, 'tag stable ID')[1];
  return {sourceId, stableId: value};
};
