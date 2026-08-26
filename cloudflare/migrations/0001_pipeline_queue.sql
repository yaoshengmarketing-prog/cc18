PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS discovery_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  listing_urls_json TEXT NOT NULL,
  summary_json TEXT
);

CREATE TABLE IF NOT EXISTS movies (
  id TEXT PRIMARY KEY,
  release_date TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_uuid TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('eligible', 'upcoming', 'late_arrival', 'prelaunch_history', 'invalid_date')),
  metadata_status TEXT NOT NULL CHECK (metadata_status IN ('pending', 'partial', 'validated', 'quarantined', 'rejected')),
  source_json TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_movies_source_uuid ON movies(source_uuid);
CREATE INDEX IF NOT EXISTS idx_movies_release_date ON movies(release_date DESC);
CREATE INDEX IF NOT EXISTS idx_movies_classification ON movies(classification, release_date DESC);

CREATE TABLE IF NOT EXISTS source_variants (
  source_uuid TEXT PRIMARY KEY,
  movie_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_source_variants_movie ON source_variants(movie_id);

CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id TEXT PRIMARY KEY,
  movie_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('media_analysis', 'editorial', 'image', 'video', 'publish', 'retry_media')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'leased', 'retry', 'completed', 'blocked', 'failed', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 1,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  claimed_by TEXT,
  lease_expires_at TEXT,
  next_retry_at TEXT,
  last_error_code TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  discovery_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (discovery_run_id) REFERENCES discovery_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_claim ON pipeline_jobs(stage, status, next_retry_at, lease_expires_at, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_jobs_movie ON pipeline_jobs(movie_id, stage);
