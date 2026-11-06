import {spawn, spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {open, readFile, unlink, writeFile} from 'node:fs/promises';
import {hostname, tmpdir} from 'node:os';
import {isAbsolute, join, relative, resolve} from 'node:path';
import {WranglerQueueStore} from './lib/wrangler-queue-store.mjs';
import {completeEditorialAfterCheckpoint} from './lib/handoff-order.mjs';
import {isAdmittedCanaryWork} from '../canary/selection.mjs';
import {approveAfterAutomatedQa, assertFreshAutomatedQa} from './lib/approval.mjs';
import {
  checkpointArtifactPaths, createCleanWorktree, createRestoredCheckpointAuthorization,
  removeCleanWorktree, restoreWorkCheckpoint, saveWorkCheckpoint,
} from '../canary/isolation.mjs';

const root = resolve(import.meta.dirname, '../..');
const selectedId = process.argv.find((arg) => arg.startsWith('--id='))?.slice(5).toUpperCase() ?? null;
if (selectedId && !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/u.test(selectedId)) throw new Error('Invalid movie ID');
const researchNotesPath = process.argv.find((arg) => arg.startsWith('--research-notes='))?.slice('--research-notes='.length) ?? null;
if (researchNotesPath && !selectedId) throw new Error('Research notes require an exact movie ID');
const approvedResponse = process.argv.find((arg) => arg.startsWith('--approved-response='))?.slice('--approved-response='.length) ?? null;
const approvedResponseHash = process.argv.find((arg) => arg.startsWith('--approved-response-sha256='))?.slice('--approved-response-sha256='.length) ?? null;
const approvedSourceHash = process.argv.find((arg) => arg.startsWith('--approved-source-sha256='))?.slice('--approved-source-sha256='.length) ?? null;
if (approvedResponse && (!selectedId || !/^[a-f0-9]{64}$/u.test(approvedResponseHash ?? '') || !/^[a-f0-9]{64}$/u.test(approvedSourceHash ?? ''))) {
  throw new Error('An approved response requires exact movie ID, response hash and source hash');
}
const lockPath = join(tmpdir(), 'cc18-local-editorial.lock');
const runId = randomUUID();
const git = (args) => {
  const result = spawnSync('git', args, {cwd: root, encoding: 'utf8', windowsHide: true});
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
};
const runNode = async (workspaceRoot, script, args = []) => {
  const code = await new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [resolve(workspaceRoot, script), ...args], {
      cwd: workspaceRoot, env: process.env, windowsHide: true, stdio: 'inherit',
    });
    child.once('error', rejectRun);
    child.once('close', resolveRun);
  });
  if (code !== 0) throw Object.assign(new Error(`${script} exited with ${code}`), {code: 'EDITORIAL_QA_FAILED'});
};
const sha = (value) => createHash('sha256').update(value).digest('hex');
const snapshot = async (workspaceRoot, movieId) => {
  const result = {};
  for (const path of checkpointArtifactPaths(movieId).filter((item) => !['data/movie-registry.json', 'data/tag-candidates.json'].includes(item))) {
    try { result[path] = sha(await readFile(resolve(workspaceRoot, path))); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  return result;
};
const candidateJobs = async (store, registry, now) => {
  const published = new Set(registry.records.filter((item) => item.review_status !== 'draft').map((item) => item.id));
  let offset = 0;
  while (true) {
    const [page] = await store.query({
      sql: `SELECT j.* FROM pipeline_jobs j JOIN movies m ON m.id=j.movie_id
        WHERE j.stage='editorial'
          AND (j.status IN ('queued','retry') OR (j.status='leased' AND j.lease_expires_at<=?))
          AND j.attempt<j.max_attempts AND (j.next_retry_at IS NULL OR j.next_retry_at<=?)
          AND m.metadata_status='validated'
          AND (m.classification='eligible' OR (m.classification='late_arrival' AND j.discovery_run_id IS NOT NULL))
          AND (? IS NULL OR j.movie_id=?)
          AND NOT EXISTS (SELECT 1 FROM pipeline_jobs p WHERE p.movie_id=j.movie_id AND p.stage='publish' AND p.status='completed')
        ORDER BY j.priority DESC,j.created_at ASC LIMIT 50 OFFSET ?`,
      params: [now.toISOString(), now.toISOString(), selectedId, selectedId, offset],
    });
    const jobs = page.results ?? [];
    const candidate = jobs.find((job) => !published.has(job.movie_id));
    if (candidate) return candidate;
    if (jobs.length < 50) return null;
    offset += jobs.length;
  }
};
const relatedResearch = async ({workspaceRoot, source, registry}) => {
  const targetSeries = new Set((source.source_relations?.series ?? []).map((item) => item.stable_source_id));
  const targetActors = new Set((source.source_relations?.performers ?? []).map((item) => item.stable_source_id));
  const related = [];
  for (const record of registry.records.toReversed()) {
    if (record.id === source.id || record.review_status !== 'published') continue;
    let other;
    try { other = JSON.parse(await readFile(resolve(workspaceRoot, `data/source-records/${record.id}.json`), 'utf8')); }
    catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
    const sharedSeries = (other.source_relations?.series ?? []).some((item) => targetSeries.has(item.stable_source_id));
    const sharedActor = (other.source_relations?.performers ?? []).some((item) => targetActors.has(item.stable_source_id));
    if (!sharedSeries && !sharedActor) continue;
    related.push({id: record.id, source_url: other.source_url, source_title: other.title,
      source_description: other.description, shared_series: sharedSeries, shared_performer: sharedActor});
    if (related.length >= 6) break;
  }
  return related;
};
const runCodex = async ({workspaceRoot, source, examples, related, researchNotes, responsePath}) => {
  const prompt = `你是 JAV 影格繁中編輯。本次只輸出一個 JSON 物件，供既有 Editorial 正規化與 QA 使用。
寫作前先提出一個能由資料回答的背景問題，再用本作、同演員、同系列或片商的可核對材料回答它。優先查找官方作品、人物、系列或訪談頁；若執行環境無法開啟外部頁面，只使用下方已核對的研究資料與來源快照，不得把搜尋片段冒充已讀全文。比較必須指出具體設定差異及其選片意義，不由宣傳文案推論成片品質。材料不足就寫精簡文章，材料範圍集中在文末，不要每節重複未觀影提醒。不得捏造來源、人物經歷或已觀看的畫面、聲音與台詞。範例只供學習判斷方式，不得照抄句子，也不得把無關範例當成本作背景。
JSON 欄位：research_question、research_sources（實際使用的來源 URL 與支持要點；可空）、angle_candidates、selected_thesis、title_signals（可空）、work_title（作品 H1，自然繁中，不重複番號）、display_short_title（卡片短題，不重複番號）、title（文章觀點 H2，不重複番號）、seo_title（包含番號）、social_title、short_review、editorial_angle、editorial_tag_ids（可空）、evidence（每項 basis=public_source、signal、supports、observation_refs=[]）、creative_reconstruction_notes（可空）、unsupported_claims_excluded、decision_guide（thesis、story_density=unknown、pace=unknown、presentation、audience_for、audience_not_for、questions_answered）、sections（heading、body）。所有公開文字都用自然繁中，不寫內部欄位名稱；正文不要出現 stable ID、Source Record、Movie Master、Search Content、D1 或 QA 等工程名稱，人物關係可寫成「同樣由某人演出」。人物主要名稱優先使用已核准的繁中顯示名；若無核准名，使用來源人物關係中的原名，不得把來源標題裡的翻譯別名升為主要名稱。title_signals 不確定就留空。日文系列名不可冒充作品原題。文章可短，但要有來源支持的具體判斷。
當前作品來源 JSON：\n${JSON.stringify(source)}
經人物與系列關係核對的關聯作品：\n${JSON.stringify(related)}
已核對的額外研究材料（若無則為 null）：\n${JSON.stringify(researchNotes)}
三篇已核准文章範例（僅作寫作方法參考）：\n${examples}`;
  const code = await new Promise((resolveRun, rejectRun) => {
    const child = spawn('codex.exe', ['exec', '--ephemeral', '-s', 'read-only', '-C', workspaceRoot,
      '-o', responsePath, '-'], {cwd: workspaceRoot, windowsHide: true, stdio: ['pipe', 'ignore', 'inherit']});
    child.once('error', rejectRun);
    child.once('close', resolveRun);
    child.stdin.end(prompt, 'utf8');
  });
  if (code !== 0) throw Object.assign(new Error(`Codex writer exited with ${code}`), {code: 'EDITORIAL_GENERATION_FAILED'});
  const text = await readFile(responsePath, 'utf8');
  if (!text.trim()) throw Object.assign(new Error('Codex writer returned an empty response'), {code: 'EDITORIAL_GENERATION_FAILED'});
  return text;
};
const approve = async (workspaceRoot, movieId) => {
  const path = (name) => resolve(workspaceRoot, name);
  const review = `content/reviews/${movieId}.md`;
  const quality = `data/review-quality/${movieId}.json`;
  const automated = `data/review-quality/${movieId}-automated.json`;
  const [markdown, qualityData, automatedData, registry] = await Promise.all([
    readFile(path(review), 'utf8'), readFile(path(quality), 'utf8').then(JSON.parse),
    readFile(path(automated), 'utf8').then(JSON.parse),
    readFile(path('data/movie-registry.json'), 'utf8').then(JSON.parse),
  ]);
  assertFreshAutomatedQa({movieId, markdown, report: automatedData});
  const approved = approveAfterAutomatedQa({movieId, markdown, quality: qualityData, registry,
    publishedAt: new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Taipei'}).format(new Date())});
  await Promise.all([
    writeFile(path(review), approved.markdown, 'utf8'),
    writeFile(path(quality), `${JSON.stringify(approved.quality, null, 2)}\n`),
    writeFile(path('data/movie-registry.json'), `${JSON.stringify(approved.registry, null, 2)}\n`),
  ]);
};

// A persistent local lock prevents two Codex schedules on the same computer from overlapping.
// A crash deliberately leaves the lock for explicit recovery; D1 leases still expire normally.
const lock = await open(lockPath, 'wx');
await lock.writeFile(JSON.stringify({run_id: runId, pid: process.pid, started_at: new Date().toISOString()}));
let isolated = null;
let restored = null;
let claimed = null;
let leaseTimer = null;
let leasePending = Promise.resolve();
let leaseError = null;
const store = new WranglerQueueStore({root});
const workerId = `local-codex-${hostname()}-${process.pid}-${runId.slice(0, 8)}`;
try {
  git(['fetch', '--quiet', 'origin', 'main']);
  const config = JSON.parse(git(['show', 'origin/main:config/pipeline.json']));
  if (config.production?.editorial_executor !== 'local_codex') throw new Error('Local Codex Editorial cutover is not enabled on origin/main');
  const login = spawnSync('codex.exe', ['login', 'status'], {cwd: root, encoding: 'utf8', windowsHide: true});
  if (login.error || login.status !== 0) {
    throw Object.assign(new Error('Codex CLI login is unavailable before the Editorial claim'),
      {code: 'LOCAL_CODEX_LOGIN_REQUIRED'});
  }
  const researchNotes = researchNotesPath ? JSON.parse(await readFile(resolve(researchNotesPath), 'utf8')) : null;
  if (researchNotes && (researchNotes.movie_id !== selectedId || !researchNotes.question || !Array.isArray(researchNotes.sources)
    || researchNotes.sources.some((item) => !/^https:\/\//u.test(item.url ?? '') || !item.supports))) {
    throw new Error('Research notes must identify the selected work and cite supported HTTPS sources');
  }
  const registry = JSON.parse(git(['show', 'origin/main:data/movie-registry.json']));
  const candidate = await candidateJobs(store, registry, new Date());
  if (!candidate) {
    console.log(JSON.stringify({event: 'local_codex_editorial_empty', run_id: runId}));
    process.exitCode = 0;
  } else {
    claimed = await store.claim({stage: 'editorial', jobId: candidate.id, workerId, leaseSeconds: config.queue.lease_seconds});
    if (!claimed) throw new Error(`${candidate.movie_id}: lost the atomic Editorial claim`);
    const movieId = claimed.movie_id;
    const interval = Math.max(30_000, Math.floor(config.queue.lease_seconds * 1000 / 3));
    leaseTimer = setInterval(() => {
      leasePending = leasePending.then(() => store.renewLease({jobId: claimed.id, workerId, leaseSeconds: config.queue.lease_seconds}))
        .catch((error) => { leaseError = error; });
    }, interval);
    const movie = await store.getMovie(movieId);
    if (!isAdmittedCanaryWork({movie, editorialJob: claimed})) throw new Error(`${movieId}: D1 movie no longer admitted`);
    const source = JSON.parse(movie.source_json);
    if (source.id !== movieId || source.source_url !== movie.source_url) throw new Error(`${movieId}: source identity mismatch`);
    if (approvedResponse && sha(movie.source_json) !== approvedSourceHash) throw new Error(`${movieId}: approved source snapshot changed`);
    isolated = await createCleanWorktree({repositoryRoot: root, baseRef: 'origin/main'});
    const existing = registry.records.find((item) => item.id === movieId);
    if (existing && existing.review_status !== 'draft') throw new Error(`${movieId}: already published on main`);
    await writeFile(resolve(isolated.workspaceRoot, `data/source-records/${movieId}.json`), `${JSON.stringify(source, null, 2)}\n`);
    await runNode(isolated.workspaceRoot, 'scripts/publish/source-preflight.mjs', [movieId]);
    const related = await relatedResearch({workspaceRoot: isolated.workspaceRoot, source, registry});
    const examples = (await Promise.all(['MARN-007', 'CPZ69-015', 'MARR-015'].map(async (id) => {
      const markdown = await readFile(resolve(isolated.workspaceRoot, `content/reviews/${id}.md`), 'utf8');
      return {id, body: markdown.replace(/^---\r?\n[\s\S]*?\r?\n---/u, '').slice(0, 3500)};
    }))).map((item) => JSON.stringify(item)).join('\n');
    const responsePath = approvedResponse
      ? resolve(isolated.workspaceRoot, approvedResponse)
      : join(tmpdir(), `cc18-${movieId}-${runId}-codex.json`);
    if (approvedResponse) {
      const rel = relative(isolated.workspaceRoot, responsePath);
      if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Approved response must belong to the clean repository');
    }
    const raw = approvedResponse
      ? await readFile(responsePath, 'utf8')
      : await runCodex({workspaceRoot: isolated.workspaceRoot, source, examples, related, researchNotes, responsePath});
    if (approvedResponse && sha(raw) !== approvedResponseHash) throw new Error(`${movieId}: approved response hash changed`);
    JSON.parse(raw); // malformed output never reaches D1 completion
    if (leaseError) throw leaseError;
    await runNode(isolated.workspaceRoot, 'scripts/editorial/build-from-analysis.mjs', [movieId, '--source-only', `--codex-response=${responsePath}`]);
    const briefPath = resolve(isolated.workspaceRoot, `data/editorial-briefs/${movieId}.json`);
    const brief = JSON.parse(await readFile(briefPath, 'utf8'));
    brief.local_codex_handoff = {
      source_sha256: sha(await readFile(resolve(isolated.workspaceRoot, `data/source-records/${movieId}.json`))),
      response_sha256: sha(raw),
      research_input_sha256: sha(JSON.stringify({source, related, examples, researchNotes})),
      related_source_ids: related.map(({id}) => id),
      ...(researchNotes ? {research_question: researchNotes.question,
        research_sources: researchNotes.sources, research_notes_sha256: sha(JSON.stringify(researchNotes))} : {}),
    };
    await writeFile(briefPath, `${JSON.stringify(brief, null, 2)}\n`);
    await runNode(isolated.workspaceRoot, 'scripts/editorial/qa-draft.mjs', [movieId]);
    await approve(isolated.workspaceRoot, movieId);
    const expected = await snapshot(isolated.workspaceRoot, movieId);
    let actual;
    const {checkpoint, finished} = await completeEditorialAfterCheckpoint({
      save: () => saveWorkCheckpoint({repositoryRoot: root, workspaceRoot: isolated.workspaceRoot, baseRef: 'origin/main', movieId}),
      verify: async (saved) => {
        restored = await createCleanWorktree({repositoryRoot: root, baseRef: 'origin/main'});
        const actualRestore = await restoreWorkCheckpoint({repositoryRoot: root, workspaceRoot: restored.workspaceRoot, movieId});
        if (!actualRestore.restored || actualRestore.commit !== saved.commit) throw new Error(`${movieId}: checkpoint restore mismatch`);
        await createRestoredCheckpointAuthorization({workspaceRoot: restored.workspaceRoot, movieId, restoredPaths: actualRestore.paths});
        actual = await snapshot(restored.workspaceRoot, movieId);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${movieId}: restored artifact hashes differ`);
      },
      finish: async () => {
        if (leaseError) throw leaseError;
        clearInterval(leaseTimer);
        leaseTimer = null;
        await leasePending;
        const latestMovie = await store.getMovie(movieId);
        if (!latestMovie || sha(latestMovie.source_json ?? '') !== sha(movie.source_json)) {
          throw new Error(`${movieId}: D1 source changed after the Editorial claim`);
        }
        // The canary's restored published Registry guard requires an existing publish job.
        // Both enqueues are idempotent; Editorial remains leased until they succeed.
        await store.enqueueJob({movieId, stage: 'image', priority: claimed.priority, discoveryRunId: claimed.discovery_run_id});
        await store.enqueueJob({movieId, stage: 'publish', priority: claimed.priority, discoveryRunId: claimed.discovery_run_id});
        return store.finishJob({jobId: claimed.id, workerId, outcome: 'completed'});
      },
    });
    claimed = null;
    console.log(JSON.stringify({event: 'local_codex_editorial_completed', run_id: runId, movie_id: movieId,
      editorial_job_id: finished.id, checkpoint_ref: checkpoint.ref, checkpoint_commit: checkpoint.commit,
      source_sha256: sha(movie.source_json), response_sha256: sha(raw), artifact_hashes: actual}));
  }
} catch (error) {
  if (claimed) {
    try {
      const outcome = claimed.attempt >= claimed.max_attempts ? 'failed' : 'retry';
      await store.finishJob({jobId: claimed.id, workerId, outcome,
        errorCode: error.code ?? 'LOCAL_CODEX_EDITORIAL_FAILED',
        retryAt: outcome === 'retry' ? new Date(Date.now() + 30 * 60_000).toISOString() : null});
    } catch (finishError) {
      console.error(JSON.stringify({event: 'local_codex_editorial_finish_failed', message: finishError.message}));
    }
  }
  console.error(JSON.stringify({event: 'local_codex_editorial_failed', run_id: runId,
    movie_id: claimed?.movie_id ?? null, message: error.message}));
  process.exitCode = 1;
} finally {
  if (leaseTimer) clearInterval(leaseTimer);
  await leasePending;
  try {
    if (restored) await removeCleanWorktree({repositoryRoot: root, ...restored});
    if (isolated) await removeCleanWorktree({repositoryRoot: root, ...isolated});
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
