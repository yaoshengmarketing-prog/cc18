import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performerDictionary, validatePerformerRelations, validateSeriesRelations} from '../build-movie-master.mjs';
import {assertCc18Url, parseWorkPage} from '../source/cc18-parser.mjs';

export function restoreSourceRelations({source, fresh, localization}) {
  // Only repair identities from the same source facts, never infer IDs from names.
  for (const key of ['id', 'title', 'release_date', 'actress', 'series']) {
    if (JSON.stringify(source[key] ?? null) !== JSON.stringify(fresh[key] ?? null)) {
      throw new Error(`${source.id}: refreshed source changed ${key}; editorial review required`);
    }
  }
  const repaired = {...source, source_relations: fresh.source_relations, fetched_at: fresh.fetched_at};
  validateSourceForPublication({movieId: source.id, source: repaired, localization});
  return repaired;
}

// Use the publisher's identity rules before any paid content or media generation.
export function validateSourceForPublication({movieId, source, localization}) {
  if (source?.id !== movieId) throw new Error(`${movieId}: source identity mismatch`);
  validatePerformerRelations({catalogCode: movieId, source, isPublished: true,
    localizations: performerDictionary(localization), usedPerformerIds: new Set()});
  validateSeriesRelations({catalogCode: movieId, source, isPublished: true, seriesNamesByStableId: new Map()});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const movieId = process.argv[2];
  const root = resolve(import.meta.dirname, '../..');
  try {
    if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId ?? '')) throw new Error('Expected an exact movie ID');
    const [source, localization] = await Promise.all([
      readFile(resolve(root, `data/source-records/${movieId}.json`), 'utf8').then(JSON.parse),
      readFile(resolve(root, 'data/localization/performers-zh-tw.json'), 'utf8').then(JSON.parse),
    ]);
    try {
      validateSourceForPublication({movieId, source, localization});
    } catch (error) {
      if (!process.argv.includes('--repair-source')) throw error;
      const url = assertCc18Url(source.source_url);
      const response = await fetch(url, {signal: AbortSignal.timeout(30_000)});
      if (!response.ok) throw new Error(`${movieId}: source refresh HTTP ${response.status}`);
      const fresh = parseWorkPage(await response.text(), url.href);
      const repaired = restoreSourceRelations({source, fresh, localization});
      await writeFile(resolve(root, `data/source-records/${movieId}.json`), `${JSON.stringify(repaired, null, 2)}\n`);
      console.log(JSON.stringify({event: 'source_relations_restored', movie_id: movieId}));
    }
    console.log(JSON.stringify({event: 'source_publish_preflight_passed', movie_id: movieId}));
  } catch (error) {
    console.error(JSON.stringify({event: 'source_publish_preflight_failed', movie_id: movieId, reason: error.message}));
    process.exitCode = 42;
  }
}
