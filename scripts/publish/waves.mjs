export function planPublishWaves(items, {maxItemsPerWave = 50} = {}) {
  if (!Number.isInteger(maxItemsPerWave) || maxItemsPerWave < 1 || maxItemsPerWave > 50) {
    throw new Error('maxItemsPerWave must be an integer between 1 and 50');
  }
  if (!Array.isArray(items)) throw new Error('items must be an array');

  const normalized = items.map((item) => String(item).trim().toUpperCase());
  if (normalized.some((item) => !item)) throw new Error('publish wave items must not be empty');
  if (new Set(normalized).size !== normalized.length) throw new Error('publish wave items must be unique');

  const waves = [];
  for (let index = 0; index < normalized.length; index += maxItemsPerWave) {
    waves.push({
      wave: waves.length + 1,
      items: normalized.slice(index, index + maxItemsPerWave),
    });
  }
  return waves;
}
