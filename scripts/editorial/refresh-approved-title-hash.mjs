import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const root = new URL('../../', import.meta.url);
const allowedScalarFields = new Set([
  'title', 'displayShortTitle', 'seoTitle', 'socialTitle', 'titleVersion',
]);

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export const stripApprovedTitleFields = (markdown) => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const output = [];
  let inFrontmatter = false;
  let skippingList = false;

  for (const line of lines) {
    if (line === '---') {
      inFrontmatter = !inFrontmatter;
      skippingList = false;
      output.push(line);
      continue;
    }
    if (!inFrontmatter) {
      output.push(line);
      continue;
    }
    if (skippingList && /^\s+-\s/.test(line)) continue;
    skippingList = false;
    if (/^titleSignals:\s*$/.test(line)) {
      skippingList = true;
      continue;
    }
    const key = line.match(/^([A-Za-z][A-Za-z0-9]*):/)?.[1];
    if (key && allowedScalarFields.has(key)) continue;
    output.push(line);
  }
  return output.join('\n');
};

export const assertTitleOnlyChange = ({movieId, previousMarkdown, nextMarkdown}) => {
  if (stripApprovedTitleFields(previousMarkdown) !== stripApprovedTitleFields(nextMarkdown)) {
    throw new Error(`${movieId}: changes outside approved title frontmatter fields detected`);
  }
};

const main = async () => {
  const movieIndex = process.argv.indexOf('--movie');
  const movieId = movieIndex >= 0 ? process.argv[movieIndex + 1] : null;
  if (!movieId || !/^[A-Z0-9-]+$/.test(movieId)) {
    throw new Error('Usage: node scripts/editorial/refresh-approved-title-hash.mjs --movie MOVIE-ID');
  }

  const reviewPath = `content/reviews/${movieId}.md`;
  const qualityPath = `data/review-quality/${movieId}.json`;
  const previous = spawnSync('git', ['show', `HEAD:${reviewPath}`], {cwd: root, encoding: 'utf8'});
  if (previous.status !== 0) throw new Error(`${movieId}: cannot read approved review from HEAD`);

  const markdown = await readFile(new URL(reviewPath, root), 'utf8');
  const qualityUrl = new URL(qualityPath, root);
  const quality = JSON.parse(await readFile(qualityUrl, 'utf8'));
  if (quality.id !== movieId || quality.approved_for_publish !== true) {
    throw new Error(`${movieId}: current main quality record is not approved`);
  }
  if (quality.review_sha256 !== sha256(previous.stdout)) {
    throw new Error(`${movieId}: HEAD quality approval is already stale`);
  }
  assertTitleOnlyChange({movieId, previousMarkdown: previous.stdout, nextMarkdown: markdown});

  const previousHash = quality.review_sha256;
  quality.review_sha256 = sha256(markdown);
  await writeFile(qualityUrl, `${JSON.stringify(quality, null, 2)}\n`);
  console.log(JSON.stringify({movie_id: movieId, previous_hash: previousHash, review_sha256: quality.review_sha256}, null, 2));
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
