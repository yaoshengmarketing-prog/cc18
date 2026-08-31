export const SERIES_SOURCE_ID_PATTERN = /^[1-9][0-9]*$/u;
export const SERIES_STABLE_ID_PATTERN = /^cc18\.tv:series:([1-9][0-9]*)$/u;

const requireRawMatch = (value, pattern, label) => {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a raw string`);
  const match = value.match(pattern);
  if (!match) throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  return match;
};

export const parseSeriesSourceId = (value) => requireRawMatch(
  value,
  SERIES_SOURCE_ID_PATTERN,
  'series source ID',
)[0];

export const seriesStableIdFromSourceId = (sourceId) => (
  `cc18.tv:series:${parseSeriesSourceId(sourceId)}`
);

export const parseSeriesStableId = (value) => {
  const sourceId = requireRawMatch(value, SERIES_STABLE_ID_PATTERN, 'series stable ID')[1];
  return {sourceId, stableId: value};
};
