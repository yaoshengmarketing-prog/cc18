import {SITE_NAME} from '../../../src/lib/site-brand.mjs';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function compactText(value, maximum = 42) {
  const text = clean(value);
  if (text.length <= maximum) return text;
  return `${text.slice(0, Math.max(1, maximum - 1)).replace(/[，。；、：！？,.!?;:]$/u, '')}…`;
}

export function buildVerticalReviewProps({movieId, source, editorial, search, manifest, taxonomy, baseUrl}) {
  const labels = new Map((taxonomy?.tags ?? []).map(({id, label}) => [id, label]));
  const actresses = source?.actress ?? source?.actresses ?? editorial?.source_trace?.actress ?? [];
  const performer = Array.isArray(actresses) ? actresses.filter(Boolean).join(' × ') : clean(actresses);
  const tagIds = [...(editorial?.canonical_tag_ids ?? []), ...(editorial?.taxonomy_alignment ?? []).filter(({fit}) => fit === 'strong').map(({id}) => id)];
  const tags = [...new Set(tagIds.map((id) => labels.get(id) ?? id).filter(Boolean))].slice(0, 4);
  const presentation = (search?.quick_decision?.presentation ?? []).filter((value) => value && !performer.includes(value));
  for (const value of presentation) if (tags.length < 3 && !tags.includes(value)) tags.push(value);
  const hero = manifest?.assets?.find(({role}) => role === 'article_hero')?.path;
  const vertical = manifest?.assets?.find(({role}) => role === 'vertical_scene')?.path;
  if (!hero || !vertical) throw Object.assign(new Error(`${movieId}: image manifest is incomplete`), {code: 'VIDEO_IMAGES_NOT_READY'});
  const absolute = (path) => path.startsWith('http') ? path : new URL(path, `${baseUrl.replace(/\/$/, '')}/`).toString();
  const hook = clean(editorial?.social_title).replace(new RegExp(`^${movieId}\\s*[｜|:：—-]*\\s*`, 'i'), '') || search?.quick_decision?.thesis || editorial?.selected_thesis || editorial?.editorial_angle;
  const reviewLine = editorial?.editorial_brief?.value_proposition ?? editorial?.short_review ?? editorial?.selected_thesis;
  if (!clean(hook) || !clean(reviewLine)) throw Object.assign(new Error(`${movieId}: editorial text is insufficient for video props`), {code: 'VIDEO_EDITORIAL_NOT_READY'});
  return {
    id: movieId,
    actress: compactText(performer || '新作企劃', 24),
    hook: compactText(hook, 38),
    reviewLine: compactText(reviewLine, 44),
    tags: tags.slice(0, 4),
    imageOne: absolute(vertical),
    imageTwo: absolute(hero),
    siteName: SITE_NAME,
  };
}
