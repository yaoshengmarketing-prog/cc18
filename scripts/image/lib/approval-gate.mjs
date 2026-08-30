import {createHash} from 'node:crypto';

const frontmatterValue = (markdown, key) => markdown.match(new RegExp(`^${key}:\\s*['\"]?([^'\"\\r\\n]+)['\"]?\\s*$`, 'm'))?.[1]?.trim() ?? '';

export function assertApprovedReviewForMedia({movieId, markdown, quality, registry}) {
  if (frontmatterValue(markdown, 'id') !== movieId || frontmatterValue(markdown, 'status') !== 'published') {
    throw new Error(`${movieId}: review is not approved for media generation`);
  }
  const record = registry.records?.find(({id}) => id === movieId);
  if (record?.review_status !== 'published') throw new Error(`${movieId}: Registry is not approved for media generation`);
  const reviewHash = createHash('sha256').update(markdown).digest('hex');
  if (quality?.id !== movieId || quality.approved_for_publish !== true || quality.review_sha256 !== reviewHash) {
    throw new Error(`${movieId}: quality approval or review hash is stale`);
  }
  return reviewHash;
}

export function refreshApprovedReviewHash({movieId, markdown, quality}) {
  if (quality?.id !== movieId || quality.approved_for_publish !== true) {
    throw new Error(`${movieId}: cannot refresh an unapproved review hash`);
  }
  quality.review_sha256 = createHash('sha256').update(markdown).digest('hex');
  return quality;
}
