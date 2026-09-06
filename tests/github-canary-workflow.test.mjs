import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/pipeline.yml', import.meta.url), 'utf8');
const draftWorkflow = await readFile(new URL('../.github/workflows/draft-canary.yml', import.meta.url), 'utf8');

test('editorial provider smoke remains a manual isolated action using the GitHub secret', () => {
  assert.match(workflow, /options: \[plan, editorial-smoke,/);
  assert.match(workflow, /if: github\.event_name == 'workflow_dispatch' && inputs\.stage == 'editorial-smoke'[\s\S]*AITOKENKING_API_KEY: \$\{\{ secrets\.AITOKENKING_API_KEY \}\}[\s\S]*npm run editorial:provider:smoke/u);
  assert.match(workflow, /inputs\.stage != 'editorial-smoke'/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' && inputs\.stage == 'editorial-smoke'/u);
});

test('publish remains a distinct exact-ID stage', () => {
  assert.match(workflow, /inputs\.stage == 'publish' \|\| inputs\.stage == 'end-to-end'[\s\S]*movie_id must be an exact ID/);
  assert.match(workflow, /npm run publish:d1:process-one -- "\$MOVIE_ID"/);
});

test('end-to-end canary remains manual, exact-ID, serialized and uses split D1 and R2 credentials', () => {
  assert.match(workflow, /options: \[plan, editorial-smoke, discover, end-to-end,/);
  assert.match(workflow, /group: cc18-content-pipeline/);
  assert.match(workflow, /if: github\.event_name == 'workflow_dispatch' && inputs\.stage == 'end-to-end'[\s\S]*AITOKENKING_API_KEY: \$\{\{ secrets\.AITOKENKING_API_KEY \}\}/u);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /CLOUDFLARE_R2_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_R2_API_TOKEN \}\}/);
  assert.match(workflow, /npm run canary:run -- --max=1 --ids="\$MOVIE_ID"/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' && inputs\.stage == 'end-to-end'/u);
  assert.match(workflow, /actions\/checkout@v7[\s\S]*ref: main[\s\S]*fetch-depth: 0/u);
});

test('hourly production discovery queues to D1 and drains serial isolated works without a daily limit', () => {
  assert.match(workflow, /schedule:\s*\n\s*- cron: '0 \* \* \* \*'/u);
  assert.match(workflow, /group: cc18-content-pipeline[\s\S]*cancel-in-progress: false/u);
  assert.match(workflow, /Configure publisher identity[\s\S]*github\.event_name == 'schedule'[\s\S]*cc18-publisher\[bot\][\s\S]*Discover all eligible works/u);
  const scheduledStep = workflow.match(/- name: Discover all eligible works and drain the D1 queue[\s\S]*?(?=\n\s+- name: Verify editorial provider connectivity only)/u)?.[0];
  assert.ok(scheduledStep);
  assert.match(scheduledStep, /if: github\.event_name == 'schedule'/u);
  assert.match(scheduledStep, /npm run discovery:run -- --store=d1/u);
  assert.match(scheduledStep, /npm run canary:drain -- --time-budget-minutes=240/u);
  assert.doesNotMatch(scheduledStep, /inputs\./u);
  assert.match(workflow, /AITOKENKING_API_KEY:[\s\S]*CLOUDFLARE_R2_API_TOKEN:[\s\S]*CC18_ALLOW_EDITORIAL_TRANSMISSION: YES[\s\S]*CC18_ALLOW_IMAGE_TRANSMISSION: YES/u);
  assert.doesNotMatch(workflow, /canary:drain[^\n]*(?:--max|--limit|--ids)/u);
  assert.match(workflow, /discovery_exit=\$\?[\s\S]*npm run canary:drain[\s\S]*exit "\$discovery_exit"/u);
  assert.match(workflow, /timeout-minutes: 360/u);
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
