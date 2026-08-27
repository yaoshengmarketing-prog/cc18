export interface ReviewQuality {
  id: string;
  review_sha256: string;
  approved_for_publish: boolean;
}

const modules = import.meta.glob<{default: ReviewQuality}>('/data/review-quality/*.json', {eager: true});
const records = new Map(
  Object.values(modules).map(({default: record}) => [record.id.toUpperCase(), record]),
);

export const reviewQualityFor = (id: string) => records.get(id.toUpperCase()) ?? null;
