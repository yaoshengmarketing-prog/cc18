import {createHash} from 'node:crypto';

const isValidPublishedAt = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const approvalFrontmatter = (markdown, movieId) => {
  const match = markdown.match(/^---(\r?\n)([\s\S]*?)(\r?\n)---(?=\r?\n|$)/u);
  if (!match) throw new Error(`${movieId}: review is missing bounded YAML frontmatter`);
  const newline = match[1];
  const lines = match[2].split(/\r?\n/u);
  const keyIndexes = (key) => lines
    .map((line, index) => (line.match(/^([A-Za-z][A-Za-z0-9_]*):(?:\s*(.*))?$/u)?.[1] === key ? index : -1))
    .filter((index) => index !== -1);
  const scalar = (index) => (lines[index].match(/^[A-Za-z][A-Za-z0-9_]*:(?:\s*(.*))?$/u)?.[1]?.trim() ?? '')
    .replace(/^['"]|['"]$/gu, '');
  return {match, newline, lines, keyIndexes, scalar};
};

const buildApprovedMarkdown = ({movieId, markdown, firstPublishedAt}) => {
  const parsed = approvalFrontmatter(markdown, movieId);
  const statusIndexes = parsed.keyIndexes('status');
  if (statusIndexes.length !== 1 || !['draft', 'published'].includes(parsed.scalar(statusIndexes[0]))) {
    throw new Error(`${movieId}: review status frontmatter is not safely approvable`);
  }
  parsed.lines[statusIndexes[0]] = 'status: published';

  const publishedAtIndexes = parsed.keyIndexes('publishedAt');
  if (publishedAtIndexes.length > 1) {
    throw new Error(`${movieId}: review frontmatter contains duplicate publishedAt fields`);
  }
  if (publishedAtIndexes.length === 1) {
    parsed.lines[publishedAtIndexes[0]] = `publishedAt: ${firstPublishedAt}`;
  } else {
    const releaseDateIndexes = parsed.keyIndexes('releaseDate');
    if (releaseDateIndexes.length !== 1 || !isValidPublishedAt(parsed.scalar(releaseDateIndexes[0]))) {
      throw new Error(`${movieId}: review cannot safely add publishedAt without one valid releaseDate`);
    }
    parsed.lines.splice(releaseDateIndexes[0] + 1, 0, `publishedAt: ${firstPublishedAt}`);
  }

  const nextFrontmatter = parsed.lines.join(parsed.newline);
  const approvedMarkdown = `${markdown.slice(0, parsed.match.index)}---${parsed.newline}${nextFrontmatter}${parsed.match[3]}---${markdown.slice(parsed.match[0].length)}`;
  const verified = approvalFrontmatter(approvedMarkdown, movieId);
  const verifiedStatuses = verified.keyIndexes('status');
  const verifiedPublishedAt = verified.keyIndexes('publishedAt');
  if (verifiedStatuses.length !== 1 || verified.scalar(verifiedStatuses[0]) !== 'published'
    || verifiedPublishedAt.length !== 1 || verified.scalar(verifiedPublishedAt[0]) !== firstPublishedAt) {
    throw new Error(`${movieId}: approved review frontmatter failed publication date validation`);
  }
  return approvedMarkdown;
};

export function assertFreshAutomatedQa({movieId, markdown, report}) {
  if (report?.id !== movieId || report.passed !== true || report.issues?.length) {
    throw new Error(`${movieId}: automated QA report is not approved`);
  }
  const currentHash = createHash('sha256').update(markdown).digest('hex');
  if (report.review_sha256 !== currentHash) throw new Error(`${movieId}: automated QA report is stale`);
  return currentHash;
}

export function approveAfterAutomatedQa({movieId, markdown, quality, registry, publishedAt}) {
  if (!quality || quality.id !== movieId) throw new Error(`${movieId}: quality record identity mismatch`);
  const record = registry.records?.find(({id}) => id === movieId);
  if (!record) throw new Error(`${movieId}: registry record not found`);
  if (!['draft', 'published'].includes(record.review_status)) {
    throw new Error(`${movieId}: registry review_status is not approvable`);
  }

  const wasPublished = record.review_status === 'published';
  if (wasPublished && !isValidPublishedAt(record.published_at)) {
    throw new Error(`${movieId}: published Registry record is missing a valid first published_at; human confirmation is required`);
  }
  if (!wasPublished && !isValidPublishedAt(publishedAt)) {
    throw new Error(`${movieId}: first published_at must be a valid YYYY-MM-DD approval date`);
  }
  const firstPublishedAt = wasPublished ? record.published_at : publishedAt;

  const approvedMarkdown = buildApprovedMarkdown({movieId, markdown, firstPublishedAt});
  quality.approved_for_publish = true;
  if (!wasPublished || !quality.approved_at) {
    quality.approved_at = new Date(`${firstPublishedAt}T00:00:00+08:00`).toISOString();
  }
  quality.review_sha256 = createHash('sha256').update(approvedMarkdown).digest('hex');
  record.review_status = 'published';
  record.published_at = firstPublishedAt;
  if (!wasPublished) registry.updated_at = new Date().toISOString();
  return {markdown: approvedMarkdown, quality, registry};
}
