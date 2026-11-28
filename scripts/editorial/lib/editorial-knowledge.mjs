import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Editorial knowledge base read by every writer run (hourly cc18-editorial and parallel lines).
// Only writing guidance; it never authorizes deleting, unpublishing or restructuring pages.
export const knowledgeFiles = ['seo/knowledge/common-mistakes.md', 'seo/knowledge/good-examples.md', 'seo/knowledge/web-sources.md'];

export const loadEditorialKnowledge = async (root, {maxChars = 12000} = {}) => {
  const parts = [];
  for (const path of knowledgeFiles) {
    try { parts.push(`<!-- ${path} -->\n${(await readFile(resolve(root, path), 'utf8')).trim()}`); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  if (!parts.length) return '';
  const text = `\n\n# 編輯知識庫（seo/knowledge，次於上方合約）\n\n${parts.join('\n\n')}`;
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…（知識庫已截斷，完整內容見 seo/knowledge/）` : text;
};