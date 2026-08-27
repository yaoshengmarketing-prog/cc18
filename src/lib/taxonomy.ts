import taxonomy from '../../data/taxonomy.json';

export type TagGroup =
  | 'identity'
  | 'body'
  | 'clothing'
  | 'relationship'
  | 'setting'
  | 'action'
  | 'presentation'
  | 'editorial';

export interface TaxonomyTag {
  id: string;
  label: string;
  group: TagGroup;
  aliases: string[];
}

export interface TagItem {
  id?: string;
  label: string;
  href?: string;
  kind?: 'canonical' | 'source' | 'editorial' | 'freshness';
  group?: TagGroup;
}

export interface SourceTagResolution {
  sourceLabel: string;
  canonicalId?: string;
  group?: TagGroup;
  mapped: boolean;
}

export interface ReviewTagChannels {
  /** Original CC18 labels, normalized only for surrounding whitespace and duplicates. */
  sourceTags: string[];
  /** Stable taxonomy IDs derived from source evidence or explicit non-editorial IDs. */
  canonicalTagIds: string[];
  /** Interpretive labels selected by the editorial system. */
  editorialTagIds: string[];
  /** Source terms not yet covered by a stable taxonomy mapping. */
  unmappedSourceTags: string[];
}

export interface TagCandidateLike {
  occurrences?: number;
  source_ids?: string[];
}

export type TopicElements = Partial<Record<Exclude<TagGroup, 'editorial'>, string[]>>;

export const sourceTagGroupLabels = new Map(
  taxonomy.groups.filter(({origin}) => origin === 'source').map(({id, label}) => [id as Exclude<TagGroup, 'editorial'>, label]),
);

/** Preserve the displayed source spelling; only trim accidental surrounding space. */
export const normalizeSourceTagLabel = (label: string) => label.normalize('NFKC').trim();

const normalizeSourceTagKey = (label: string) => normalizeSourceTagLabel(label).toLocaleLowerCase('zh-Hant');

const unique = <T>(values: T[]) => [...new Set(values)];

const tags = taxonomy.tags as TaxonomyTag[];
const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
const sourceMap = taxonomy.source_tag_map as Record<string, string>;
const normalizedSourceMap = new Map(
  Object.entries(sourceMap).map(([label, id]) => [normalizeSourceTagKey(label), id]),
);

export const allTaxonomyTags = tags;

export const taxonomyTag = (id: string) => tagsById.get(id);

export const tagItem = (id: string): TagItem => {
  const tag = tagsById.get(id);
  if (!tag) throw new Error(`Unknown taxonomy tag: ${id}`);
  return {id, label: tag.label, href: `/tags/${id}/`, kind: 'canonical', group: tag.group};
};

/** Backwards-compatible rendering for existing canonicalTagIds. */
export const tagItems = (ids: string[]) => ids.map(tagItem);

export const resolveSourceTag = (label: string): SourceTagResolution => {
  const sourceLabel = normalizeSourceTagLabel(label);
  const canonicalId = sourceMap[sourceLabel] ?? normalizedSourceMap.get(normalizeSourceTagKey(sourceLabel));
  const tag = canonicalId ? tagsById.get(canonicalId) : undefined;
  return {
    sourceLabel,
    canonicalId,
    group: tag?.group,
    mapped: Boolean(tag),
  };
};

export const resolveSourceTags = (labels: string[]) => unique(labels.map(normalizeSourceTagLabel).filter(Boolean))
  .map(resolveSourceTag);

export const sourceTagIds = (labels: string[]) => unique(
  resolveSourceTags(labels).flatMap(({canonicalId}) => canonicalId ? [canonicalId] : []),
);

/** Source labels remain visible verbatim while mapped labels gain a stable local URL. */
export const sourceTagItems = (labels: string[]): TagItem[] => resolveSourceTags(labels).map(({sourceLabel, canonicalId, group}) => canonicalId
  ? {id: canonicalId, label: sourceLabel, href: `/tags/${canonicalId}/`, kind: 'source', group}
  : {label: sourceLabel, kind: 'source'});

export const editorialTagItems = (ids: string[]): TagItem[] => unique(ids).map((id) => {
  const tag = tagsById.get(id);
  if (!tag) throw new Error(`Unknown taxonomy tag: ${id}`);
  if (tag.group !== 'editorial') throw new Error(`Taxonomy tag is not editorial: ${id}`);
  return {id, label: tag.label, href: `/tags/${id}/`, kind: 'editorial', group: tag.group};
});

/**
 * Build distinct source/canonical/editorial channels. Existing callers may keep using
 * canonicalTagIds; any editorial IDs found there are moved into editorialTagIds.
 */
export const buildTagChannels = ({
  sourceTags,
  canonicalTagIds = [],
  editorialTagIds = [],
}: {
  sourceTags: string[];
  canonicalTagIds?: string[];
  editorialTagIds?: string[];
}): ReviewTagChannels => {
  const resolutions = resolveSourceTags(sourceTags);
  const explicitIds = unique([...canonicalTagIds, ...editorialTagIds]);
  const unknownIds = explicitIds.filter((id) => !tagsById.has(id));
  if (unknownIds.length) throw new Error(`Unknown taxonomy tag: ${unknownIds.join(', ')}`);

  return {
    sourceTags: resolutions.map(({sourceLabel}) => sourceLabel),
    canonicalTagIds: unique([
      ...resolutions.flatMap(({canonicalId, group}) => canonicalId && group !== 'editorial' ? [canonicalId] : []),
      ...canonicalTagIds.filter((id) => tagsById.get(id)?.group !== 'editorial'),
    ]),
    editorialTagIds: unique([
      ...canonicalTagIds.filter((id) => tagsById.get(id)?.group === 'editorial'),
      ...editorialTagIds,
    ]),
    unmappedSourceTags: resolutions.filter(({mapped}) => !mapped).map(({sourceLabel}) => sourceLabel),
  };
};

/**
 * Candidate frequency is evidence count, not a mutable counter. This tolerates old
 * files whose occurrences field was not updated when another source_id was appended.
 */
export const candidateOccurrenceCount = (candidate: TagCandidateLike): number => {
  const evidenceCount = unique((candidate.source_ids ?? []).map((id) => id.trim()).filter(Boolean)).length;
  return Math.max(candidate.occurrences ?? 0, evidenceCount);
};

/** Deterministic, source-only summary used by the article UI and search index. */
export const topicElementsFromSourceTags = (labels: string[]): TopicElements => {
  const grouped: TopicElements = {};
  for (const {sourceLabel, group, mapped} of resolveSourceTags(labels)) {
    if (!mapped || !group || group === 'editorial') continue;
    grouped[group] = unique([...(grouped[group] ?? []), sourceLabel]);
  }
  return grouped;
};
