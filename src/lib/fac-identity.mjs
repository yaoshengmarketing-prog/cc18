export const FAC_SOURCE_ID_PATTERN = /^[1-9][0-9]*$/u;
export const FAC_STABLE_ID_PATTERN = /^cc18\.tv:fac:([1-9][0-9]*)$/u;

const requireRawMatch = (value, pattern, label) => {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a raw string`);
  const match = value.match(pattern);
  if (!match) throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  return match;
};

export const parseFacSourceId = (value) => requireRawMatch(
  value,
  FAC_SOURCE_ID_PATTERN,
  'fac source ID',
)[0];

export const facStableIdFromSourceId = (sourceId) => (
  `cc18.tv:fac:${parseFacSourceId(sourceId)}`
);

export const parseFacStableId = (value) => {
  const sourceId = requireRawMatch(value, FAC_STABLE_ID_PATTERN, 'fac stable ID')[1];
  return {sourceId, stableId: value};
};
