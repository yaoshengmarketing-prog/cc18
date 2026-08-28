import test from 'node:test';
import assert from 'node:assert/strict';
import {
  editorialContentAssessment,
  editorialContentIssues,
  hasReaderFacingProductionMeta,
  sitewideOriginalityAssessment,
  sitewideOriginalityIssues,
  sourceOnlyGroundingIssues,
} from '../scripts/editorial/lib/qa-rules.mjs';

test('source-only QA allows creative audiovisual commentary but still requires a source-specific title concept', () => {
  const issues = sourceOnlyGroundingIssues({
    body: '文章宣稱近距離鏡位與呼吸節奏帶來沉浸感。',
    titleSignals: ['測試演員', '高畫質'],
    actresses: ['測試演員'],
  });
  assert.deepEqual(issues, ['missing_source_specific_title_concept']);
});

test('content QA requires source adult vocabulary in both title strategy and prose', () => {
  assert.deepEqual(editorialContentIssues({
    body: '文章只有節奏、反差與氣氛，沒有回答實際題材。',
    titleSignals: ['測試演員', '高畫質'],
    topicElements: {identity: ['人妻'], action: ['中出']},
  }), ['body_lacks_source_adult_vocabulary', 'title_lacks_primary_source_adult_topic']);
  assert.deepEqual(editorialContentIssues({
    body: '人妻設定與中出題材在這部作品裡互相支撐，適合重視關係設定的觀眾。',
    titleSignals: ['測試演員', '人妻'],
    topicElements: {identity: ['人妻'], action: ['中出']},
  }), []);
  assert.deepEqual(editorialContentIssues({
    titles: ['TEST-001 露出慾望的學生設定'],
    body: '露出慾望決定被觀看的場景；露出慾望也讓學生妹與中出題材產生因果。',
    titleSignals: ['露出慾望', '學生設定'],
    topicElements: {identity: ['學生妹'], action: ['中出']},
    coreSourceConcept: '露出慾望',
  }), []);
});

test('content QA rejects repeated generic arcs instead of banning the vocabulary entirely', () => {
  assert.deepEqual(editorialContentIssues({
    body: '主導權轉移是第一段的結論；後面又把主導權轉移當作唯一結論。',
    titleSignals: [], topicElements: {},
  }), ['overused_generic_editorial_arc']);
});

test('content QA rejects a review that repeatedly avoids making a judgment', () => {
  assert.deepEqual(editorialContentIssues({
    body: '這部若成立會有層次，後段有機會形成轉折，整體有機會適合某些觀眾。',
    titleSignals: [], topicElements: {},
  }), ['overused_conditional_review_voice']);
  assert.deepEqual(editorialContentIssues({
    body: '開場有沒有建立角色關係？中段有沒有形成變化？結論有沒有回答選片問題？本文逐段給出明確判斷。',
    titleSignals: [], topicElements: {},
  }), []);
  assert.deepEqual(editorialContentIssues({
    body: '這部作品的層次成立，油壓按摩明確帶動前後節奏。',
    titleSignals: [], topicElements: {},
  }), []);
});

test('content QA rejects production meta language and repeated machine-like pivots', () => {
  assert.equal(hasReaderFacingProductionMeta('以 source_only 條件整理'), true);
  assert.equal(hasReaderFacingProductionMeta('直接分析作品的角色與題材'), false);
  assert.deepEqual(editorialContentIssues({
    body: '這篇內容由 AI 自動生成，並依照內部規則整理。',
    titleSignals: [], topicElements: {},
  }), ['reader_facing_production_meta']);
  assert.deepEqual(editorialContentIssues({
    body: '以 source-only 的條件來看，這部作品的題材很集中。',
    titleSignals: [], topicElements: {},
  }), ['reader_facing_production_meta']);
  assert.deepEqual(editorialContentIssues({
    body: '真正的重點不在於場景，而在於人物。比較聰明的地方是題材集中。',
    titleSignals: [], topicElements: {},
  }), ['formulaic_machine_voice']);
  assert.deepEqual(editorialContentIssues({
    body: '成品最聰明的地方是把人物留在畫面中央。另一個聰明的地方在於場景集中。',
    titleSignals: [], topicElements: {},
  }), ['formulaic_machine_voice']);
});

test('content QA rejects excessive abstract editorial vocabulary', () => {
  assert.deepEqual(editorialContentIssues({
    body: '層次層次層次層次層次層次',
    titleSignals: [], topicElements: {},
  }), ['abstract_editorial_vocabulary_overuse']);
});

