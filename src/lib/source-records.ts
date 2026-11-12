import type {SourceTagRelation} from './taxonomy';

export interface SourceRecord {
  id: string;
  title: string;
  original_title_ja?: string | null;
  translated_title_zh_tw?: string | null;
  release_date: string;
  actress: string[];
  studio?: string | null;
  series?: string | null;
  source_tags: string[];
  source_relations?: {tags?: SourceTagRelation[]};
  description?: string | null;
  cover_source_url?: string | null;
  source_url: string;
  source_site: 'cc18.tv';
  fetched_at: string;
}

const modules = import.meta.glob<{default: SourceRecord}>('/data/source-records/*.json', {eager: true});
const records = new Map(
  Object.values(modules).map(({default: record}) => [record.id, record]),
);

export const sourceRecordFor = (movieId: string) => records.get(movieId);
