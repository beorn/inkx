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
  fstype TEXT,
  parent_id TEXT,
  item INTEGER DEFAULT 0,
  embed_source TEXT,
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

  -- Item markers
  list_marker TEXT,
  task_marker TEXT,

  -- Task
  task_status TEXT,
  assigned_to TEXT,
  due_at TEXT,       -- ISO 8601: "2026-02-20" or "2026-02-20T14:00"
  start_at TEXT,     -- ISO 8601: same format as due_at
  due_date TEXT,     -- UNUSED: kept for backward compat with existing DBs
  scheduled_date TEXT, -- UNUSED: kept for backward compat with existing DBs
  priority TEXT,

  -- Content
  content TEXT,
  content_hash TEXT,

  -- Parse state
  parsed INTEGER DEFAULT 0,  -- 1 after first successful parse (prevents double-parse)

  -- Metadata
  data JSON DEFAULT '{}',
  created_at INTEGER,
  updated_at INTEGER,
  version TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nodes_parent_order ON nodes(parent_id, parent_idx);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_fs_path ON nodes(fs_path);
CREATE INDEX IF NOT EXISTS idx_nodes_fs_ino ON nodes(fs_ino);
CREATE INDEX IF NOT EXISTS idx_nodes_fstype ON nodes(fstype);
CREATE INDEX IF NOT EXISTS idx_nodes_type_item ON nodes(type, item);
CREATE INDEX IF NOT EXISTS idx_nodes_task_status ON nodes(task_status);
CREATE INDEX IF NOT EXISTS idx_nodes_assigned ON nodes(assigned_to);
CREATE INDEX IF NOT EXISTS idx_nodes_due_at ON nodes(due_at);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_block_id ON nodes(block_id);

-- Full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  id,
  content,
  content='nodes',
  content_rowid='rowid',
  prefix='2,3,4'
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
  created_at INTEGER
);

