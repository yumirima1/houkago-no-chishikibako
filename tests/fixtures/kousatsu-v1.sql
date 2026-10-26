-- Historical schema v1, captured before document versioning was introduced.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  feed_url TEXT NOT NULL UNIQUE,
  content_policy TEXT NOT NULL DEFAULT 'metadata-and-feed-summary',
  enabled INTEGER NOT NULL DEFAULT 1,
  etag TEXT,
  last_modified TEXT,
  last_fetched_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fetch_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  http_status INTEGER,
  response_hash TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  new_item_count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  external_id TEXT,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  author TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  content_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_source_published
  ON items(source_id, published_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS item_search USING fts5(
  item_id UNINDEXED,
  title,
  summary,
  content,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS items_after_insert
AFTER INSERT ON items BEGIN
  INSERT INTO item_search(item_id, title, summary, content)
  VALUES (new.id, new.title, coalesce(new.summary, ''), coalesce(new.content, ''));
END;

CREATE TRIGGER IF NOT EXISTS items_after_update
AFTER UPDATE ON items BEGIN
  DELETE FROM item_search WHERE item_id = old.id;
  INSERT INTO item_search(item_id, title, summary, content)
  VALUES (new.id, new.title, coalesce(new.summary, ''), coalesce(new.content, ''));
END;

CREATE TRIGGER IF NOT EXISTS items_after_delete
AFTER DELETE ON items BEGIN
  DELETE FROM item_search WHERE item_id = old.id;
END;

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  classification TEXT NOT NULL CHECK(classification IN (
    'confirmed_fact', 'source_claim', 'inference', 'opinion',
    'hypothesis', 'unverified', 'contradiction'
  )),
  confidence REAL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(item_id, text)
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  excerpt TEXT NOT NULL,
  locator TEXT NOT NULL,
  stance TEXT NOT NULL CHECK(stance IN ('supports', 'contradicts')),
  created_at TEXT NOT NULL,
  UNIQUE(claim_id, item_id, locator, stance)
);

CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  from_item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  to_item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  score REAL NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(from_item_id, to_item_id, relation_type),
  CHECK(from_item_id < to_item_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  current_stage TEXT,
  input_json TEXT NOT NULL,
  output_json TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  last_error TEXT,
  retryable INTEGER NOT NULL DEFAULT 1,
  provider TEXT,
  model TEXT,
  estimated_cost REAL NOT NULL DEFAULT 0,
  actual_cost REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_updated
  ON jobs(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS job_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT,
  UNIQUE(job_id, attempt)
);

CREATE TABLE IF NOT EXISTS checkpoints (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(job_id, stage)
);

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  summary TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hypotheses (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  rationale TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unverified',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL,
  markdown TEXT NOT NULL,
  output_path TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS article_claims (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE RESTRICT,
  section TEXT NOT NULL,
  PRIMARY KEY(article_id, claim_id, section)
);

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  issues_json TEXT NOT NULL,
  report_json TEXT NOT NULL,
  verifier TEXT NOT NULL,
  created_at TEXT NOT NULL
);
