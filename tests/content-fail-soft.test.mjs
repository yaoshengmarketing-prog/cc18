import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {decisionGuideViewModel} from '../src/lib/decision-guide.mjs';
import {renderEditorialMarkdownBody} from '../scripts/editorial/lib/markdown-headings.mjs';

test('local Codex titleVersion 2 makes the article title the first H2 and keeps sections at H3', () => {
  const sections = [
    {heading: '人物與場景', body: '第一段。'},
    {heading: '選片取捨', body: '第二段。'},
  ];
  const article = renderEditorialMarkdownBody({titleVersion: 2, title: '八蜜凛首次形象影片：從人物出發的靜岡旅館之旅', sections});
  assert.equal(article, '## 八蜜凛首次形象影片：從人物出發的靜岡旅館之旅\n\n### 人物與場景\n\n第一段。\n\n### 選片取捨\n\n第二段。');
  assert.deepEqual([...article.matchAll(/^#{1,3} (.+)$/gmu)].map((match) => match[0]), [
    '## 八蜜凛首次形象影片：從人物出發的靜岡旅館之旅', '### 人物與場景', '### 選片取捨',
  ]);
  assert.equal(renderEditorialMarkdownBody({titleVersion: 1, title: '舊文章題目', sections}),
    '## 人物與場景\n\n第一段。\n\n## 選片取捨\n\n第二段。');
});

const repositoryRoot = resolve(import.meta.dirname, '..');
const copyPath = async (root, path) => {
  const target = join(root, path);
  await mkdir(dirname(target), {recursive: true});
  await cp(join(repositoryRoot, path), target, {recursive: true});
};

const buildFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc18-content-fail-soft-'));
  for (const path of [
    'scripts/validate-content.mjs',
    'scripts/editorial/lib/safe-editorial-payload.mjs',
    'scripts/editorial/lib/source-context.mjs',
    'src/lib/performer-localization-policy.mjs',
    'src/lib/performer-identity.mjs',
    'src/lib/performer-url.mjs',
    'config/review-policy.json',
    'config/title-policy.json',
    'data/taxonomy.json',
    'data/tag-candidates.json',
    'data/movie-registry.json',
    'data/localization/performers-zh-tw.json',
    'data/source-records',
    'data/review-quality',
    'data/search-content',
    'content/reviews',
  ]) await copyPath(root, path);
  return root;
};

const runValidator = (root) => spawnSync(process.execPath, [join(root, 'scripts/validate-content.mjs')], {
  cwd: root,
  encoding: 'utf8',
});

