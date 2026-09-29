import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  assertProductionEnvironment,
  drainArguments,
  productionDrainOptions,
} from '../scripts/worker/lib/production-drain.mjs';

test('production drain requires explicit transmission approval and a bounded time budget', () => {
  assert.deepEqual(productionDrainOptions(['--allow-transmission=YES']), {timeBudgetMinutes: 50});
  assert.deepEqual(productionDrainOptions(['--allow-transmission=YES', '--time-budget-minutes=75']), {timeBudgetMinutes: 75});
  assert.throws(() => productionDrainOptions([]), /allow-transmission=YES/u);
  assert.throws(() => productionDrainOptions(['--allow-transmission=YES', '--time-budget-minutes=4']), /between 5 and 240/u);
  assert.throws(() => productionDrainOptions(['--allow-transmission=YES', '--time-budget-minutes=241']), /between 5 and 240/u);
});

test('production drain validates required credentials without requiring optional R2 media credentials', () => {
  const input = {
    AITOKENKING_API_KEY: 'editorial',
    CLOUDFLARE_ACCOUNT_ID: 'account',
    CLOUDFLARE_D1_DATABASE_ID: 'database',
    CLOUDFLARE_API_TOKEN: 'd1-token',
  };
  const output = assertProductionEnvironment(input);
  assert.equal(output.CC18_ALLOW_EDITORIAL_TRANSMISSION, 'YES');
  assert.equal(output.CC18_ALLOW_IMAGE_TRANSMISSION, 'NO');
  assert.equal(assertProductionEnvironment({...input, CLOUDFLARE_R2_API_TOKEN: 'r2'}).CC18_ALLOW_IMAGE_TRANSMISSION, 'YES');
  assert.throws(() => assertProductionEnvironment({...input, CLOUDFLARE_API_TOKEN: ''}), /CLOUDFLARE_API_TOKEN/u);
  assert.throws(() => assertProductionEnvironment({...input, CC18_R2_AUTH_MODE: 'api-token'}), /CLOUDFLARE_R2_API_TOKEN/u);
});

test('production drain delegates to the existing bounded serial drain', () => {
  assert.deepEqual(drainArguments(50), ['scripts/canary/drain.mjs', '--time-budget-minutes=50']);
});

test('Windows scheduled task keeps overlap protection and never embeds secret values', async () => {
  const installer = await readFile(new URL('../scripts/worker/install-production-drain-task.ps1', import.meta.url), 'utf8');
  assert.match(installer, /RepetitionInterval \(New-TimeSpan -Minutes \$IntervalMinutes\)/u);
  assert.match(installer, /MultipleInstances IgnoreNew/u);
  assert.match(installer, /RunOnlyIfNetworkAvailable/u);
  assert.match(installer, /\[switch\]\$ValidateOnly/u);
  assert.match(installer, /if \(\$ValidateOnly\)/u);
  assert.match(installer, /--env-file=\$_/u);
  assert.match(installer, /RuntimeRoot must have no tracked or staged changes/u);
  assert.match(installer, /yaoshengmarketing-prog\/cc18/u);
  assert.doesNotMatch(installer, /AITOKENKING_API_KEY\s*=\s*['"][^'"]+['"]/u);
});
