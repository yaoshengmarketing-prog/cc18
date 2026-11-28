import {access, appendFile, mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {autoExclusionDecision} from './selection-gate.mjs';

export const exclusionErrorCode = 'auto_excluded_minor_role';

export async function gateClaimedEditorial({root, source, movieId, job, workerId, store, checkpoint = async () => {}, date = new Date()}) {
  const exclusionPath = resolve(root, `data/editorial-exclusions/${movieId}.json`);
  let existing = false;
  try { await access(exclusionPath); existing = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const decision = autoExclusionDecision(source);
  if (!existing && !decision.excluded) return {excluded: false, terms: [], sentence: null};
  if (!existing) {
    const day = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Taipei'}).format(date);
    await mkdir(dirname(exclusionPath), {recursive: true});
    await writeFile(exclusionPath, `${JSON.stringify({id: movieId, reason: 'auto-gate v1：來源簡介直接寫明角色身分',
      trigger_sentence: decision.sentence, detected_terms: decision.terms, date: day}, null, 2)}\n`, 'utf8');
    const reviewPath = resolve(root, 'data/editorial-exclusions/auto-review.md');
    await appendFile(reviewPath, `${day}｜${movieId}｜${decision.terms.join('、')}｜${decision.sentence}｜待每週人工複核，判錯可移除 exclusion 檔放回\n`, 'utf8');
    await checkpoint(movieId);
  }
  await store.finishJob({jobId: job.id, workerId, outcome: 'cancelled', errorCode: exclusionErrorCode});
  return {...decision, excluded: true, existing};
}
