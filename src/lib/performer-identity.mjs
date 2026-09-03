import {
  parsePerformerSourceId, parsePerformerSourceUrl, parsePerformerStableId,
  performerStableIdFromSourceId,
} from './performer-url.mjs';
import {resolvePerformerDisplayRecord} from './performer-localization-policy.mjs';

export const validatePerformerIdentity = ({catalogCode, registryNames, sourceNames, relations, localizations}) => {
  if (!Array.isArray(registryNames) || !Array.isArray(sourceNames) || !Array.isArray(relations)) {
    throw new Error(`${catalogCode}: performer identity inputs must be arrays`);
  }
  if (sourceNames.length !== relations.length) throw new Error(`${catalogCode}: source performer relation count mismatch`);
  if (registryNames.length !== sourceNames.length
    || registryNames.some((name, index) => name !== sourceNames[index])) {
    throw new Error(`${catalogCode}: Registry/source performer identity mismatch`);
  }
  const seen = new Set();
  for (const [index, relation] of relations.entries()) {
    const sourceName = sourceNames[index];
    if (relation.source_name !== sourceName) throw new Error(`${catalogCode}: performer source name/order mismatch at ${index}`);
    const sourceId = parsePerformerSourceId(relation.source_id);
    const stableId = relation.stable_source_id;
    parsePerformerStableId(stableId);
    if (seen.has(stableId)) throw new Error(`${catalogCode}: duplicate stable actor ID ${stableId}`);
    seen.add(stableId);
    const parsedUrl = parsePerformerSourceUrl(relation.source_url);
    if (relation.source_type !== 'actor' || stableId !== performerStableIdFromSourceId(sourceId)
      || parsedUrl.sourceId !== sourceId || parsedUrl.stableId !== stableId) {
      throw new Error(`${catalogCode}: performer relation identity mismatch for ${stableId}`);
    }
    try {
      resolvePerformerDisplayRecord({stablePerformerId: stableId, sourceName, localizations});
    } catch (error) {
      throw new Error(`${catalogCode}: invalid performer display source for ${stableId}: ${error.message}`);
    }
  }
  return true;
};
