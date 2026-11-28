import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {excludedIds} from '../src/lib/exclusions.mjs';

const ids = [...excludedIds()].sort();
await writeFile(resolve(import.meta.dirname, '../functions/exclusion-ids.js'),
  `// Generated from data/editorial-exclusions/*.json. Do not edit.\nexport const excludedIds = new Set(${JSON.stringify(ids)});\n`);
