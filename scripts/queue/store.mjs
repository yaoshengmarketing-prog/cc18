import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

const isoNow = () => new Date().toISOString();
const emptyState = () => ({schema_version: 1, updated_at: null, runs: [], movies: [], jobs: []});
const normalizedId = (value) => value.trim().toUpperCase();
const jobKey = (movieId, stage) => `${normalizedId(movieId)}:${stage}:v1`;

async function atomicWrite(path, value) {
  await mkdir(dirname(path), {recursive: true});
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

export class FileQueueStore {
  constructor(path) {
    this.path = resolve(path);
  }

  async read() {
    try {
      return JSON.parse(await readFile(this.path, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyState();
      throw error;
    }
  }

  async save(state) {
    state.updated_at = isoNow();
    await atomicWrite(this.path, state);
  }

  async startRun({runId, startedAt, listingUrls}) {
    const state = await this.read();
    state.runs.push({id: runId, status: 'running', started_at: startedAt, finished_at: null, listing_urls: listingUrls, summary: null});
    await this.save(state);
  }

  async upsertDiscovery({record, classification, runId, priority}) {
    const state = await this.read();
    const id = normalizedId(record.id);
    const now = isoNow();
    let movie = state.movies.find((item) => item.id === id);
    const isNew = !movie;
    if (!movie) {
      movie = {
        id,
        release_date: record.release_date,
        source_url: record.source_url,
        source_uuid: new URL(record.source_url).searchParams.get('uuid'),
        first_seen_at: now,
        last_seen_at: now,
        classification,
        metadata_status: record.description ? 'validated' : 'partial',
        source_record: record,
      };
      state.movies.push(movie);
    } else {
      movie.last_seen_at = now;
      movie.source_url = record.source_url;
      movie.source_record = record;
    }

    let enqueued = false;
    if (classification === 'eligible') {
      const idempotencyKey = jobKey(id, 'media_analysis');
      if (!state.jobs.some((job) => job.idempotency_key === idempotencyKey)) {
        state.jobs.push({
          id: randomUUID(),
          movie_id: id,
          stage: 'media_analysis',
          status: 'queued',
          priority,
          attempt: 0,
          max_attempts: 5,
          claimed_by: null,
          lease_expires_at: null,
          next_retry_at: null,
          last_error_code: null,
          idempotency_key: idempotencyKey,
          discovery_run_id: runId,
          created_at: now,
          updated_at: now,
        });
        enqueued = true;
      }
    }
    await this.save(state);
    return {isNew, enqueued};
  }

  async finishRun({runId, finishedAt, status, summary}) {
    const state = await this.read();
    const run = state.runs.find((item) => item.id === runId);
    if (!run) throw new Error(`Unknown discovery run: ${runId}`);
    Object.assign(run, {finished_at: finishedAt, status, summary});
    await this.save(state);
  }

  async summary() {
    const state = await this.read();
    const jobsByStatus = Object.fromEntries([...new Set(state.jobs.map(({status}) => status))].sort().map((status) => [status, state.jobs.filter((job) => job.status === status).length]));
    return {movies: state.movies.length, jobs: state.jobs.length, jobs_by_status: jobsByStatus, last_run: state.runs.at(-1) ?? null};
  }

  async claim({stage, workerId, leaseSeconds = 900, now = new Date()}) {
    const state = await this.read();
    const nowIso = now.toISOString();
    const candidate = state.jobs
      .filter((job) => job.stage === stage && job.attempt < job.max_attempts)
      .filter((job) => job.status === 'queued' || job.status === 'retry' || (job.status === 'leased' && job.lease_expires_at <= nowIso))
      .filter((job) => !job.next_retry_at || job.next_retry_at <= nowIso)
      .sort((left, right) => right.priority - left.priority || left.created_at.localeCompare(right.created_at))[0];
    if (!candidate) return null;
    candidate.status = 'leased';
    candidate.claimed_by = workerId;
    candidate.lease_expires_at = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
    candidate.attempt += 1;
    candidate.updated_at = nowIso;
    await this.save(state);
    return structuredClone(candidate);
  }

  async finishJob({jobId, workerId, outcome, errorCode = null, retryAt = null, now = new Date()}) {
    if (!['completed', 'retry', 'failed'].includes(outcome)) throw new Error(`Invalid job outcome: ${outcome}`);
    const state = await this.read();
    const job = state.jobs.find((item) => item.id === jobId && item.status === 'leased' && item.claimed_by === workerId);
    if (!job) throw new Error(`Job is not leased by ${workerId}: ${jobId}`);
    const nowIso = now.toISOString();
    job.status = outcome;
    job.completed_at = outcome === 'completed' ? nowIso : null;
    job.next_retry_at = outcome === 'retry' ? retryAt : null;
    job.last_error_code = errorCode;
    job.claimed_by = null;
    job.lease_expires_at = null;
    job.updated_at = nowIso;
    await this.save(state);
    return structuredClone(job);
  }
}

export class D1RestQueueStore {
  constructor({accountId, databaseId, apiToken, fetchImpl = fetch}) {
    if (!accountId || !databaseId || !apiToken) throw new Error('D1 store requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID and CLOUDFLARE_API_TOKEN');
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
    this.apiToken = apiToken;
    this.fetch = fetchImpl;
  }

  async query(statements) {
    const payload = Array.isArray(statements) ? {batch: statements} : statements;
    const response = await this.fetch(this.endpoint, {
      method: 'POST',
      headers: {authorization: `Bearer ${this.apiToken}`, 'content-type': 'application/json'},
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || !body.success || body.errors?.length) throw new Error(`D1 query failed: ${body.errors?.map(({message}) => message).join('; ') || response.status}`);
    const results = body.result ?? [];
    const failed = results.find((result) => result.success === false);
    if (failed) throw new Error(`D1 statement failed: ${failed.error || 'unknown error'}`);
    return results;
  }

  async startRun({runId, startedAt, listingUrls}) {
    await this.query({sql: 'INSERT INTO discovery_runs (id, status, started_at, listing_urls_json) VALUES (?, ?, ?, ?)', params: [runId, 'running', startedAt, JSON.stringify(listingUrls)]});
  }

  async upsertDiscovery({record, classification, runId, priority}) {
    const now = isoNow();
    const sourceUuid = new URL(record.source_url).searchParams.get('uuid');
    const id = normalizedId(record.id);
    const key = jobKey(id, 'media_analysis');
    const results = await this.query([
      {
        sql: `INSERT INTO movies (id, release_date, source_url, source_uuid, first_seen_at, last_seen_at, classification, metadata_status, source_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET source_url=excluded.source_url, source_uuid=excluded.source_uuid, last_seen_at=excluded.last_seen_at, source_json=excluded.source_json
              RETURNING first_seen_at = ? AS is_new`,
        params: [id, record.release_date, record.source_url, sourceUuid, now, now, classification, record.description ? 'validated' : 'partial', JSON.stringify(record), now],
      },
      {
        sql: `INSERT INTO source_variants (movie_id, source_uuid, source_url, first_seen_at, last_seen_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(source_uuid) DO UPDATE SET movie_id=excluded.movie_id, source_url=excluded.source_url, last_seen_at=excluded.last_seen_at`,
        params: [id, sourceUuid, record.source_url, now, now],
      },
      ...(classification === 'eligible' ? [{
        sql: `INSERT INTO pipeline_jobs (id, movie_id, stage, status, priority, attempt, max_attempts, idempotency_key, discovery_run_id, created_at, updated_at)
              VALUES (?, ?, 'media_analysis', 'queued', ?, 0, 5, ?, ?, ?, ?)
              ON CONFLICT(idempotency_key) DO NOTHING`,
        params: [randomUUID(), id, priority, key, runId, now, now],
      }] : []),
    ]);
    return {isNew: Boolean(results[0]?.results?.[0]?.is_new), enqueued: classification === 'eligible' && (results[2]?.meta?.changes ?? 0) > 0};
  }

  async finishRun({runId, finishedAt, status, summary}) {
    await this.query({sql: 'UPDATE discovery_runs SET status=?, finished_at=?, summary_json=? WHERE id=?', params: [status, finishedAt, JSON.stringify(summary), runId]});
  }

  async summary() {
    const [movies, jobs, statuses, lastRun] = await this.query([
      {sql: 'SELECT COUNT(*) AS count FROM movies', params: []},
      {sql: 'SELECT COUNT(*) AS count FROM pipeline_jobs', params: []},
      {sql: 'SELECT status, COUNT(*) AS count FROM pipeline_jobs GROUP BY status ORDER BY status', params: []},
      {sql: 'SELECT * FROM discovery_runs ORDER BY started_at DESC LIMIT 1', params: []},
    ]);
    return {
      movies: movies.results?.[0]?.count ?? 0,
      jobs: jobs.results?.[0]?.count ?? 0,
      jobs_by_status: Object.fromEntries((statuses.results ?? []).map(({status, count}) => [status, count])),
      last_run: lastRun.results?.[0] ?? null,
    };
  }

  async claim({stage, workerId, leaseSeconds = 900, now = new Date()}) {
    const nowIso = now.toISOString();
    const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
    const [result] = await this.query({
      sql: `UPDATE pipeline_jobs
            SET status='leased', claimed_by=?, lease_expires_at=?, attempt=attempt+1, updated_at=?
            WHERE id=(
              SELECT id FROM pipeline_jobs
              WHERE stage=? AND attempt < max_attempts
                AND (status IN ('queued','retry') OR (status='leased' AND lease_expires_at <= ?))
                AND (next_retry_at IS NULL OR next_retry_at <= ?)
              ORDER BY priority DESC, created_at ASC LIMIT 1
            ) RETURNING *`,
      params: [workerId, leaseExpiresAt, nowIso, stage, nowIso, nowIso],
    });
    return result.results?.[0] ?? null;
  }

  async finishJob({jobId, workerId, outcome, errorCode = null, retryAt = null, now = new Date()}) {
    if (!['completed', 'retry', 'failed'].includes(outcome)) throw new Error(`Invalid job outcome: ${outcome}`);
    const nowIso = now.toISOString();
    const [result] = await this.query({
      sql: `UPDATE pipeline_jobs
            SET status=?, completed_at=?, next_retry_at=?, last_error_code=?, claimed_by=NULL, lease_expires_at=NULL, updated_at=?
            WHERE id=? AND status='leased' AND claimed_by=? RETURNING *`,
      params: [outcome, outcome === 'completed' ? nowIso : null, outcome === 'retry' ? retryAt : null, errorCode, nowIso, jobId, workerId],
    });
    const job = result.results?.[0];
    if (!job) throw new Error(`Job is not leased by ${workerId}: ${jobId}`);
    return job;
  }
}

export function queueStoreFromEnvironment({mode = 'file', filePath = 'data/pipeline-queue.json', fetchImpl} = {}) {
  if (mode === 'file') return new FileQueueStore(filePath);
  if (mode === 'd1') return new D1RestQueueStore({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    fetchImpl,
  });
  throw new Error(`Unknown queue store mode: ${mode}`);
}