test('content QA separates blocking errors, local repairs, and non-blocking notes', () => {
  const blocked = editorialContentAssessment({
    body: '這篇文章由 AI 生成。',
    titleSignals: [], topicElements: {},
  });
  assert.deepEqual(blocked.blockingIssues, ['reader_facing_production_meta']);
  assert.deepEqual(blocked.repairIssues, []);

  const repair = editorialContentAssessment({
    body: '真正的重點不在於場景，而在於人物。比較聰明的地方是題材集中。',
    titleSignals: [], topicElements: {},
  });
  assert.deepEqual(repair.blockingIssues, []);
  assert.deepEqual(repair.repairIssues, ['formulaic_machine_voice']);
  assert.equal(repair.findings[0].locations.length, 1);
  assert.match(repair.findings[0].locations[0].excerpt, /真正的重點/);

  const noted = editorialContentAssessment({
    body: '這不是一般的安排，而是把人物關係放在同一個空間裡處理。',
    titleSignals: [], topicElements: {},
  });
  assert.deepEqual(noted.blockingIssues, []);
  assert.deepEqual(noted.repairIssues, []);
  assert.deepEqual(noted.notes, ['formulaic_pivot_observed']);
});

test('formulaic contrast in a heading requires local repair even when used once', () => {
  const assessment = editorialContentAssessment({
    body: '## 3p・4p 的關鍵不在場面大，而在主角能否留下畫面中心\n\n正文直接說明多人配置如何影響角色。',
    titleSignals: [], topicElements: {},
  });
  assert.deepEqual(assessment.repairIssues, ['formulaic_heading_voice']);
  assert.equal(assessment.findings[0].locations[0].paragraph, 1);
});

test('formulaic language across more than one third of paragraphs requires full rewrite', () => {
  const assessment = editorialContentAssessment({
    body: [
      '## 第一段不是看場面，而是看人物',
      '這段正文提供具體說明。',
      '## 第二段的關鍵不在速度，而在反應',
      '這段正文也提供具體說明。',
      '## 第三段不是補充，而是最後判斷',
      '第三段正文提供另一個具體說明。',
    ].join('\n\n'),
    titleSignals: [], topicElements: {},
  });
  assert.deepEqual(assessment.blockingIssues, ['broad_formulaic_voice']);
  assert.deepEqual(assessment.repairIssues, []);
});

test('content QA requires the source-title core in a title and develops it beyond one mention', () => {
  assert.deepEqual(editorialContentIssues({
    titles: ['TEST-001 學生妹中出'],
    body: '本文只在這裡提到一次露出慾望，後面全部改談角色覺醒。',
    titleSignals: [], topicElements: {}, coreSourceConcept: '露出慾望',
  }), ['title_lacks_source_core_concept', 'source_core_concept_not_developed']);
  assert.deepEqual(editorialContentIssues({
    titles: ['TEST-001 露出慾望如何改變場景設計'],
    body: '露出慾望先決定場景風險；後段再分析露出慾望如何改變人物選擇。',
    titleSignals: [], topicElements: {}, coreSourceConcept: '露出慾望',
  }), []);
});

test('source-only QA accepts creative audiovisual commentary with a traceable topic concept', () => {
  const issues = sourceOnlyGroundingIssues({
    body: '公開簡介把課程設計成一日挑戰，近距離鏡位與停頓被寫成情緒推進。',
    titleSignals: ['要結愛', '弓道少女', '一日特訓'],
    actresses: ['要結愛'],
  });
  assert.deepEqual(issues, []);
});

test('sitewide originality rejects a reused agency-shift thesis and exact reusable prose', () => {
  const issues = sitewideOriginalityIssues({
    selectedThesis: '角色先被安排進入企劃，最後接管整體節奏。',
    editorialAngle: '分析角色如何掌握場面。',
    body: '這是一句只屬於本作的分析。這也是選片時最需要接受的取捨與限制，而且不能套用到其他作品。',
    recentReviews: [{
      selectedThesis: '她從被引導到主導整個場面。',
      editorialAngle: '觀察主導權轉移。',
      body: '另一篇不同的內容。這也是選片時最需要接受的取捨與限制，而且不能套用到其他作品。',
    }],
  });
  assert.deepEqual(issues, ['reused_generic_thesis_family', 'sitewide_reused_sentences']);
  assert.deepEqual(sitewideOriginalityIssues({
    selectedThesis: '三次職業研修分別測試不同的表演規則。',
    editorialAngle: '比較三段課程的功能差異。',
    body: '這篇文章以三段課程的功能分工作為判斷。',
    recentReviews: [],
  }), []);
});

test('sitewide originality sends thesis-level and exact reuse back to full rewrite', () => {
  const assessment = sitewideOriginalityAssessment({
    selectedThesis: '角色被安排進入企劃，最後接管場面。',
    editorialAngle: '觀察主導權。',
    body: '這是一句足夠長而且與站內另一篇完全重複的評論內容。',
    recentReviews: [{
      selectedThesis: '她從被引導到主導整個場面。',
      editorialAngle: '主導權轉移。',
      body: '這是一句足夠長而且與站內另一篇完全重複的評論內容。',
    }],
  });
  assert.deepEqual(assessment.blockingIssues, ['reused_generic_thesis_family', 'sitewide_reused_sentences']);
  assert.deepEqual(assessment.repairIssues, []);
});