-- Unique constraint using COALESCE to handle NULLs (SQLite treats NULL != NULL in PRIMARY KEY,
-- which caused duplicate rows for simple wikilinks where section/block_id/relationship are NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_links_unique
  ON links(source_id, target_name, COALESCE(section, ''), COALESCE(block_id, ''), COALESCE(relationship, ''));

CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target_name ON links(target_name);
CREATE INDEX IF NOT EXISTS idx_links_target_id ON links(target_id);
`

/**
 * Migrate existing databases to add new columns.
 * Safe to run multiple times — uses IF NOT EXISTS / try-catch for idempotency.
 */
export function migrateSchema(db: import("bun:sqlite").Database): void {
  // Skip if nodes table doesn't exist yet (fresh database)
  const columns = db.query("PRAGMA table_info(nodes)").all() as { name: string }[]
  if (columns.length === 0) return

  const columnNames = new Set(columns.map((c) => c.name))

  // Add missing columns (schema evolution)
  const missing = (col: string, type = "TEXT") => {
    if (!columnNames.has(col)) db.run(`ALTER TABLE nodes ADD COLUMN ${col} ${type}`)
  }
  missing("fstype")
  missing("due_at")
  missing("start_at")
  missing("item", "INTEGER DEFAULT 0")
  missing("embed_source")
  missing("parsed", "INTEGER DEFAULT 0")

  // kmast v2: convert old type values to trait-based model
  // oi → h + item:true, li → p + item:true, link → embed + embed_source from link_to
  const hasOldTypes = (
    db.query("SELECT COUNT(*) as cnt FROM nodes WHERE type IN ('oi', 'li', 'link')").get() as { cnt: number }
  ).cnt
  if (hasOldTypes > 0) {
    db.run("UPDATE nodes SET type = 'h', item = 1 WHERE type = 'oi'")
    db.run("UPDATE nodes SET type = 'p', item = 1 WHERE type = 'li'")
    // Copy link_to → embed_source. Old "link" type becomes "p" with embed_source.
    if (columnNames.has("link_to")) {
      db.run("UPDATE nodes SET type = 'p', embed_source = link_to WHERE type = 'link'")
    } else {
      db.run("UPDATE nodes SET type = 'p' WHERE type = 'link'")
    }
  }

  // Migrate priority from INTEGER to TEXT (P-string format)
  // SQLite stores the column type in PRAGMA but allows mixed types in columns.
  // Convert any remaining numeric priority values to P-strings.
  const colInfo = db.query("PRAGMA table_info(nodes)").all() as { name: string; type: string }[]
  const priorityCol = colInfo.find((c) => c.name === "priority")
  if (priorityCol) {
    // Convert numeric values (1-9) to P-strings ("P1"-"P9")
    db.run("UPDATE nodes SET priority = 'P' || priority WHERE priority IS NOT NULL AND typeof(priority) = 'integer'")
  }

  // Drop old single-column parent index (superseded by covering index)
  try {
    db.run("DROP INDEX IF EXISTS idx_nodes_parent")
  } catch {
    /* ignore */
  }

  // Migrate links table: replace NULL-unfriendly PRIMARY KEY with COALESCE-based UNIQUE index.
  // SQLite treats NULL != NULL in composite PRIMARY KEYs, so INSERT OR REPLACE didn't deduplicate
  // rows where section/block_id/relationship were NULL — causing duplicate link rows.
  migrateLinksTable(db)
}

/**
 * Migrate links table from NULL-unfriendly PRIMARY KEY to COALESCE-based UNIQUE index.
 *
 * The old schema had `PRIMARY KEY (source_id, target_name, section, block_id, relationship)`
 * but SQLite treats NULL != NULL in PRIMARY KEYs, so INSERT OR REPLACE couldn't deduplicate
 * rows where section/block_id/relationship were NULL. This recreates the table without the
 * composite PK, deduplicates existing data, and lets the SCHEMA's CREATE UNIQUE INDEX handle
 * future deduplication.
 */
function migrateLinksTable(db: import("bun:sqlite").Database): void {
  // Check if links table exists
  const linksExists = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='links'").get()
  if (!linksExists) return

  // Check if it still has the old PRIMARY KEY (by checking for our new unique index)
  const hasNewIndex = db.query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_links_unique'").get()
  if (hasNewIndex) return // Already migrated

  // Recreate with deduplication: keep the row with the latest created_at per unique key
  db.run("BEGIN IMMEDIATE")
  try {
    db.run("ALTER TABLE links RENAME TO links_old")

    // Create new table without PRIMARY KEY (the UNIQUE index in SCHEMA handles uniqueness)
    db.run(`
      CREATE TABLE links (
        source_id TEXT NOT NULL,
        target_name TEXT NOT NULL,
        target_id TEXT,
        section TEXT,
        block_id TEXT,
        alias TEXT,
        embedded INTEGER DEFAULT 0,
        relationship TEXT,
        created_at INTEGER
      )
    `)

    // Copy deduplicated data — keep the row with the latest created_at per unique key
    db.run(`
      INSERT INTO links (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
      SELECT source_id, target_name, target_id, section, block_id, alias, embedded, relationship, MAX(created_at)
      FROM links_old
      GROUP BY source_id, target_name, COALESCE(section, ''), COALESCE(block_id, ''), COALESCE(relationship, '')
    `)

    db.run("DROP TABLE links_old")
    db.run("COMMIT")
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }
}

/**
 * Set of actual SQL column names on the nodes table.
 * Used to route non-column KNode fields to the data blob.
 * Note: due_date/scheduled_date columns exist in DB but are no longer written or read.
 */
export const NODE_COLUMNS = new Set([
  "id",
  "type",
  "fstype",
  "parent_id",
  "item",
  "embed_source",
  "parent_idx",
  "fs_path",
  "fs_ino",
  "fs_mtime",
  "name",
  "block_id",
  "title",
  "md_pos",
  "md_line",
  "list_marker",
  "task_marker",
  "task_status",
  "assigned_to",
  "due_at",
  "start_at",
  "priority",
  "content",
  "content_hash",
  "parsed",
  "data",
  "created_at",
  "updated_at",
  "version",
])
