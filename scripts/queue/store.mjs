import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

const isoNow = () => new Date().toISOString();
const emptyState = () => ({schema_version: 1, updated_at: null, runs: [], movies: [], jobs: []});
const normalizedId = (value) => value.trim().toUpperCase();
const jobKey = (movieId, stage) => `${normalizedId(movieId)}:${stage}:v1`;
const mediaStage = (stage) => {
  if (!['image', 'video'].includes(stage)) throw new Error(`Invalid media stage: ${stage}`);
  return stage;
};
const isClaimable = (job, nowIso) => job && job.attempt < job.max_attempts
  && (job.status === 'queued' || job.status === 'retry' || (job.status === 'leased' && job.lease_expires_at <= nowIso))
  && (!job.next_retry_at || job.next_retry_at <= nowIso);

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

  async upsertDiscovery({record, classification, runId, priority, stages = ['media_analysis']}) {
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
      movie.release_date = record.release_date;
      movie.last_seen_at = now;
      movie.source_url = record.source_url;
      movie.source_uuid = new URL(record.source_url).searchParams.get('uuid');
      movie.classification = classification;
      movie.metadata_status = record.description ? 'validated' : 'partial';
      movie.source_record = record;
    }

    let enqueuedCount = 0;
    if (classification === 'eligible') {
      for (const stage of stages) {
        const idempotencyKey = jobKey(id, stage);
        if (state.jobs.some((job) => job.idempotency_key === idempotencyKey)) continue;
        state.jobs.push({
          id: randomUUID(),
          movie_id: id,
          stage,
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
        enqueuedCount += 1;
      }
    }
    await this.save(state);
    return {isNew, enqueued: enqueuedCount > 0, enqueued_count: enqueuedCount};
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

  async queueHealth({now = new Date()} = {}) {
    const state = await this.read();
    const nowIso = now.toISOString();
    const stale_leases = state.jobs.filter((job) => job.status === 'leased' && job.lease_expires_at && job.lease_expires_at <= nowIso);
    const ready_retries = state.jobs.filter((job) => job.status === 'retry' && (!job.next_retry_at || job.next_retry_at <= nowIso));
    return {checked_at: nowIso, stale_leases: structuredClone(stale_leases), ready_retries: structuredClone(ready_retries)};
  }

  async repairExpiredLeases({now = new Date()} = {}) {
    const state = await this.read();
    const nowIso = now.toISOString();
    const repaired = [];
    for (const job of state.jobs) {
      if (job.status !== 'leased' || !job.lease_expires_at || job.lease_expires_at > nowIso) continue;
      Object.assign(job, {status: 'retry', claimed_by: null, lease_expires_at: null, next_retry_at: null, last_error_code: 'LEASE_EXPIRED', updated_at: nowIso});
      repaired.push(structuredClone(job));
    }
    if (repaired.length) await this.save(state);
    return repaired;
  }

  async listCanaryCandidates({limit = 3, now = new Date(), excludeMovieIds = []} = {}) {
    const state = await this.read();
    const nowIso = now.toISOString();
    const excluded = new Set(excludeMovieIds.map(normalizedId));
    return state.jobs.filter((job) => job.stage === 'editorial')
      .map((editorial) => ({
        editorial,
        publish: state.jobs.find((job) => job.movie_id === editorial.movie_id && job.stage === 'publish'),
        movie: state.movies.find(({id}) => id === editorial.movie_id),
      }))
      .filter(({editorial}) => !excluded.has(editorial.movie_id))
      .filter(({movie}) => movie?.classification === 'eligible' && movie?.metadata_status === 'validated')
      .map(({editorial, publish, movie}) => {
        if (isClaimable(editorial, nowIso)) {
          return {job: editorial, movie, resume_rank: editorial.status === 'queued' && editorial.attempt === 0 ? 0 : 2};
        }
        if (editorial.status !== 'completed' || publish?.status === 'completed') return null;
        if (!publish || isClaimable(publish, nowIso)) return {job: editorial, movie, resume_rank: 1};
        if (publish.status === 'failed') return {job: editorial, movie, resume_rank: 2};
        return null;
      })
      .filter(Boolean)
      .sort((left, right) => left.resume_rank - right.resume_rank
        || String(right.movie.release_date).localeCompare(String(left.movie.release_date))
        || right.job.priority - left.job.priority
        || left.job.created_at.localeCompare(right.job.created_at))
      .slice(0, limit).map(({job, movie, resume_rank}) => structuredClone({...job, release_date: movie.release_date, metadata_status: movie.metadata_status, resume_rank}));
  }

  async getMovie(movieId) {
    const state = await this.read();
    return structuredClone(state.movies.find((item) => item.id === normalizedId(movieId)) ?? null);
  }

  async enqueueJob({movieId, stage, priority = 1, discoveryRunId = null, now = new Date()}) {
    const state = await this.read();
    const id = normalizedId(movieId);
    if (!state.movies.some((movie) => movie.id === id)) throw new Error(`Unknown movie: ${id}`);
    const idempotencyKey = jobKey(id, stage);
    const existing = state.jobs.find((job) => job.idempotency_key === idempotencyKey);
    if (existing) return structuredClone(existing);
    const nowIso = now.toISOString();
    const job = {
      id: randomUUID(), movie_id: id, stage, status: 'queued', priority, attempt: 0, max_attempts: 5,
      claimed_by: null, lease_expires_at: null, next_retry_at: null, last_error_code: null,
      idempotency_key: idempotencyKey, discovery_run_id: discoveryRunId, created_at: nowIso, updated_at: nowIso,
    };
    state.jobs.push(job);
    await this.save(state);
    return structuredClone(job);
  }

  async findJob({movieId, stage, status = null}) {
    const state = await this.read();
    return structuredClone(state.jobs.find((job) => job.movie_id === normalizedId(movieId) && job.stage === stage && (!status || job.status === status)) ?? null);
  }

  async claim({stage, workerId, jobId = null, leaseSeconds = 900, now = new Date()}) {
    const state = await this.read();
    const nowIso = now.toISOString();
    const candidate = state.jobs
      .filter((job) => job.stage === stage && (!jobId || job.id === jobId) && job.attempt < job.max_attempts)
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
    if (!['completed', 'retry', 'blocked', 'failed'].includes(outcome)) throw new Error(`Invalid job outcome: ${outcome}`);
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

  async renewLease({jobId, workerId, leaseSeconds = 900, now = new Date()}) {
    const state = await this.read();
    const job = state.jobs.find((item) => item.id === jobId && item.status === 'leased' && item.claimed_by === workerId);
    if (!job) throw new Error(`Job is not leased by ${workerId}: ${jobId}`);
    job.lease_expires_at = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
    job.updated_at = now.toISOString();
    await this.save(state);
    return structuredClone(job);
  }

  async requeueBlocked({jobId, allowedErrorCodes, now = new Date()}) {
    const state = await this.read();
    const job = state.jobs.find((item) => item.id === jobId && item.status === 'blocked' && allowedErrorCodes.includes(item.last_error_code));
    if (!job) return null;
    job.status = 'queued';
    job.next_retry_at = null;
    job.last_error_code = null;
    job.updated_at = now.toISOString();
    await this.save(state);
    return structuredClone(job);
  }

  async requeueRetry({jobId, allowedErrorCodes, now = new Date()}) {
    const state = await this.read();
    const job = state.jobs.find((item) => item.id === jobId && item.status === 'retry' && allowedErrorCodes.includes(item.last_error_code));
    if (!job) return null;
    job.status = 'queued';
    job.next_retry_at = null;
    job.last_error_code = null;
    job.updated_at = now.toISOString();
    await this.save(state);
    return structuredClone(job);
  }

  async requeueCompletedForUpdate({jobId, now = new Date()}) {
    const state = await this.read();
    const job = state.jobs.find((item) => item.id === jobId && item.status === 'completed');
    if (!job) return null;
    job.status = 'queued';
    job.attempt = 0;
    job.completed_at = null;
    job.next_retry_at = null;
    job.last_error_code = null;
    job.claimed_by = null;
    job.lease_expires_at = null;
    job.updated_at = now.toISOString();
    await this.save(state);
    return structuredClone(job);
  }

  async requeueFailedMedia({jobId, stage, now = new Date()}) {
    const expectedStage = mediaStage(stage);
    const state = await this.read();
    const job = state.jobs.find((item) => item.id === jobId && item.stage === expectedStage && item.status === 'failed');
    if (!job) return null;
    job.status = 'queued';
    job.attempt = 0;
    job.completed_at = null;
    job.next_retry_at = null;
    job.last_error_code = null;
    job.claimed_by = null;
    job.lease_expires_at = null;
    job.updated_at = now.toISOString();
    await this.save(state);
    return structuredClone(job);
  }

  async requeueFailedPublish({jobId, now = new Date()}) {
    const state = await this.read();
    const job = state.jobs.find((item) => item.id === jobId && item.stage === 'publish' && item.status === 'failed');
    if (!job) return null;
    job.status = 'queued';
    job.attempt = 0;
    job.completed_at = null;
    job.next_retry_at = null;
    job.last_error_code = null;
    job.claimed_by = null;
    job.lease_expires_at = null;
    job.updated_at = now.toISOString();
    await this.save(state);
    return structuredClone(job);
  }

  async completeBlockedAfterQa({jobId, allowedErrorCodes, now = new Date()}) {
    const state = await this.read();
    const job = state.jobs.find((item) => item.id === jobId && item.status === 'blocked' && allowedErrorCodes.includes(item.last_error_code));
    if (!job) return null;
    job.status = 'completed';
    job.completed_at = now.toISOString();
    job.next_retry_at = null;
    job.last_error_code = null;
    job.updated_at = now.toISOString();
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

  async upsertDiscovery({record, classification, runId, priority, stages = ['media_analysis']}) {
    const now = isoNow();
    const sourceUuid = new URL(record.source_url).searchParams.get('uuid');
    const id = normalizedId(record.id);
    const jobStatements = classification === 'eligible' ? stages.map((stage) => ({
      sql: `INSERT INTO pipeline_jobs (id, movie_id, stage, status, priority, attempt, max_attempts, idempotency_key, discovery_run_id, created_at, updated_at)
            VALUES (?, ?, ?, 'queued', ?, 0, 5, ?, ?, ?, ?)
            ON CONFLICT(idempotency_key) DO NOTHING`,
      params: [randomUUID(), id, stage, priority, jobKey(id, stage), runId, now, now],
    })) : [];
    const results = await this.query([
      {
        sql: `INSERT INTO movies (id, release_date, source_url, source_uuid, first_seen_at, last_seen_at, classification, metadata_status, source_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET release_date=excluded.release_date, source_url=excluded.source_url, source_uuid=excluded.source_uuid, last_seen_at=excluded.last_seen_at, classification=excluded.classification, metadata_status=excluded.metadata_status, source_json=excluded.source_json
              RETURNING first_seen_at = ? AS is_new`,
        params: [id, record.release_date, record.source_url, sourceUuid, now, now, classification, record.description ? 'validated' : 'partial', JSON.stringify(record), now],
      },
      {
        sql: `INSERT INTO source_variants (movie_id, source_uuid, source_url, first_seen_at, last_seen_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(source_uuid) DO UPDATE SET movie_id=excluded.movie_id, source_url=excluded.source_url, last_seen_at=excluded.last_seen_at`,
        params: [id, sourceUuid, record.source_url, now, now],
      },
      ...jobStatements,
    ]);
    const enqueuedCount = results.slice(2).reduce((sum, result) => sum + Number(result?.meta?.changes ?? 0), 0);
    return {isNew: Boolean(results[0]?.results?.[0]?.is_new), enqueued: enqueuedCount > 0, enqueued_count: enqueuedCount};
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

  async queueHealth({now = new Date()} = {}) {
    const nowIso = now.toISOString();
    const [stale, retries] = await this.query([
      {sql: `SELECT * FROM pipeline_jobs WHERE status='leased' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ? ORDER BY lease_expires_at`, params: [nowIso]},
      {sql: `SELECT * FROM pipeline_jobs WHERE status='retry' AND (next_retry_at IS NULL OR next_retry_at <= ?) ORDER BY updated_at`, params: [nowIso]},
    ]);
    return {checked_at: nowIso, stale_leases: stale.results ?? [], ready_retries: retries.results ?? []};
  }

  async repairExpiredLeases({now = new Date()} = {}) {
    const nowIso = now.toISOString();
    const [result] = await this.query({
      sql: `UPDATE pipeline_jobs SET status='retry', claimed_by=NULL, lease_expires_at=NULL, next_retry_at=NULL, last_error_code='LEASE_EXPIRED', updated_at=?
            WHERE status='leased' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ? RETURNING *`,
      params: [nowIso, nowIso],
    });
    return result.results ?? [];
  }

  async listCanaryCandidates({limit = 3, now = new Date(), excludeMovieIds = []} = {}) {
    const bounded = Math.max(1, Math.min(3, Number(limit) || 1));
    const nowIso = now.toISOString();
    const excluded = [...new Set(excludeMovieIds.map(normalizedId))];
    const exclusionClause = excluded.length
      ? ' AND NOT EXISTS (SELECT 1 FROM json_each(?) excluded WHERE excluded.value=e.movie_id)'
      : '';
    const [result] = await this.query({
      sql: `SELECT e.*, m.release_date, m.metadata_status,
              CASE
                WHEN e.status='queued' AND e.attempt=0 THEN 0
                WHEN e.status='completed' AND (p.id IS NULL OR p.status!='failed') THEN 1
                ELSE 2
              END AS resume_rank
            FROM pipeline_jobs e
            JOIN movies m ON m.id=e.movie_id
            LEFT JOIN pipeline_jobs p ON p.movie_id=e.movie_id AND p.stage='publish'
            WHERE e.stage='editorial'
              AND m.classification='eligible' AND m.metadata_status='validated'
              ${exclusionClause}
              AND (
                (e.attempt < e.max_attempts
                  AND (e.status IN ('queued','retry') OR (e.status='leased' AND e.lease_expires_at <= ?))
                  AND (e.next_retry_at IS NULL OR e.next_retry_at <= ?))
                OR
                (e.status='completed' AND (p.id IS NULL OR p.status='failed' OR (
                  p.attempt < p.max_attempts
                  AND (p.status IN ('queued','retry') OR (p.status='leased' AND p.lease_expires_at <= ?))
                  AND (p.next_retry_at IS NULL OR p.next_retry_at <= ?)
                )))
              )
            ORDER BY resume_rank ASC, m.release_date DESC, e.priority DESC, e.created_at ASC LIMIT ?`,
      params: [...(excluded.length ? [JSON.stringify(excluded)] : []), nowIso, nowIso, nowIso, nowIso, bounded],
    });
    return result.results ?? [];
  }

  async getMovie(movieId) {
    const [result] = await this.query({sql: 'SELECT * FROM movies WHERE id=? LIMIT 1', params: [normalizedId(movieId)]});
    return result.results?.[0] ?? null;
  }

  async enqueueJob({movieId, stage, priority = 1, discoveryRunId = null, now = new Date()}) {
    const nowIso = now.toISOString();
    const id = normalizedId(movieId);
    const key = jobKey(id, stage);
    const [result] = await this.query({
      sql: `INSERT INTO pipeline_jobs (id, movie_id, stage, status, priority, attempt, max_attempts, idempotency_key, discovery_run_id, created_at, updated_at)
            VALUES (?, ?, ?, 'queued', ?, 0, 5, ?, ?, ?, ?)
            ON CONFLICT(idempotency_key) DO UPDATE SET updated_at=pipeline_jobs.updated_at RETURNING *`,
      params: [randomUUID(), id, stage, priority, key, discoveryRunId, nowIso, nowIso],
    });
    return result.results?.[0] ?? null;
  }

  async findJob({movieId, stage, status = null}) {
    const params = [normalizedId(movieId), stage];
    const statusClause = status ? ' AND status=?' : '';
    if (status) params.push(status);
    const [result] = await this.query({sql: `SELECT * FROM pipeline_jobs WHERE movie_id=? AND stage=?${statusClause} ORDER BY created_at DESC LIMIT 1`, params});
    return result.results?.[0] ?? null;
  }

  async claim({stage, workerId, jobId = null, leaseSeconds = 900, now = new Date()}) {
    const nowIso = now.toISOString();
    const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
    const [result] = await this.query({
      sql: `UPDATE pipeline_jobs
            SET status='leased', claimed_by=?, lease_expires_at=?, attempt=attempt+1, updated_at=?
            WHERE id=(
              SELECT id FROM pipeline_jobs
              WHERE stage=? AND (? IS NULL OR id=?) AND attempt < max_attempts
                AND (status IN ('queued','retry') OR (status='leased' AND lease_expires_at <= ?))
                AND (next_retry_at IS NULL OR next_retry_at <= ?)
              ORDER BY priority DESC, created_at ASC LIMIT 1
            ) RETURNING *`,
      params: [workerId, leaseExpiresAt, nowIso, stage, jobId, jobId, nowIso, nowIso],
    });
    return result.results?.[0] ?? null;
  }

  async finishJob({jobId, workerId, outcome, errorCode = null, retryAt = null, now = new Date()}) {
    if (!['completed', 'retry', 'blocked', 'failed'].includes(outcome)) throw new Error(`Invalid job outcome: ${outcome}`);
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

  async renewLease({jobId, workerId, leaseSeconds = 900, now = new Date()}) {
    const nowIso = now.toISOString();
    const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
    const [result] = await this.query({
      sql: `UPDATE pipeline_jobs SET lease_expires_at=?, updated_at=?
            WHERE id=? AND status='leased' AND claimed_by=? RETURNING *`,
      params: [leaseExpiresAt, nowIso, jobId, workerId],
    });
    const job = result.results?.[0];
    if (!job) throw new Error(`Job is not leased by ${workerId}: ${jobId}`);
    return job;
  }

  async requeueBlocked({jobId, allowedErrorCodes, now = new Date()}) {
    if (!allowedErrorCodes?.length) throw new Error('requeueBlocked requires allowed error codes');
    const placeholders = allowedErrorCodes.map(() => '?').join(',');
    const [result] = await this.query({
      sql: `UPDATE pipeline_jobs SET status='queued', next_retry_at=NULL, last_error_code=NULL, updated_at=?
            WHERE id=? AND status='blocked' AND last_error_code IN (${placeholders}) RETURNING *`,
      params: [now.toISOString(), jobId, ...allowedErrorCodes],
    });
    return result.results?.[0] ?? null;
  }

  async requeueRetry({jobId, allowedErrorCodes, now = new Date()}) {
    if (!allowedErrorCodes?.length) throw new Error('requeueRetry requires allowed error codes');
    const placeholders = allowedErrorCodes.map(() => '?').join(',');
    const [result] = await this.query({
      sql: `UPDATE pipeline_jobs SET status='queued', next_retry_at=NULL, last_error_code=NULL, updated_at=?
            WHERE id=? AND status='retry' AND last_error_code IN (${placeholders}) RETURNING *`,
      params: [now.toISOString(), jobId, ...allowedErrorCodes],
    });
    return result.results?.[0] ?? null;
  }

  async requeueCompletedForUpdate({jobId, now = new Date()}) {
    const nowIso = now.toISOString();
    const [result] = await this.query({
      sql: `UPDATE pipeline_jobs
            SET status='queued', attempt=0, completed_at=NULL, next_retry_at=NULL, last_error_code=NULL,
                claimed_by=NULL, lease_expires_at=NULL, updated_at=?
            WHERE id=? AND status='completed' RETURNING *`,
      params: [nowIso, jobId],
    });
    return result.results?.[0] ?? null;
  }

  async requeueFailedMedia({jobId, stage, now = new Date()}) {
    const expectedStage = mediaStage(stage);
    const nowIso = now.toISOString();
    const [result] = await this.query({
      sql: `UPDATE pipeline_jobs
            SET status='queued', attempt=0, completed_at=NULL, next_retry_at=NULL, last_error_code=NULL,
                claimed_by=NULL, lease_expires_at=NULL, updated_at=?
            WHERE id=? AND stage=? AND status='failed' RETURNING *`,
      params: [nowIso, jobId, expectedStage],
    });
    return result.results?.[0] ?? null;
  }

  async requeueFailedPublish({jobId, now = new Date()}) {
    const nowIso = now.toISOString();
    const [result] = await this.query({
      sql: `UPDATE pipeline_jobs
            SET status='queued', attempt=0, completed_at=NULL, next_retry_at=NULL, last_error_code=NULL,
                claimed_by=NULL, lease_expires_at=NULL, updated_at=?
            WHERE id=? AND stage='publish' AND status='failed' RETURNING *`,
      params: [nowIso, jobId],
    });
    return result.results?.[0] ?? null;
  }

  async completeBlockedAfterQa({jobId, allowedErrorCodes, now = new Date()}) {
    if (!allowedErrorCodes?.length) throw new Error('completeBlockedAfterQa requires allowed error codes');
    const placeholders = allowedErrorCodes.map(() => '?').join(',');
    const [result] = await this.query({
      sql: `UPDATE pipeline_jobs SET status='completed', completed_at=?, next_retry_at=NULL, last_error_code=NULL, updated_at=?
            WHERE id=? AND status='blocked' AND last_error_code IN (${placeholders}) RETURNING *`,
      params: [now.toISOString(), now.toISOString(), jobId, ...allowedErrorCodes],
    });
    return result.results?.[0] ?? null;
  }
}

export function queueStoreFromEnvironment({mode = 'file', filePath = 'data/pipeline-queue.json', fetchImpl} = {}) {
  if (mode === 'file') return new FileQueueStore(filePath);
  if (mode === 'd1') {
    const localBridgeEnvironment = resolve(import.meta.dirname, '..', '..', '.dev.vars.bridge');
    if (existsSync(localBridgeEnvironment)) process.loadEnvFile(localBridgeEnvironment);
    return new D1RestQueueStore({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      fetchImpl,
    });
  }
  throw new Error(`Unknown queue store mode: ${mode}`);
}
