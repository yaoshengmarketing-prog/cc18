export const normalizeSourceTagLabel = (value) => String(value ?? '').normalize('NFKC').trim();

const normalizeKey = (value) => normalizeSourceTagLabel(value).toLocaleLowerCase('zh-Hant');
const unique = (values) => [...new Set(values)];

export function createTaxonomyHelpers(taxonomy) {
  const tagsById = new Map(taxonomy.tags.map((tag) => [tag.id, tag]));
  const sourceMap = new Map(Object.entries(taxonomy.source_tag_map).map(([label, id]) => [normalizeKey(label), id]));

  const resolveSourceTags = (labels = []) => unique(labels.map(normalizeSourceTagLabel).filter(Boolean)).map((sourceLabel) => {
    const canonicalId = sourceMap.get(normalizeKey(sourceLabel));
    const tag = canonicalId ? tagsById.get(canonicalId) : null;
    return {sourceLabel, canonicalId: tag?.id ?? null, group: tag?.group ?? null, mapped: Boolean(tag)};
  });

  const buildTagChannels = ({sourceTags = [], canonicalTagIds = [], editorialTagIds = []}) => {
    const resolutions = resolveSourceTags(sourceTags);
    const explicit = unique([...canonicalTagIds, ...editorialTagIds]);
    const unknown = explicit.filter((id) => !tagsById.has(id));
    if (unknown.length) throw new Error(`Unknown taxonomy tag: ${unknown.join(', ')}`);
    return {
      sourceTags: resolutions.map(({sourceLabel}) => sourceLabel),
      canonicalTagIds: unique([
        ...resolutions.flatMap(({canonicalId, group}) => canonicalId && group !== 'editorial' ? [canonicalId] : []),
        ...canonicalTagIds.filter((id) => tagsById.get(id)?.group !== 'editorial'),
      ]),
      editorialTagIds: unique([
        ...canonicalTagIds.filter((id) => tagsById.get(id)?.group === 'editorial'),
        ...editorialTagIds.filter((id) => tagsById.get(id)?.group === 'editorial'),
      ]),
      unmappedSourceTags: resolutions.filter(({mapped}) => !mapped).map(({sourceLabel}) => sourceLabel),
    };
  };

  const buildTopicElements = (sourceTags = []) => {
    const grouped = Object.fromEntries(taxonomy.groups.filter(({origin}) => origin === 'source').map(({id}) => [id, []]));
    for (const {sourceLabel, group, mapped} of resolveSourceTags(sourceTags)) {
      if (mapped && group !== 'editorial' && grouped[group]) grouped[group].push(sourceLabel);
    }
    return Object.fromEntries(Object.entries(grouped).map(([group, labels]) => [group, unique(labels)]));
  };

  return {tagsById, resolveSourceTags, buildTagChannels, buildTopicElements};
}

export const candidateOccurrenceCount = (candidate) => unique((candidate.source_ids ?? []).map(String).map((id) => id.trim()).filter(Boolean)).length;
