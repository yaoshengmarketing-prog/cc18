import {spawn} from 'node:child_process';
import {appendFile, mkdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {cycleArguments, bridgeOutcome, editorialTransmissionAllowed} from './lib/cycle.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const pipeline = JSON.parse(await readFile(resolve(root, 'config/pipeline.json'), 'utf8'));
const {max, withEditorial} = cycleArguments(process.argv.slice(2));

if (pipeline.publishing.daily_enabled) {
  throw new Error('This worker creates drafts only; disable publishing.daily_enabled before using it');
}
if (withEditorial && !editorialTransmissionAllowed()) {
  throw new Error('--with-editorial also requires CC18_ALLOW_EDITORIAL_TRANSMISSION=YES');
}

function run(script, arguments_ = []) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [resolve(root, script), ...arguments_], {
      cwd: root,
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      const value = chunk.toString();
      output += value;
      process.stdout.write(value);
    });
    child.stderr.on('data', (chunk) => {
      const value = chunk.toString();
      output += value;
      process.stderr.write(value);
    });
    child.on('close', (code) => resolvePromise({code: code ?? 1, output}));
  });
}

const report = {
  event: 'worker_cycle_finished',
  started_at: new Date().toISOString(),
  mode: withEditorial ? 'media_and_editorial_drafts' : 'media_only',
  maximum_jobs: max,
  media_completed: [],
  media_failed: [],
  editorial_completed: [],
  editorial_failed: [],
  queue_empty: false,
};

for (let index = 0; index < max; index += 1) {
  const media = await run('scripts/bridge/process-d1-one.mjs');
  const outcome = bridgeOutcome(media.output);
  if (outcome.status === 'empty') {
    report.queue_empty = true;
    break;
  }
  if (outcome.status !== 'completed') {
    report.media_failed.push(outcome.movieId ?? `unknown-${index + 1}`);
    continue;
  }
  report.media_completed.push(outcome.movieId);
  if (!withEditorial) continue;
  const editorial = await run('scripts/editorial/handoff-d1.mjs', [outcome.movieId]);
  if (editorial.code === 0) report.editorial_completed.push(outcome.movieId);
  else report.editorial_failed.push(outcome.movieId);
}

report.finished_at = new Date().toISOString();
await mkdir(resolve(root, '.cc18-bridge'), {recursive: true});
await appendFile(resolve(root, '.cc18-bridge/cycle-runs.jsonl'), `${JSON.stringify(report)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));

if (report.media_failed.length || report.editorial_failed.length) process.exitCode = 1;
