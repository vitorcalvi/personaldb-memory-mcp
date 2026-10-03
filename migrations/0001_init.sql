PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  device_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(user_id, id),
  FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS records_user_type_updated_idx
  ON records(user_id, record_type, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS records_user_updated_idx
  ON records(user_id, updated_at, id);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  vector_id TEXT,
  vector_status TEXT NOT NULL DEFAULT 'absent',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, id),
  UNIQUE(user_id, record_id, chunk_index),
  FOREIGN KEY(user_id, record_id) REFERENCES records(user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS chunks_user_record_idx ON chunks(user_id, record_id);
CREATE INDEX IF NOT EXISTS chunks_user_vector_idx ON chunks(user_id, vector_id);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  user_id UNINDEXED,
  record_id UNINDEXED,
  record_type UNINDEXED,
  content,
  content='chunks_fts_source',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

-- A projection table keeps the FTS external-content layout simple and D1-compatible.
CREATE TABLE IF NOT EXISTS chunks_fts_source (
  rowid INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  content TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts_source(rowid, user_id, record_id, record_type, content)
  VALUES (new.rowid, new.user_id, new.record_id,
    (SELECT record_type FROM records WHERE user_id = new.user_id AND id = new.record_id),
    new.content);
  INSERT INTO chunks_fts(rowid, user_id, record_id, record_type, content)
  SELECT rowid, user_id, record_id, record_type, content FROM chunks_fts_source WHERE rowid = new.rowid;
END;

CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, user_id, record_id, record_type, content)
  SELECT 'delete', rowid, user_id, record_id, record_type, content FROM chunks_fts_source WHERE rowid = old.rowid;
  DELETE FROM chunks_fts_source WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE OF content ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, user_id, record_id, record_type, content)
  SELECT 'delete', rowid, user_id, record_id, record_type, content FROM chunks_fts_source WHERE rowid = old.rowid;
  UPDATE chunks_fts_source SET content = new.content WHERE rowid = old.rowid;
  INSERT INTO chunks_fts(rowid, user_id, record_id, record_type, content)
  SELECT rowid, user_id, record_id, record_type, content FROM chunks_fts_source WHERE rowid = new.rowid;
END;

CREATE TABLE IF NOT EXISTS sync_state (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  cursor TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, device_id),
  FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tombstones (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  version INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY(user_id, id),
  FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tombstones_user_deleted_idx
  ON tombstones(user_id, deleted_at, id);
