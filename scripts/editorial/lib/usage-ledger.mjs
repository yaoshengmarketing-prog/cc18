import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export async function appendEditorialUsage({root, movieId, rewriteAttempt, usage}) {
  await mkdir(resolve(root, 'data/editorial-usage'), {recursive: true});
  const usagePath = resolve(root, `data/editorial-usage/${movieId}.json`);
  let previousUsage = {calls: []};
  try {
    previousUsage = JSON.parse(await readFile(usagePath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const usageCall = {generated_at: new Date().toISOString(), rewrite_attempt: rewriteAttempt, ...usage};
  const calls = [...(previousUsage.calls ?? []), usageCall];
  const sum = (field) => calls.reduce((total, call) => total + (call[field] ?? 0), 0);
  const receipt = {
    schema_version: 1,
    movie_id: movieId,
    calls,
    totals: {
      input_tokens: sum('input_tokens'),
      cached_input_tokens: sum('cached_input_tokens'),
      output_tokens: sum('output_tokens'),
      estimated_cost_usd: Number(sum('estimated_cost_usd').toFixed(6)),
      estimated_payg_cash_cost_usd: Number(sum('estimated_payg_cash_cost_usd').toFixed(6)),
      direct_openai_reference_usd: Number(sum('direct_openai_reference_usd').toFixed(6)),
      gateway_premium_usd: Number(sum('gateway_premium_usd').toFixed(6)),
    },
  };
  await writeFile(usagePath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}
