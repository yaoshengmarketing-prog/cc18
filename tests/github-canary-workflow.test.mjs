import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/pipeline.yml', import.meta.url), 'utf8');
const draftWorkflow = await readFile(new URL('../.github/workflows/draft-canary.yml', import.meta.url), 'utf8');

test('editorial provider smoke is manual, isolated and uses the GitHub secret', () => {
  assert.match(workflow, /options: \[plan, editorial-smoke,/);
  assert.match(workflow, /if: inputs\.stage == 'editorial-smoke'[\s\S]*AITOKENKING_API_KEY: \$\{\{ secrets\.AITOKENKING_API_KEY \}\}[\s\S]*npm run editorial:provider:smoke/);
  assert.match(workflow, /inputs\.stage != 'editorial-smoke'/);
  assert.doesNotMatch(workflow, /schedule:/);
});

test('publish remains a distinct exact-ID stage', () => {
  assert.match(workflow, /inputs\.stage == 'publish' \|\| inputs\.stage == 'end-to-end'[\s\S]*movie_id must be an exact ID/);
  assert.match(workflow, /npm run publish:d1:process-one -- "\$MOVIE_ID"/);
});

test('end-to-end canary is manual, exact-ID, serialized and uses split D1 and R2 credentials', () => {
  assert.match(workflow, /options: \[plan, editorial-smoke, discover, end-to-end,/);
  assert.match(workflow, /group: cc18-content-pipeline/);
  assert.match(workflow, /if: inputs\.stage == 'end-to-end'[\s\S]*AITOKENKING_API_KEY: \$\{\{ secrets\.AITOKENKING_API_KEY \}\}/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /CLOUDFLARE_R2_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_R2_API_TOKEN \}\}/);
  assert.match(workflow, /npm run canary:run -- --max=1 --ids="\$MOVIE_ID"/);
  assert.doesNotMatch(workflow, /schedule:/);
});

test('existing Registry drafts are re-QAed instead of paying for a blind rewrite', async () => {
  const canary = await readFile(new URL('../scripts/canary/run.mjs', import.meta.url), 'utf8');
  assert.match(canary, /draftIds\.has\(id\) \? \['--qa-only'\]/);
  assert.match(canary, /rehydrate-completed\.mjs/);
  assert.match(canary, /rehydrate-media\.mjs/);
});

test('draft-only acceptance is bounded, read-only and cannot publish', () => {
  assert.match(draftWorkflow, /options: \['1', '2', '3'\]/);
  assert.match(draftWorkflow, /permissions:\s*\n\s*contents: read/);
  assert.match(draftWorkflow, /npm run editorial:draft-batch -- --max=\$\{\{ inputs\.maximum_works \}\}/);
  assert.match(draftWorkflow, /actions\/upload-artifact@v7/);
  assert.match(draftWorkflow, /name: Assert that no production path ran\s*\n\s*if: always\(\)/);
  assert.doesNotMatch(draftWorkflow, /schedule:|cron:|image:cycle|video:d1|publish:d1|git push|wrangler pages/);
});

test('source-only draft canary has no loopback analyzer dependency', async () => {
  const draftCanary = await readFile(new URL('../scripts/editorial/draft-canary-d1.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(draftCanary, /assertLocalAnalyzerReady|loadBridgeConfig/);
});
