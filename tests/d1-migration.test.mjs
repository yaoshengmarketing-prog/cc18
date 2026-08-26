import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';

test('D1 migration creates the persistent discovery and lease tables', async () => {
  const sql = await readFile(new URL('../cloudflare/migrations/0001_pipeline_queue.sql', import.meta.url), 'utf8');
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(sql);
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name}) => name);
    assert.deepEqual(tables, ['discovery_runs', 'movies', 'pipeline_jobs', 'source_variants']);
    const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name").all().map(({name}) => name);
    assert.ok(indexes.includes('idx_jobs_claim'));
    assert.ok(indexes.includes('idx_movies_release_date'));
  } finally {
    database.close();
  }
});
