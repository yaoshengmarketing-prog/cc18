import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const movieId = process.argv[2];
if (!movieId) throw new Error('Usage: node scripts/editorial/qa-draft.mjs <MOVIE-ID>');
const root = resolve(import.meta.dirname, '..', '..');
const markdown = await readFile(resolve(root, `content/reviews/${movieId}.md`), 'utf8');
const brief = JSON.parse(await readFile(resolve(root, `data/editorial-briefs/${movieId}.json`), 'utf8'));
const source = JSON.parse(await readFile(resolve(root, `data/source-records/${movieId}.json`), 'utf8'));

const issues = [];
const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').trim();
const scalar = (key) => frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.replace(/^['"]|['"]$/g, '') ?? '';
const list = (key) => {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*\\r?\\n((?:  - .+(?:\\r?\\n|$))*)`, 'm'));
  return match ? [...match[1].matchAll(/^  - (.+)$/gm)].map((item) => item[1].trim().replace(/^['"]|['"]$/g, '')) : [];
};

if (/CC18-DEMO|示範|placeholder/i.test(markdown)) issues.push('placeholder_text');
if (![scalar('title'), scalar('seoTitle'), scalar('socialTitle')].every((value) => value.includes(movieId))) issues.push('missing_movie_id_in_titles');
const sourceSignals = list('titleSignals');
if (sourceSignals.length < 2 || sourceSignals.length > 4) issues.push('invalid_title_signal_count');
if (sourceSignals.filter((value) => scalar('title').includes(value)).length < 2) issues.push('title_lacks_source_signals');
if (!sourceSignals.some((value) => scalar('socialTitle').includes(value))) issues.push('social_title_lacks_source_signal');
const searchableSource = [source.title, source.description, ...(source.actress ?? []), source.series].filter(Boolean).join('\n');
if (sourceSignals.some((value) => !searchableSource.includes(value))) issues.push('untraceable_title_signal');
if (!/分布式抽樣|代表性抽樣/.test(body)) issues.push('missing_method_disclosure');
if (!/適合|偏好|推薦/.test(body) || !/未必|不適合|取捨/.test(body)) issues.push('missing_decision_value');

const sentences = body.split(/[。！？!?]\s*/).map((item) => item.replace(/\s+/g, '')).filter((item) => item.length >= 16);
const counts = new Map();
for (const sentence of sentences) counts.set(sentence, (counts.get(sentence) ?? 0) + 1);
if ([...counts.values()].some((count) => count > 1)) issues.push('repeated_sentences');

const headings = [...body.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]);
if (headings.length < 6) issues.push('insufficient_sections');
if (new Set(headings).size !== headings.length) issues.push('duplicate_section_headings');
if ((brief.evidence ?? []).length < 5) issues.push('insufficient_evidence');
if ((brief.evidence ?? []).some((item) => item.basis !== 'public_source' && !(item.observation_refs ?? []).length)) issues.push('uncited_video_evidence');
if ((brief.evidence ?? []).some((item) => item.signal === movieId || item.supports?.length < 12)) issues.push('non_specific_evidence');
if (/對白設計|聲音品質|ASMR/.test(body) && brief.audio_transcription_status !== 'ready') issues.push('unsupported_audio_claim');
if (source.actress.length === 0 && /演員：|女優/.test(body)) issues.push('invented_performer_identity');

const report = {
  schema_version: 1,
  id: movieId,
  checked_at: new Date().toISOString(),
  passed: issues.length === 0,
  issues,
  metrics: {
    sections: headings.length,
    evidence_items: brief.evidence?.length ?? 0,
    distinct_video_windows: new Set((brief.evidence ?? []).flatMap((item) => item.observation_refs ?? [])).size,
    repeated_sentence_groups: [...counts.values()].filter((count) => count > 1).length,
  },
};
await writeFile(resolve(root, `data/review-quality/${movieId}-automated.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
