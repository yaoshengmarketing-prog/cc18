import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {connect} from 'node:tls';
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

export const queueDrainExitCode = (summary) => summary.outcome === 'failed' ? 1 : 0;

export async function hasExpiredEditorialProviderCertificate() {
  let endpoint;
  try {
    const config = JSON.parse(readFileSync(resolve(root, 'config/editorial-model.json'), 'utf8'));
    endpoint = new URL(config.base_url);
    if (endpoint.protocol !== 'https:') return false;
  } catch {
    return false;
  }
  return new Promise((resolveResult) => {
    const socket = connect({
      host: endpoint.hostname,
      port: Number(endpoint.port || 443),
      servername: endpoint.hostname,
      rejectUnauthorized: true,
    });
    let settled = false;
    const finish = (expired) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveResult(expired);
    };
    socket.once('secureConnect', () => finish(false));
    socket.once('error', (error) => finish(error.code === 'CERT_HAS_EXPIRED'));
    socket.setTimeout(7000, () => finish(false));
  });
}

export async function runOneIsolated({excludeMovieIds = []} = {}) {
  const args = [resolve(root, 'scripts/canary/run-isolated.mjs'), '--max=1'];
  if (excludeMovieIds.length) args.push(`--exclude=${excludeMovieIds.join(',')}`);
  let stdout = '';
  let stderr = '';
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
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    stderr = `${stderr}${chunk}`.slice(-100_000);
  });
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolveExit(code ?? 1));
  });
  return {
    exitCode,
    report: parseCanaryResult(stdout),
    observedProviderCertificateError: /\bCERT_HAS_EXPIRED\b/u.test(`${stdout}\n${stderr}`),
  };
}

export async function drainIsolatedQueue({runOne = runOneIsolated, logger = console, deadlineAt = null,
  maximumWorks = null, now = Date.now, providerCertificateExpired = hasExpiredEditorialProviderCertificate} = {}) {
  if (deadlineAt !== null && (!Number.isFinite(deadlineAt) || deadlineAt <= 0)) {
    throw new Error('Queue drain deadline must be a positive epoch millisecond value');
  }
  if (maximumWorks !== null && (!Number.isInteger(maximumWorks) || maximumWorks < 1)) {
    throw new Error('Queue drain maximumWorks must be a positive integer');
  }
  const attemptedMovieIds = new Set();
  const summary = {
    event: 'scheduled_queue_drain_finished',
    processed: [],
    completed: [],
    failed: [],
    work_errors: [],
    stop_reason: null,
    outcome: null,
  };
  const finish = (stopReason) => {
    summary.stop_reason = stopReason;
    summary.outcome = summary.failed.length === 0
      ? 'success'
      : summary.completed.length === 0 ? 'failed' : 'partial';
    logger.log(JSON.stringify(summary, null, 2));
    return summary;
  };
  while (true) {
    if (maximumWorks !== null && summary.processed.length >= maximumWorks) {
      return finish('attempt_limit_reached');
    }
    if (deadlineAt !== null && now() >= deadlineAt) {
      return finish('time_budget_reached');
    }
    const {exitCode, report, observedProviderCertificateError} = await runOne({excludeMovieIds: [...attemptedMovieIds]});
    if (report.event === 'isolated_canary_queue_empty') {
      return finish('queue_empty');
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
      if (observedProviderCertificateError && await providerCertificateExpired()) {
        return finish('editorial_provider_certificate_expired');
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rawBudget = option('--time-budget-minutes');
  const rawMaximum = option('--max-works');
  const budgetMinutes = rawBudget === undefined ? null : Number(rawBudget);
  const maximumWorks = rawMaximum === undefined ? null : Number(rawMaximum);
  if (budgetMinutes !== null && (!Number.isFinite(budgetMinutes) || budgetMinutes <= 0)) {
    throw new Error('--time-budget-minutes must be a positive number');
  }
  if (maximumWorks !== null && (!Number.isInteger(maximumWorks) || maximumWorks < 1)) {
    throw new Error('--max-works must be a positive integer');
  }
  const summary = await drainIsolatedQueue({
    deadlineAt: budgetMinutes === null ? null : Date.now() + budgetMinutes * 60_000,
    maximumWorks,
  });
  process.exitCode = queueDrainExitCode(summary);
}
