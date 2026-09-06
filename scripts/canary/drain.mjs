import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
export const CANARY_RESULT_PREFIX = 'CC18_CANARY_RESULT=';
const option = (name) => process.argv.slice(2).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);

export function parseCanaryResult(output) {
  const line = String(output).split(/\r?\n/u).findLast((value) => value.startsWith(CANARY_RESULT_PREFIX));
  if (!line) throw new Error('Isolated canary did not emit a machine-readable result');
  try {
    return JSON.parse(line.slice(CANARY_RESULT_PREFIX.length));
  } catch {
    throw new Error('Isolated canary emitted an invalid machine-readable result');
  }
}

export async function runOneIsolated({excludeMovieIds = []} = {}) {
  const args = [resolve(root, 'scripts/canary/run-isolated.mjs'), '--max=1'];
  if (excludeMovieIds.length) args.push(`--exclude=${excludeMovieIds.join(',')}`);
  let stdout = '';
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: process.env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    stdout = `${stdout}${chunk}`.slice(-1_000_000);
  });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolveExit(code ?? 1));
  });
  return {exitCode, report: parseCanaryResult(stdout)};
}

export async function drainIsolatedQueue({runOne = runOneIsolated, logger = console, deadlineAt = null, now = Date.now} = {}) {
  if (deadlineAt !== null && (!Number.isFinite(deadlineAt) || deadlineAt <= 0)) {
    throw new Error('Queue drain deadline must be a positive epoch millisecond value');
  }
  const attemptedMovieIds = new Set();
  const summary = {
    event: 'scheduled_queue_drain_finished',
    processed: [],
    completed: [],
    failed: [],
    work_errors: [],
    stop_reason: null,
  };
  while (true) {
    if (deadlineAt !== null && now() >= deadlineAt) {
      summary.stop_reason = 'time_budget_reached';
      logger.log(JSON.stringify(summary, null, 2));
      return summary;
    }
    const {exitCode, report} = await runOne({excludeMovieIds: [...attemptedMovieIds]});
    if (report.event === 'isolated_canary_queue_empty') {
      summary.stop_reason = 'queue_empty';
      logger.log(JSON.stringify(summary, null, 2));
      return summary;
    }
    if (report.event !== 'isolated_canary_finished' || !report.movie_id) {
      throw new Error(`Unexpected isolated canary result: ${report.event ?? 'missing event'}`);
    }
    const movieId = String(report.movie_id).toUpperCase();
    if (attemptedMovieIds.has(movieId)) throw new Error(`Queue drain selected the same movie twice: ${movieId}`);
    attemptedMovieIds.add(movieId);
    summary.processed.push(movieId);
    if (exitCode === 0) {
      summary.completed.push(movieId);
    } else {
      summary.failed.push(movieId);
      if (report.work_error) summary.work_errors.push({movie_id: movieId, ...report.work_error});
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rawBudget = option('--time-budget-minutes');
  const budgetMinutes = rawBudget === undefined ? null : Number(rawBudget);
  if (budgetMinutes !== null && (!Number.isFinite(budgetMinutes) || budgetMinutes <= 0)) {
    throw new Error('--time-budget-minutes must be a positive number');
  }
  await drainIsolatedQueue({
    deadlineAt: budgetMinutes === null ? null : Date.now() + budgetMinutes * 60_000,
  });
}