test('automated draft QA publishes sparse prose with notes instead of requesting a rewrite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cc18-sparse-qa-'));
  const movieId = 'DSOD-006';
  try {
    const formal = await readFile(join(repositoryRoot, 'content/reviews', `${movieId}.md`), 'utf8');
    const markdown = formal
      .replace(/^title: .*$/mu, 'title: "自由格式標題"')
      .replace(/^titleVersion: .*$/mu, 'titleVersion: 1')
      .replace(/^seoTitle: .*$/mu, 'seoTitle: "自由格式SEO標題"')
      .replace(/^socialTitle: .*$/mu, 'socialTitle: "自由格式社群標題"')
      .replace(/^titleSignals:\r?\n(?:  - .*\r?\n)*/mu, 'titleSignals:\n  - "非來源逐字訊號"\n')
      .replace(/\r?\n---\r?\n[\s\S]*$/u, '\n---\n\n## 簡短資料\n\n只有一段。\n');
    const reviewPath = join(directory, 'review.md');
    const reportPath = join(directory, 'report.json');
    await writeFile(reviewPath, markdown, 'utf8');
    const result = spawnSync(process.execPath, [
      join(repositoryRoot, 'scripts/editorial/qa-draft.mjs'),
      movieId,
      `--review=${reviewPath}`,
      `--report=${reportPath}`,
    ], {cwd: repositoryRoot, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    assert.equal(report.status, 'PASS_WITH_NOTES');
    assert.equal(report.passed, true);
    assert.equal(report.publishable, true);
    assert.deepEqual(report.issues, []);
    assert.deepEqual(report.repair_issues, []);
    assert.ok(report.notes.includes('insufficient_sections'));
    assert.ok(report.notes.includes('missing_decision_value'));
    assert.ok(report.notes.includes('invalid_title_signal_count'));
    assert.ok(report.notes.includes('missing_movie_id_in_titles'));
    assert.ok(report.notes.includes('untraceable_title_signal'));
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('sparse content becomes warnings while identity mismatches still fail closed', async () => {
  const root = await buildFixture();
  const movieId = 'DSOD-006';
  try {
    const reviewPath = join(root, 'content/reviews', `${movieId}.md`);
    let markdown = await readFile(reviewPath, 'utf8');
    markdown = markdown
      .replace(/^title: .*$/mu, 'title: "自由格式標題"')
      .replace(/^seoTitle: .*$/mu, 'seoTitle: "自由格式SEO標題"')
      .replace(/^socialTitle: .*$/mu, 'socialTitle: "自由格式社群標題"')
      .replace(/^titleSignals:\r?\n(?:  - .*\r?\n)*/mu, 'titleSignals:\n  - "非來源逐字訊號"\n')
      .replace(/^canonicalTagIds:\r?\n(?:  - .*\r?\n)*/mu, 'canonicalTagIds:\n  []\n')
      .replace(/\r?\n---\r?\n[\s\S]*$/u, '\n---\n\n## 簡短資料\n\n只有一段。\n');
    await writeFile(reviewPath, markdown, 'utf8');

    const qualityPath = join(root, 'data/review-quality', `${movieId}.json`);
    const quality = JSON.parse(await readFile(qualityPath, 'utf8'));
    quality.review_sha256 = createHash('sha256').update(markdown).digest('hex');
    quality.evidence = [];
    quality.rewrite_attempts = 999;
    quality.approved_for_publish = true;
    quality.scores = {
      overall: 0, source_fidelity: 0, specificity: 0, originality: 0,
      search_value: 0, decision_value: 0, narrative_coherence: 0,
    };
    await writeFile(qualityPath, `${JSON.stringify(quality, null, 2)}\n`, 'utf8');

    const searchPath = join(root, 'data/search-content', `${movieId}.json`);
    const search = JSON.parse(await readFile(searchPath, 'utf8'));
    search.quick_decision = {thesis: '', story_density: 'unknown', pace: 'unknown', presentation: []};
    search.audience_fit = {for: [], not_for: []};
    search.questions_answered = [];
    search.recommendations = [];
    search.evidence_job_id = null;
    search.duration_seconds = null;
    search.sample_windows = 0;
    search.timeline_summary = [];
    await writeFile(searchPath, `${JSON.stringify(search, null, 2)}\n`, 'utf8');

    const registry = JSON.parse(await readFile(join(root, 'data/movie-registry.json'), 'utf8'));
    const publishedCount = registry.records.filter(({review_status: status}) => status === 'published').length;
    const accepted = runValidator(root);
    assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);
    assert.match(accepted.stdout, new RegExp(`Content valid: ${publishedCount} published review\\(s\\)`, 'u'));
    assert.match(accepted.stderr, /content_validation_warnings/u);
    for (const code of [
      'title_signal_count', 'missing_canonical_tags', 'insufficient_source_evidence',
      'rewrite_limit_observed', 'missing_quick_decision', 'insufficient_search_intents',
      'quality_score_below_target', 'display_title_missing_catalog_number',
      'seo_title_missing_catalog_number', 'social_title_missing_catalog_number',
      'untraceable_title_signal',
    ]) assert.match(accepted.stderr, new RegExp(code, 'u'));

    search.movie_id = 'OTHER-999';
    await writeFile(searchPath, `${JSON.stringify(search, null, 2)}\n`, 'utf8');
    const rejected = runValidator(root);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /DSOD-006: search-content identity mismatch/u);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('empty auxiliary content and canonical topics remain renderable without invented placeholders', async () => {
  const empty = decisionGuideViewModel({quick_decision: null, audience_fit: null, recommendations: null}, []);
  assert.equal(empty.hasContent, false);
  assert.deepEqual(empty.presentation, []);
  assert.deepEqual(empty.audienceFor, []);
  const partial = decisionGuideViewModel({
    quick_decision: {thesis: '只保留現有可用的選片說明。'},
    audience_fit: {for: [], not_for: []},
  }, []);
  assert.equal(partial.hasContent, true);
  assert.equal(partial.thesis, '只保留現有可用的選片說明。');

  const builder = await readFile(join(repositoryRoot, 'scripts/editorial/build-from-analysis.mjs'), 'utf8');
  const validator = await readFile(join(repositoryRoot, 'scripts/validate-content.mjs'), 'utf8');
  assert.match(builder, /source\.cover_source_url \?\? '\/images\/movie-cover-fallback\.svg'/u);
  assert.match(validator, /warn\(record\.id, 'missing_canonical_tags'\)/u);
  assert.doesNotMatch(validator, /throw new Error\(`\$\{record\.id\}: at least one canonical tag/u);
});

test('provider content-filter fallback continues with the complete public-metadata projection', async () => {
  const builder = await readFile(join(repositoryRoot, 'scripts/editorial/build-from-analysis.mjs'), 'utf8');
  const projectionAssignment = builder.indexOf('result = sanitizePublicEditorialResult(publicationProjection.result);');
  const emptyProjectionGuard = builder.indexOf('if (!result.sections.length)');
  const providerWarning = builder.indexOf("code: 'editorial_provider_content_filter'");
  assert.ok(projectionAssignment >= 0 && projectionAssignment < emptyProjectionGuard);
  assert.ok(emptyProjectionGuard < providerWarning);
  assert.doesNotMatch(builder, /publicationProjection\.downgraded \|\| providerContentFiltered/u);
  assert.doesNotMatch(builder, /reason: providerContentFiltered/u);
  assert.match(builder, /fallback: 'complete_public_metadata_projection'/u);
});
