import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const clip = (value, maximum = 240) => String(value ?? '').trim().slice(0, maximum);
export const sourceSnapshotHash = (sourceRecordText) => (
  `sha256:${createHash('sha256').update(sourceRecordText).digest('hex')}`
);
const mode = (values, fallback) => {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
};

function timelineSummary(safeVideoAnalysis) {
  const observations = safeVideoAnalysis.observations ?? [];
  if (observations.length < 3) return [];
  const phases = [
    {phase: 'opening', label: '開端定位', start: 0, end: Math.ceil(observations.length / 3)},
    {phase: 'middle', label: '中段發展', start: Math.ceil(observations.length / 3), end: Math.ceil(observations.length * 2 / 3)},
    {phase: 'late', label: '後段收束', start: Math.ceil(observations.length * 2 / 3), end: observations.length},
  ];
  return phases.map(({phase, label, start, end}) => {
    const group = observations.slice(start, end);
    const setting = mode(group.map((item) => item.setting), '未分類場景');
    const tone = mode(group.map((item) => item.tone), '中性互動');
    const camera = mode(group.flatMap((item) => item.camera), '一般鏡位');
    const picks = [...new Set([group[0]?.i, group[Math.floor(group.length / 2)]?.i, group.at(-1)?.i])].filter(Number.isInteger);
    return {
      phase,
      label,
      summary: `${label}的代表性抽樣以${setting}為主，互動傾向${tone}，畫面多採${camera}；這是時間軸結構描述，不推測窗口之間的逐幕事件。`,
      evidence_windows: picks,
    };
  });
}

async function buildRecommendations({root, movieId, source, result, registry}) {
  const candidates = [];
  for (const record of registry.records ?? []) {
    if (record.id === movieId || record.review_status !== 'published') continue;
    let otherSource;
    let otherBrief;
    try {
      otherSource = JSON.parse(await readFile(resolve(root, `data/source-records/${record.id}.json`), 'utf8'));
    } catch {
      continue;
    }
    try {
      otherBrief = JSON.parse(await readFile(resolve(root, `data/editorial-briefs/${record.id}.json`), 'utf8'));
    } catch {
      otherBrief = null;
    }
    const samePerformers = (source.actress ?? []).filter((name) => (otherSource.actress ?? []).includes(name));
    const sameSeries = source.series && source.series === otherSource.series ? source.series : null;
    const sharedTags = (result.canonical_tag_ids ?? []).filter((id) => (otherBrief?.canonical_tag_ids ?? []).includes(id));
    if (!samePerformers.length && !sameSeries && !sharedTags.length) continue;
    const relationType = sameSeries ? 'same_series' : (samePerformers.length ? 'same_performer' : 'adjacent_theme');
    const sharedSignals = [...samePerformers, ...(sameSeries ? [sameSeries] : []), ...sharedTags].slice(0, 4);
    const contrastSignals = (otherBrief?.title_signals ?? []).map(({value}) => value).filter((value) => !sharedSignals.includes(value)).slice(0, 2);
    candidates.push({
      score: (sameSeries ? 5 : 0) + samePerformers.length * 4 + sharedTags.length,
      movie_id: record.id,
      relation_type: relationType,
      reason: sameSeries
        ? `同屬「${sameSeries}」系列，可用來比較相同公式在不同作品中的角色設定與推進差異。`
        : samePerformers.length
          ? `同樣由${samePerformers.join('、')}出演，可比較不同題材下的人物定位與呈現方式。`
          : `兩部共享${sharedTags.join('、')}等站內分類，適合延伸比較相近題材如何採用不同切角。`,
      shared_signals: sharedSignals,
      contrast_signals: contrastSignals.length ? contrastSignals : ['不同作品切角'],
    });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 3).map(({score, ...item}) => item);
}

export async function writeSearchContent({root, source, sourceRecordText, safeVideoAnalysis, result, analysis, registry}) {
  const guide = result.decision_guide ?? {};
  const signalValues = (result.title_signals ?? []).map(({value}) => value);
  const recommendations = await buildRecommendations({root, movieId: source.id, source, result, registry});
  const output = {
    schema_version: 1,
    movie_id: source.id,
    generated_at: new Date().toISOString(),
    source_snapshot_hash: sourceSnapshotHash(sourceRecordText),
    evidence_job_id: analysis.job_id ?? null,
    duration_seconds: safeVideoAnalysis.duration_seconds ?? null,
    sample_windows: safeVideoAnalysis.sample_windows ?? null,
    average_confidence: safeVideoAnalysis.average_confidence ?? null,
    quick_decision: {
      thesis: clip(guide.thesis ?? result.selected_thesis, 260),
      story_density: guide.story_density ?? 'unknown',
      pace: guide.pace ?? 'unknown',
      presentation: (guide.presentation ?? signalValues).map((value) => clip(value, 40)).filter(Boolean).slice(0, 4),
    },
    timeline_summary: timelineSummary(safeVideoAnalysis),
    audience_fit: {
      for: (guide.audience_for ?? []).map((value) => clip(value, 120)).filter(Boolean).slice(0, 4),
      not_for: (guide.audience_not_for ?? []).map((value) => clip(value, 120)).filter(Boolean).slice(0, 4),
    },
    recommendations,
    questions_answered: (guide.questions_answered ?? []).map((value) => clip(value, 120)).filter(Boolean).slice(0, 6),
  };
  await mkdir(resolve(root, 'data/search-content'), {recursive: true});
  const outputPath = resolve(root, `data/search-content/${source.id}.json`);
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  return {output, outputPath};
}
