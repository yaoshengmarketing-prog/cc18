import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceSnapshotHash, writeSearchContent} from '../scripts/editorial/lib/search-content.mjs';
import './search-content-source-hash.test.mjs';

test('builds a bounded search decision layer from safe observations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc18-search-'));
  try {
    await mkdir(join(root, 'data/source-records'), {recursive: true});
    await mkdir(join(root, 'data/editorial-briefs'), {recursive: true});
    const otherSource = {id: 'TEST-002', actress: ['測試演員'], series: null};
    await writeFile(join(root, 'data/source-records/TEST-002.json'), JSON.stringify(otherSource));
    await writeFile(join(root, 'data/editorial-briefs/TEST-002.json'), JSON.stringify({canonical_tag_ids: ['story'], title_signals: [{value: '另一切角'}]}));
    const source = {id: 'TEST-001', actress: ['測試演員'], series: null};
    const sourceRecordText = `${JSON.stringify(source, null, 2)}\n`;
    const safeVideoAnalysis = {
      duration_seconds: 3600,
      sample_windows: 6,
      average_confidence: 0.9,
      observations: Array.from({length: 6}, (_, i) => ({i, setting: '一般室內場景', tone: i < 3 ? '中性互動' : '溫和親近', camera: ['近距離鏡位']})),
    };
    const result = {
      selected_thesis: '這是一段足以協助讀者判斷作品定位的測試核心判斷。',
      title_signals: [{value: '室內互動'}, {value: '近距離'}],
      canonical_tag_ids: ['story'],
      decision_guide: {
        thesis: '室內互動與近距離呈現共同構成作品的主要選片理由。',
        story_density: 'medium',
        pace: 'balanced',
        presentation: ['室內互動', '近距離鏡位'],
        audience_for: ['偏好室內人物互動的觀眾', '重視近距離呈現的觀眾'],
        audience_not_for: ['偏好多場景快速切換的觀眾', '只依知名系列選片的觀眾'],
        questions_answered: ['作品的核心定位是什麼？', '呈現方式有什麼特色？', '適合哪些觀眾？'],
      },
    };
    const {outputPath, output} = await writeSearchContent({
      root,
      source,
      sourceRecordText,
      safeVideoAnalysis,
      result,
      analysis: {job_id: 'job-1'},
      registry: {records: [{id: 'TEST-002', review_status: 'published'}]},
    });
    assert.equal(output.timeline_summary.length, 3);
    assert.deepEqual(output.timeline_summary.map(({phase}) => phase), ['opening', 'middle', 'late']);
    assert.equal(output.recommendations[0].movie_id, 'TEST-002');
    assert.equal(output.recommendations[0].relation_type, 'same_performer');
    assert.equal(output.source_snapshot_hash, sourceSnapshotHash(sourceRecordText));
    assert.doesNotMatch(JSON.stringify(output), /raw visual prose/i);
    assert.equal(JSON.parse(await readFile(outputPath, 'utf8')).movie_id, 'TEST-001');
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
