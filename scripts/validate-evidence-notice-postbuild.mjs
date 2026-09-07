import {readFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {load} from 'cheerio';
import {loadPublishedWorkEvidenceCatalog} from '../src/lib/movie-master.mjs';
import {resolveProjectRoot} from '../src/lib/project-root.mjs';

const root = resolveProjectRoot();
const dist = resolve(root, 'dist');
const {records} = await loadPublishedWorkEvidenceCatalog();
const expectedPublicText = '本文依來源標題、公開簡介與來源標籤整理，未使用影片抽樣。選片建議與解讀屬本站編輯整理，不等於來源事實或完整觀看結論。';
const oldPhrases = [
  '依公開作品資料整理',
  '尚未加入影片時間軸判讀',
  '完整影片內容請以原始作品頁為準',
  '本篇另參考',
  '個全片分布抽樣窗整理',
];
const forbiddenPublicEvidenceTokens = [
  'PUBLIC_METADATA',
  'DISTRIBUTED_SAMPLE',
  'SOURCE_TITLE_DESCRIPTION_TAGS',
  'DISTRIBUTED_VIDEO_SAMPLE',
  'article_evidence_level',
  'article_evidence_scope',
  'evidence_level',
  'evidence_scope',
  'evidence_id',
  'evidence_job_id',
  'evidence_status',
  'validation_status',
  'source_identity_hash',
  'source_snapshot_hash',
  'analysis_method',
  'distributed_sampling',
  'coverage_summary',
  'coverage_seconds',
  'distinct_windows',
  'confidence',
  'sha256:',
  ':distributed-sample:',
  'EVIDENCE SCOPE',
];
let publicMetadataCount = 0;
let distributedCount = 0;

for (const evidence of records) {
  const pathname = new URL(evidence.href, 'https://cc18.pages.dev').pathname;
  const htmlPath = resolve(dist, pathname.replace(/^\//u, ''), 'index.html');
  const html = await readFile(htmlPath, 'utf8');
  const $ = load(html);
  const notices = $('[data-evidence-notice]');
  if (notices.length !== 1) throw new Error(`${evidence.catalog_code}: expected exactly one Evidence notice`);
  const notice = notices.first();
  if (notice.find('.eyebrow').text().trim() !== '資料依據') throw new Error(`${evidence.catalog_code}: Evidence eyebrow mismatch`);
  if (notice.find('a[href="/method/"]').length !== 1) throw new Error(`${evidence.catalog_code}: Evidence method link missing`);
  if (oldPhrases.some((phrase) => html.includes(phrase))) throw new Error(`${evidence.catalog_code}: obsolete Search Content Evidence wording remains`);
  for (const token of forbiddenPublicEvidenceTokens) {
    if (html.includes(token)) throw new Error(`${evidence.catalog_code}: internal Evidence token leaked into public HTML: ${token}`);
  }

  if (evidence.evidence_level === 'PUBLIC_METADATA') {
    publicMetadataCount += 1;
    if (notice.find('h2').text().trim() !== '依據：公開來源資料') throw new Error(`${evidence.catalog_code}: public Evidence title mismatch`);
    if (notice.find('p').last().text().trim() !== expectedPublicText) throw new Error(`${evidence.catalog_code}: public Evidence copy mismatch`);
    if ($('.timeline-board').length !== 0) throw new Error(`${evidence.catalog_code}: PUBLIC_METADATA rendered a video timeline`);
  } else if (evidence.evidence_level === 'DISTRIBUTED_SAMPLE') {
    distributedCount += 1;
    const expectedText = `本文使用 ${evidence.sample_windows} 個分散抽樣窗；僅支持已引用窗口內的視覺觀察，不代表逐秒完整觀看，也不支持未轉錄音訊或抽樣窗口之間的完整順序。選片建議與解讀屬本站編輯整理。`;
    if (notice.find('h2').text().trim() !== '依據：分散影片抽樣') throw new Error(`${evidence.catalog_code}: distributed Evidence title mismatch`);
    if (notice.find('p').last().text().trim() !== expectedText) throw new Error(`${evidence.catalog_code}: distributed Evidence copy mismatch`);
    const timelineStops = $('.timeline-board .timeline-stop');
    if (timelineStops.length !== evidence.timeline.length) throw new Error(`${evidence.catalog_code}: Movie Master timeline count mismatch`);
    for (const item of evidence.timeline) {
      if (!html.includes(item.label) || !html.includes(item.summary)) throw new Error(`${evidence.catalog_code}: Movie Master timeline content missing`);
    }
  } else {
    throw new Error(`${evidence.catalog_code}: unsupported Evidence level ${evidence.evidence_level}`);
  }
}

if (publicMetadataCount + distributedCount !== records.length) throw new Error('Evidence distribution does not cover the public catalog');
const workDirectories = (await readdir(resolve(dist, 'works'), {withFileTypes: true})).filter((entry) => entry.isDirectory());
if (workDirectories.length !== records.length) throw new Error('Built work-page set differs from the Evidence catalog');

console.log(`Evidence notice postbuild valid: ${records.length} page(s), ${publicMetadataCount} PUBLIC_METADATA, ${distributedCount} DISTRIBUTED_SAMPLE.`);
