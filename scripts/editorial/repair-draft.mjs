import {mkdir, readFile, unlink, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {appendEditorialUsage} from './lib/usage-ledger.mjs';
import {applyLocalRepair, buildLocalRepairRequest, localRepairSchemaFor} from './lib/local-repair.mjs';
import {assertEditorialProviderReady, editorialApiKey, loadLocalEditorialEnvironment, requestStructuredEditorial} from './lib/openai-writer.mjs';
import {parseFirstJsonObject} from './lib/provider-normalization.mjs';

const movieId = process.argv.slice(2).find((argument) => !argument.startsWith('--'))?.trim().toUpperCase();
if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId ?? '')) throw new Error('Usage: node scripts/editorial/repair-draft.mjs <MOVIE-ID>');
if (process.env.CC18_ALLOW_EDITORIAL_TRANSMISSION !== 'YES') {
  throw new Error('Local repair requires CC18_ALLOW_EDITORIAL_TRANSMISSION=YES');
}

const root = resolve(import.meta.dirname, '..', '..');
loadLocalEditorialEnvironment(root);
const readJson = (path) => readFile(resolve(root, path), 'utf8').then(JSON.parse);
const reviewPath = resolve(root, `content/reviews/${movieId}.md`);
const qualityPath = resolve(root, `data/review-quality/${movieId}-automated.json`);
const [markdown, report, source, brief, config] = await Promise.all([
  readFile(reviewPath, 'utf8'),
  readJson(`data/review-quality/${movieId}-automated.json`),
  readJson(`data/source-records/${movieId}.json`),
  readJson(`data/editorial-briefs/${movieId}.json`),
  readJson('config/editorial-model.json'),
]);
assertEditorialProviderReady(config);
const preservedEntities = [
  movieId,
  ...(source.actress ?? []),
  brief.local_creative_brief?.core_source_concept,
  ...(brief.title_signals ?? []).map((item) => item.value ?? item),
  ...Object.values(brief.topic_elements ?? {}).flat(),
];
const request = buildLocalRepairRequest({movieId, markdown, report, preservedEntities});
const candidateDirectory = resolve(root, '.cc18-canary');
const nonce = `${process.pid}-${Date.now()}`;
const candidateReviewPath = resolve(candidateDirectory, `repair-${movieId}-${nonce}.md`);
const candidateQualityPath = resolve(candidateDirectory, `repair-${movieId}-${nonce}.json`);
await mkdir(candidateDirectory, {recursive: true});
let repaired = null;
let repairedQuality = null;
let repairedQualityText = null;
let lastRepairError = null;
for (let repairAttempt = 1; repairAttempt <= 3; repairAttempt += 1) {
  const generation = await requestStructuredEditorial({
    apiKey: editorialApiKey(config),
    config: {...config, max_output_tokens: Math.min(Number(config.max_output_tokens ?? 7000), 3500)},
    schema: localRepairSchemaFor(movieId),
    instructions: '你是繁體中文影評的局部修稿編輯。只改寫指定 target，直接陳述判斷，並將 preserve 及請求中可追溯的來源設定、題材與成人詞彙自然寫成有實質資訊的完整文字。replacement 必須是完整且非空的替換文字，長度至少保留原文七成。保留 preserve 中的每個字串、原本資訊與選片結論。每個 replacement 都必須清除「不是 A，而是 B」「不在 A，而在 B」「真正的重點」「真正的看點」「比較聰明的地方」等公式化翻轉，不得以近似句型重述；直接說出 B 及其具體理由。若 constraints 包含 abstract_editorial_vocabulary_overuse，terms 會列出過量詞彙；所有 replacement 合計最多保留一次各該詞，其餘改用具體動作、段落功能或同義表達。若 target 是 Markdown 標題，replacement 必須保留相同的 # 層級並改寫標題文字。若 target 是正文，不得增加新標題或拆成多段。不得新增作品事實、幕後流程或方法說明；若沒有影片證據，不得虛構情節、場景、鏡位、聲音、剪輯、演技、表情或觀看結果。每個 target 必須回傳一個 patch，paragraph 與 original_sha256 原樣照抄。',
    input: {...request, repair_attempt: repairAttempt, previous_attempt_error: lastRepairError?.message ?? null},
  });
  await appendEditorialUsage({
    root,
    movieId,
    rewriteAttempt: Number(brief.rewrite_attempt ?? 0),
    usage: {...generation.usage, operation: 'local_repair', repair_attempt: repairAttempt},
  });
  const response = parseFirstJsonObject(generation.text);
  console.log(JSON.stringify({
    event: 'local_repair_provider_shape',
    repair_attempt: repairAttempt,
    response_movie_id: response.movie_id ?? null,
    patch_count: response.patches?.length ?? 0,
    replacement_lengths: (response.patches ?? []).map(({replacement}) => String(replacement ?? '').length),
  }));
  try {
    repaired = applyLocalRepair({movieId, markdown, request, response});
    await writeFile(candidateReviewPath, repaired, 'utf8');
    const qa = spawnSync(process.execPath, [
      resolve(root, 'scripts/editorial/qa-draft.mjs'),
      movieId,
      `--review=${candidateReviewPath}`,
      `--report=${candidateQualityPath}`,
    ], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    });
    repairedQualityText = await readFile(candidateQualityPath, 'utf8');
    repairedQuality = JSON.parse(repairedQualityText);
    console.log(JSON.stringify({
      event: 'local_repair_candidate_qa',
      repair_attempt: repairAttempt,
      status: repairedQuality.status,
      issues: repairedQuality.issues,
      repair_issues: repairedQuality.repair_issues,
    }));
    if (qa.status === 0) break;
    lastRepairError = new Error(`${movieId}: candidate QA ${repairedQuality.status}; issues=${[
      ...(repairedQuality.issues ?? []),
      ...(repairedQuality.repair_issues ?? []),
    ].join(',')}`);
    repaired = null;
    repairedQuality = null;
    repairedQualityText = null;
    if (repairAttempt === 3) throw lastRepairError;
  } catch (error) {
    lastRepairError = error;
    const retryable = /empty|removed too much|lost preserved entity|exactly one patch|identity mismatch|candidate QA/.test(error.message);
    if (!retryable || repairAttempt === 3) {
      await Promise.allSettled([unlink(candidateReviewPath), unlink(candidateQualityPath)]);
      throw error;
    }
  }
}
if (!repaired || !repairedQuality || !repairedQualityText) {
  await Promise.allSettled([unlink(candidateReviewPath), unlink(candidateQualityPath)]);
  throw lastRepairError ?? new Error(`${movieId}: local repair did not pass isolated QA; original draft was not changed`);
}
await Promise.all([writeFile(reviewPath, repaired, 'utf8'), writeFile(qualityPath, repairedQualityText, 'utf8')]);
await Promise.allSettled([unlink(candidateReviewPath), unlink(candidateQualityPath)]);
console.log(JSON.stringify({movie_id: movieId, status: repairedQuality.status, repaired_paragraphs: request.targets.map(({paragraph}) => paragraph)}, null, 2));
