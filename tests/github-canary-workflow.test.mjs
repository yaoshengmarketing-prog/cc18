import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/pipeline.yml', import.meta.url), 'utf8');

test('editorial provider smoke is manual, isolated and uses the GitHub secret', () => {
  assert.match(workflow, /options: \[plan, editorial-smoke,/);
  assert.match(workflow, /if: inputs\.stage == 'editorial-smoke'[\s\S]*AITOKENKING_API_KEY: \$\{\{ secrets\.AITOKENKING_API_KEY \}\}[\s\S]*npm run editorial:provider:smoke/);
  assert.match(workflow, /inputs\.stage != 'editorial-smoke'/);
  assert.doesNotMatch(workflow, /schedule:/);
});

test('publish remains a distinct exact-ID stage', () => {
  assert.match(workflow, /if: inputs\.stage == 'publish'[\s\S]*test -n "\$MOVIE_ID"/);
  assert.match(workflow, /npm run publish:d1:process-one -- "\$MOVIE_ID"/);
});
