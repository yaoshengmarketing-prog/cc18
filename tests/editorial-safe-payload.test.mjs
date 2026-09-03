import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSafePublicSource, buildSafeVideoAnalysis, safeCanonicalTagIds} from '../scripts/editorial/lib/safe-editorial-payload.mjs';

test('editorial provider payload excludes raw descriptions, titles, tags, and visual prose', () => {
  const source = {
    id: 'TEST-001', release_date: '2026-08-26', actress: [], series: null,
    title: 'RAW_TITLE_SHOULD_NOT_LEAVE_DEVICE', description: 'RAW_DESCRIPTION_SHOULD_NOT_LEAVE_DEVICE',
    source_tags: ['角色扮演', 'HD', 'RAW_TAG_SHOULD_NOT_LEAVE_DEVICE'],
  };
  const safeSource = buildSafePublicSource(source);
  const safeVideo = buildSafeVideoAnalysis({
    source_duration_seconds: 120,
    coverage: {sample_windows: 1, average_confidence: 0.9},
    visual_observations: [{sample_index: 0, source_start_seconds: 10, setting: 'bedroom RAW_VISUAL', interaction_tone: 'playful RAW_VISUAL', camera_style: ['close-up RAW_VISUAL']}],
  });
  const payload = JSON.stringify({safeSource, safeVideo});
  for (const forbidden of ['RAW_TITLE', 'RAW_DESCRIPTION', 'RAW_TAG', 'RAW_VISUAL']) assert.equal(payload.includes(forbidden), false);
  assert.equal(safeSource.safe_title_signals.length, 2);
  assert.deepEqual(safeVideo.observations[0], {i: 0, at: 10, setting: '臥室型室內場景', tone: '輕鬆互動', camera: ['近距離鏡位']});
  assert.equal(safeCanonicalTagIds.includes('oral-sex'), false);
  assert.equal(safeCanonicalTagIds.includes('facial'), false);
});

test('common CC18 presentation variants provide safe title signals without raw prose', () => {
  const safeSource = buildSafePublicSource({
    id: 'TEST-002', release_date: '2026-08-26', actress: [], series: null,
    title: '不可外送標題', description: '不可外送簡介',
    source_tags: ['獨家限定', '全高清 (FHD)', '孕婦'],
  });
  assert.deepEqual(safeSource.safe_title_signals.map(({value}) => value), ['獨家配信', '高畫質', '孕婦設定']);
  assert.equal(JSON.stringify(safeSource).includes('不可外送'), false);
});

test('a source with no optional performer, series, or mapped tag remains usable', () => {
  const safeSource = buildSafePublicSource({
    id: 'TEST-003', release_date: '2026-09-03', actress: [], series: null,
    title: '僅有來源標題', description: '', source_tags: [],
  });
  assert.deepEqual(safeSource.safe_title_signals, []);
  assert.equal(safeSource.core_source_concept, null);
});
