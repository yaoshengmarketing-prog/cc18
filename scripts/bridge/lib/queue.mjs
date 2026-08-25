import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';

const emptyQueue = () => ({schema_version: 1, updated_at: new Date().toISOString(), jobs: []});

export async function loadQueue(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyQueue();
    throw error;
  }
}

export async function saveQueue(path, queue) {
  await mkdir(dirname(path), {recursive: true});
  const value = {...queue, updated_at: new Date().toISOString()};
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600});
  await rename(temporary, path);
  return value;
}

export async function enqueue(path, input) {
  const queue = await loadQueue(path);
  const duplicate = queue.jobs.find((job) => job.movie_id === input.movie_id && !['failed', 'completed'].includes(job.status));
  if (duplicate) return duplicate;
  const job = {
    job_id: randomUUID(),
    movie_id: input.movie_id,
    source_url: input.source_url,
    status: 'pending',
    attempts: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  queue.jobs.push(job);
  await saveQueue(path, queue);
  return job;
}

export async function updateJob(path, jobId, patch) {
  const queue = await loadQueue(path);
  const job = queue.jobs.find((item) => item.job_id === jobId);
  if (!job) throw new Error(`Queue job not found: ${jobId}`);
  Object.assign(job, patch, {updated_at: new Date().toISOString()});
  await saveQueue(path, queue);
  return job;
}
