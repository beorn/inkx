/**
 * Shared SQL schema for km-storage
 *
 * Used by both db.ts (disk mode) and store.ts (memory mode)
 * to ensure consistent table structure.
 */

export const SCHEMA = `
-- Core node table
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  parent_id TEXT,
  link_to TEXT,
  link_alias TEXT,
  parent_idx REAL DEFAULT 0,

  -- Filesystem
  fs_path TEXT,
  fs_ino INTEGER,
  fs_mtime INTEGER,  -- File modification time at last sync (milliseconds)

  -- Identity
  name TEXT,
  block_id TEXT,  -- On-demand stable block ID (^block-id)
  title TEXT,

  -- Markdown
  md_pos INTEGER,
  md_line INTEGER,
  md_slug TEXT,

  -- Task
  task_status TEXT,
  task_mark TEXT,
  assigned_to TEXT,
  due_date TEXT,
  scheduled_date TEXT,
  priority INTEGER,

  -- Content
  content TEXT,
  content_hash TEXT,

  -- Metadata
  data JSON DEFAULT '{}',
  created_at INTEGER,
  updated_at INTEGER,
  version TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_fs_path ON nodes(fs_path);
CREATE INDEX IF NOT EXISTS idx_nodes_fs_ino ON nodes(fs_ino);
CREATE INDEX IF NOT EXISTS idx_nodes_task_status ON nodes(task_status);
CREATE INDEX IF NOT EXISTS idx_nodes_assigned ON nodes(assigned_to);
CREATE INDEX IF NOT EXISTS idx_nodes_due ON nodes(due_date);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_block_id ON nodes(block_id);

-- Full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  id,
  content,
  content='nodes',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, id, content) VALUES('delete', old.rowid, old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, id, content) VALUES('delete', old.rowid, old.id, old.content);
  INSERT INTO nodes_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
END;

-- Event replay cursor
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Wikilinks (for bidirectional linking)
CREATE TABLE IF NOT EXISTS links (
  source_id TEXT NOT NULL,     -- Node containing the link
  target_name TEXT NOT NULL,   -- Target filename/slug (from [[target]])
  target_id TEXT,              -- Resolved target node ID (can be null if unresolved)
  section TEXT,                -- Optional section anchor (#section)
  block_id TEXT,               -- Optional block ID (^block)
  alias TEXT,                  -- Display alias (|alias)
  embedded INTEGER DEFAULT 0,  -- 1 if this is an embedding (![[...]]), 0 otherwise
  relationship TEXT,           -- Property name for property-based links (null for wikilinks)
  created_at INTEGER,
  PRIMARY KEY (source_id, target_name, section, block_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target_name ON links(target_name);
CREATE INDEX IF NOT EXISTS idx_links_target_id ON links(target_id);
`

/**
 * Set of actual SQL column names on the nodes table.
 * Used to route non-column KNode fields (due_time, scheduled_time, etc.) to the data blob.
 */
export const NODE_COLUMNS = new Set([
  "id", "type", "parent_id", "link_to", "link_alias", "parent_idx",
  "fs_path", "fs_ino", "fs_mtime",
  "name", "block_id", "title",
  "md_pos", "md_line", "md_slug",
  "task_status", "task_mark", "assigned_to", "due_date", "scheduled_date", "priority",
  "content", "content_hash",
  "data", "created_at", "updated_at", "version",
])
