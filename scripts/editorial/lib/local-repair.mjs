import {createHash} from 'node:crypto';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function splitReviewMarkdown(markdown) {
  const match = String(markdown).match(/^(---\r?\n[\s\S]*?\r?\n---)(\r?\n*)([\s\S]*)$/);
  if (!match) throw new Error('Review is missing YAML frontmatter');
  const segments = match[3].split(/(\r?\n\s*\r?\n)/);
  const paragraphs = [];
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 2) {
    if (!segments[segmentIndex].trim()) continue;
    paragraphs.push({
      paragraph: paragraphs.length + 1,
      segmentIndex,
      text: segments[segmentIndex].trim(),
    });
  }
  return {frontmatter: match[1], gap: match[2], segments, paragraphs};
}

export function buildLocalRepairRequest({movieId, markdown, report, preservedEntities = []}) {
  if (report?.id !== movieId || report?.status !== 'LOCAL_REPAIR') {
    throw new Error(`${movieId}: QA report is not eligible for local repair`);
  }
  if (report.review_sha256 !== sha256(markdown)) throw new Error(`${movieId}: local repair QA report is stale`);
  const parsed = splitReviewMarkdown(markdown);
  const targetNumbers = [...new Set((report.findings ?? [])
    .filter(({scope}) => scope === 'LOCAL_REPAIR')
    .flatMap(({locations}) => (locations ?? []).map(({paragraph}) => paragraph)))].sort((a, b) => a - b);
  if (!targetNumbers.length) throw new Error(`${movieId}: local repair report contains no target paragraphs`);
  const paragraphMap = new Map(parsed.paragraphs.map((item) => [item.paragraph, item]));
  const entities = [...new Set(preservedEntities.map((value) => String(value).trim()).filter(Boolean))];
  const targets = targetNumbers.map((paragraph) => {
    const item = paragraphMap.get(paragraph);
    if (!item) throw new Error(`${movieId}: target paragraph ${paragraph} does not exist`);
    return {
      paragraph,
      original_sha256: sha256(item.text),
      original: item.text,
      preserve: entities.filter((entity) => item.text.includes(entity)),
      reasons: (report.findings ?? [])
        .filter(({scope, locations}) => scope === 'LOCAL_REPAIR' && (locations ?? []).some((location) => location.paragraph === paragraph))
        .map(({code}) => code),
    };
  });
  const constraints = (report.findings ?? [])
    .filter(({scope}) => scope === 'LOCAL_REPAIR')
    .map(({code, matches, terms}) => ({code, matches: matches ?? null, terms: terms ?? []}));
  return {movie_id: movieId, constraints, targets};
}

export function applyLocalRepair({movieId, markdown, request, response, minimumParagraphRatio = 0.65, minimumArticleRatio = 0.9}) {
  if (request?.movie_id !== movieId) throw new Error(`${movieId}: local repair request identity mismatch`);
  const responseMovieId = String(response?.movie_id ?? '').trim().toUpperCase();
  if (responseMovieId && responseMovieId !== movieId) throw new Error(`${movieId}: local repair response identity mismatch`);
  const parsed = splitReviewMarkdown(markdown);
  const paragraphMap = new Map(parsed.paragraphs.map((item) => [item.paragraph, item]));
  const targets = new Map(request.targets.map((target) => [target.paragraph, target]));
  const patches = response.patches ?? [];
  if (patches.length !== targets.size || new Set(patches.map(({paragraph}) => paragraph)).size !== patches.length) {
    throw new Error(`${movieId}: local repair must return exactly one patch per target paragraph`);
  }
  const nextSegments = [...parsed.segments];
  for (const patch of patches) {
    const target = targets.get(patch.paragraph);
    const current = paragraphMap.get(patch.paragraph);
    if (!target || !current) throw new Error(`${movieId}: patch targets an unapproved paragraph ${patch.paragraph}`);
    if (patch.original_sha256 !== target.original_sha256 || sha256(current.text) !== target.original_sha256) {
      throw new Error(`${movieId}: paragraph ${patch.paragraph} changed after QA`);
    }
    const replacement = String(patch.replacement ?? '').trim();
    if (!replacement) throw new Error(`${movieId}: paragraph ${patch.paragraph} repair is empty`);
    if (replacement.length < current.text.length * minimumParagraphRatio) {
      throw new Error(`${movieId}: paragraph ${patch.paragraph} repair removed too much content`);
    }
    for (const entity of target.preserve ?? []) {
      if (!replacement.includes(entity)) throw new Error(`${movieId}: paragraph ${patch.paragraph} lost preserved entity ${entity}`);
    }
    nextSegments[current.segmentIndex] = replacement;
  }
  const repaired = `${parsed.frontmatter}${parsed.gap}${nextSegments.join('')}`;
  if (repaired.length < markdown.length * minimumArticleRatio) throw new Error(`${movieId}: local repair removed more than allowed article content`);
  return repaired;
}

export const localRepairSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['movie_id', 'patches'],
  properties: {
    movie_id: {type: 'string'},
    patches: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['paragraph', 'original_sha256', 'replacement', 'change_reason'],
        properties: {
          paragraph: {type: 'integer', minimum: 1},
          original_sha256: {type: 'string', pattern: '^[a-f0-9]{64}$'},
          replacement: {type: 'string', minLength: 1},
          change_reason: {type: 'string', minLength: 1},
        },
      },
    },
  },
};

export function localRepairSchemaFor(movieId) {
  return {
    ...localRepairSchema,
    properties: {
      ...localRepairSchema.properties,
      movie_id: {type: 'string', const: movieId},
    },
  };
}
