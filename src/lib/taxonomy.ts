import taxonomy from '../../data/taxonomy.json';

export interface TagItem {
  id?: string;
  label: string;
  href?: string;
  kind?: 'canonical' | 'source' | 'freshness';
}

const tagsById = new Map(taxonomy.tags.map((tag) => [tag.id, tag]));
const sourceMap = taxonomy.source_tag_map as Record<string, string>;

export const allTaxonomyTags = taxonomy.tags;

export const tagItem = (id: string): TagItem => {
  const tag = tagsById.get(id);
  if (!tag) throw new Error(`Unknown taxonomy tag: ${id}`);
  return {id, label: tag.label, href: `/tags/${id}/`, kind: 'canonical'};
};

export const tagItems = (ids: string[]) => ids.map(tagItem);

export const sourceTagIds = (labels: string[]) => [...new Set(labels.map((label) => sourceMap[label]).filter(Boolean))];

export const sourceTagItems = (labels: string[]): TagItem[] => labels.map((label) => {
  const id = sourceMap[label];
  return id
    ? {id, label, href: `/tags/${id}/`, kind: 'source'}
    : {label, kind: 'source'};
});

export const taxonomyTag = (id: string) => tagsById.get(id);
