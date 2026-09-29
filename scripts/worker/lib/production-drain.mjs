export const REQUIRED_PRODUCTION_ENVIRONMENT = Object.freeze([
  'AITOKENKING_API_KEY',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_D1_DATABASE_ID',
  'CLOUDFLARE_API_TOKEN',
]);

const option = (arguments_, name) => arguments_
  .find((value) => value.startsWith(`${name}=`))
  ?.slice(name.length + 1);

export function productionDrainOptions(arguments_) {
  const budget = Number(option(arguments_, '--time-budget-minutes') ?? 50);
  const transmission = option(arguments_, '--allow-transmission');
  if (!Number.isFinite(budget) || budget < 5 || budget > 240) {
    throw new Error('--time-budget-minutes must be between 5 and 240');
  }
  if (transmission !== 'YES') {
    throw new Error('Production drain requires --allow-transmission=YES');
  }
  return {timeBudgetMinutes: budget};
}

export function assertProductionEnvironment(environment) {
  const missing = REQUIRED_PRODUCTION_ENVIRONMENT.filter((key) => !environment[key]?.trim());
  if (missing.length) throw new Error(`Production drain is missing required environment values: ${missing.join(', ')}`);
  if (environment.CC18_R2_AUTH_MODE?.trim().toLowerCase() === 'api-token'
    && !environment.CLOUDFLARE_R2_API_TOKEN?.trim()) {
    throw new Error('CC18_R2_AUTH_MODE=api-token requires CLOUDFLARE_R2_API_TOKEN');
  }
  return {
    ...environment,
    CC18_ALLOW_EDITORIAL_TRANSMISSION: 'YES',
    CC18_ALLOW_IMAGE_TRANSMISSION: environment.CLOUDFLARE_R2_API_TOKEN?.trim() ? 'YES' : 'NO',
  };
}

export const drainArguments = (timeBudgetMinutes) => [
  'scripts/canary/drain.mjs',
  `--time-budget-minutes=${timeBudgetMinutes}`,
];
