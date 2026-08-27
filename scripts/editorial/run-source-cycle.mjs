import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {cycleArguments, editorialTransmissionAllowed} from '../worker/lib/cycle.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const {max} = cycleArguments(process.argv.slice(2));
if (!editorialTransmissionAllowed()) {
  throw new Error('Creative Editorial cycle requires CC18_ALLOW_EDITORIAL_TRANSMISSION=YES');
}

function runOne() {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [resolve(root, 'scripts/editorial/handoff-d1.mjs'), '--source-only'], {
      cwd: root,
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.once('close', (code) => resolveRun({code: code ?? 1, output}));
  });
}

const report = {event: 'creative_editorial_cycle_finished', maximum_jobs: max, completed: 0, failed: 0, queue_empty: false};
for (let index = 0; index < max; index += 1) {
  const result = await runOne();
  if (result.output.includes('"event":"editorial_queue_empty"')) {
    report.queue_empty = true;
    break;
  }
  if (result.code === 0) report.completed += 1;
  else report.failed += 1;
}
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
