import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {autoExclusionDecision} from '../scripts/editorial/lib/selection-gate.mjs';
import {gateClaimedEditorial} from '../scripts/editorial/lib/auto-gate.mjs';
import {approvedExampleIds, loadEditorialKnowledge} from '../scripts/editorial/lib/editorial-knowledge.mjs';

for (const sentence of ['女子高生の物語', '她是高中生。', '中學生的女兒', '小學生的日常', '未成年的少女', '小女孩']) {
  test(`direct role triggers: ${sentence}`, () => {
    assert.equal(autoExclusionDecision({description: sentence}).excluded, true);
  });
}

for (const sentence of ['JK打扮', '制服', '學生', '女學生', '大學生', '轉學生', '義妹', '阿姨', '蘿莉', '嬌小', '美少女',
  '打扮成高中生', '高中制服角色扮演', '高中時代的同學重逢', '本作品中沒有未滿18歲的出演者', '她不再是小女孩', '膽小女孩']) {
  test(`non-role does not trigger: ${sentence}`, () => {
    assert.equal(autoExclusionDecision({description: sentence}).excluded, false);
  });
}

test('only source title and description are considered', () => {
  assert.equal(autoExclusionDecision({title: '一般作品', description: '成年角色', tags: ['女子校生'], series: '小學生'}).excluded, false);
});

test('excluded claim writes review evidence, cancels job, then permits next claim', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc18-auto-gate-'));
  const jobs = [{id: 'a', movie_id: 'TEST-001'}, {id: 'b', movie_id: 'TEST-002'}];
  const calls = [];
  const store = {finishJob: async (args) => { calls.push(args); return args; }};
  const writer = async (id) => calls.push({writer: id});
  try {
    for (const job of jobs) {
      const source = job.id === 'a' ? {title: '她是高中生。', description: ''} : {title: '成年角色', description: ''};
      const result = await gateClaimedEditorial({root, source, movieId: job.movie_id, job, workerId: 'test', store,
        checkpoint: async () => calls.push({checkpoint: job.movie_id}), date: new Date('2026-11-28T12:00:00Z')});
      if (result.excluded) continue;
      await writer(job.movie_id);
      break;
    }
    assert.deepEqual(calls.map((item) => item.checkpoint ?? item.outcome ?? item.writer), ['TEST-001', 'cancelled', 'TEST-002']);
    assert.equal(calls[1].errorCode, 'auto_excluded_minor_role');
    const exclusion = JSON.parse(await readFile(join(root, 'data/editorial-exclusions/TEST-001.json'), 'utf8'));
    assert.equal(exclusion.trigger_sentence, '她是高中生。');
    assert.match(await readFile(join(root, 'data/editorial-exclusions/auto-review.md'), 'utf8'), /TEST-001｜高中生｜她是高中生。｜待每週人工複核/);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('an existing exclusion cancels a claim without appending another review line', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc18-existing-gate-'));
  const directory = join(root, 'data/editorial-exclusions');
  const calls = [];
  try {
    await mkdir(directory, {recursive: true});
    await writeFile(join(directory, 'TEST-003.json'), '{}\n');
    const result = await gateClaimedEditorial({root, source: {title: '一般作品'}, movieId: 'TEST-003',
      job: {id: 'c'}, workerId: 'test', store: {finishJob: async (args) => calls.push(args)},
      checkpoint: async () => { throw new Error('existing exclusion needs no new checkpoint'); }});
    assert.equal(result.excluded, true);
    assert.equal(result.existing, true);
    assert.equal(calls[0].outcome, 'cancelled');
    await assert.rejects(readFile(join(directory, 'auto-review.md'), 'utf8'), {code: 'ENOENT'});
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('knowledge loader is tolerant of absent files and example IDs prefer knowledge list', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc18-knowledge-'));
  try {
    assert.equal(await loadEditorialKnowledge(root), '');
    assert.deepEqual(approvedExampleIds('### seo/knowledge/good-examples.md\nSNOS-290 ROYD-362 SNOS-401'),
      ['SNOS-290', 'ROYD-362', 'SNOS-401']);
    const runner = await readFile(new URL('../scripts/editorial/local-codex-run.mjs', import.meta.url), 'utf8');
    assert.match(runner, /開工回饋知識庫：\\n\$\{knowledge\}/u);
  } finally { await rm(root, {recursive: true, force: true}); }
});
