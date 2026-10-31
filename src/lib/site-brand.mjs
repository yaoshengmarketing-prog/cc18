export const SITE_NAME = 'JAV 影格';

// Callers provide the page subject; the shared layout owns the brand affix.
export function formatPageTitle(subject, {brandFirst = false} = {}) {
  const bare = String(subject)
    .trim()
    .replace(/^(?:(?:CC18 影格|JAV 影格)\s*｜\s*)+/u, '')
    .replace(/(?:\s*｜\s*(?:CC18 影格|JAV 影格))+$/u, '')
    .trim();
  return brandFirst ? `${SITE_NAME}｜${bare}` : `${bare}｜${SITE_NAME}`;
}
