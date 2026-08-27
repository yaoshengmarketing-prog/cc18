import {createHash} from 'node:crypto';

export function approveAfterAutomatedQa({movieId, markdown, quality, registry, publishedAt}) {
  if (!quality || quality.id !== movieId) throw new Error(`${movieId}: quality record identity mismatch`);
  const record = registry.records?.find(({id}) => id === movieId);
  if (!record) throw new Error(`${movieId}: registry record not found`);
  let approvedMarkdown = markdown.replace(/^status:\s*draft\s*$/m, 'status: published');
  if (!/^status:\s*published\s*$/m.test(approvedMarkdown)) throw new Error(`${movieId}: review status is not approvable`);
  approvedMarkdown = /^publishedAt:/m.test(approvedMarkdown)
    ? approvedMarkdown.replace(/^publishedAt:.*$/m, `publishedAt: ${publishedAt}`)
    : approvedMarkdown.replace(/^(releaseDate:.*)$/m, `$1\npublishedAt: ${publishedAt}`);
  quality.approved_for_publish = true;
  quality.approved_at = new Date(`${publishedAt}T00:00:00+08:00`).toISOString();
  quality.review_sha256 = createHash('sha256').update(approvedMarkdown).digest('hex');
  record.review_status = 'published';
  record.published_at = publishedAt;
  registry.updated_at = new Date().toISOString();
  return {markdown: approvedMarkdown, quality, registry};
}
