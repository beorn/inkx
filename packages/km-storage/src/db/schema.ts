/**
 * Shared SQL schema for km-storage
 *
 * Used by both db.ts (disk mode) and store.ts (memory mode)
 * to ensure consistent table structure.
 */

/**
 * Schema version — bump when the FTS table layout or tokenizer changes, or
 * when any other irreversible schema change needs re-running on existing DBs.
 * `migrateSchema()` reads `meta.schema_version`; if it's absent or older than
 * this constant, the appropriate migration steps run and the value is updated.
 *
 * History:
 *   1 — Baseline (pre-versioning). Applied automatically on first open of a
 *       DB that has no schema_version row.
 *   2 — nodes_fts: add name + title columns, unicode61 tokenchars '@#+['.
 *       Requires dropping nodes_fts (and its triggers) and repopulating from
 *       nodes — CREATE VIRTUAL TABLE IF NOT EXISTS won't update an existing
 *       virtual table's column set or tokenizer.
 *   3 — nodes_fts: tokenchars swap from '@#+[' to '@#+~'. `[` is not a sigil
 *       (it's the task-filter and wikilink delimiter), so indexing it was a
 *       mistake. `~` replaces it as a legitimate identity sigil. Same
 *       drop-and-rebuild path as v2 — the tokenizer change is irreversible
 *       on an existing virtual table.
 *   4 — links: flipped from the 9-column legacy schema (source_id,
 *       target_name, target_id, section, block_id, alias, embedded,
 *       relationship, created_at) to the canonical 3-column schema
 *       (host_id, href, rel). Resolution happens at runtime via the name
 *       index; `href` carries the parsed target locator. See
 *       docs/design/model/klink.md. Migration drops the old table; DATA_VERSION=2
 *       rebuilds rows from re-parsing content.
 *   5 — nodes: add fs_dev + fs_size + fs_content_hash columns for the
 *       inode-primary reconciliation cascade (hub/km/storage-architecture.md
 *       §3.2). fs_dev pairs with fs_ino to guard against cross-device inode
 *       collision; fs_size + mtime support the watcher fast-path (§7.4);
 *       fs_content_hash is the secondary reconciliation signal (§3.3). All
 *       three are additive / nullable — existing rows stay valid until the
 *       reconciler fills them in on the next scan.
 */
export const SCHEMA_VERSION = 5

/**
 * Data version — bump when application-logic changes invalidate derived data
 * in existing rows (computed node.name, materialized titles, link resolution).
 * Unlike SCHEMA_VERSION (which runs ALTER TABLE / DDL), DATA_VERSION triggers
 * a full state.db rebuild from the source .md files — safe because state.db
 * is a rebuildable cache.
 *
 * History:
 *   1 — normalizeNodeName: heading names now preserve @/+/# sigils (previously
 *       slugified, stripping them). Rebuild to re-derive all heading names.
 *       Also: deferred-stub re-queue fix (rebuild-different-titles).
 *   2 — links schema flipped to 3 columns (host_id, href, rel). Old
 *       (source_id, target_name, target_id, section, block_id, alias,
 *       embedded, relationship, created_at) rows are dropped by the
 *       SCHEMA_VERSION=4 migration; DATA_VERSION=2 triggers a full rebuild
 *       from .md files so `href` rows are re-derived from the content.
 */
export const DATA_VERSION = 2

export const SCHEMA = `
-- Core node table
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  fstype TEXT,
  parent_id TEXT,
  item INTEGER DEFAULT 0,
  embed_of TEXT,
  parent_idx REAL DEFAULT 0,

  -- Filesystem
  fs_path TEXT,
  fs_dev INTEGER,    -- Device id; pairs with fs_ino for the inode reconciliation signal (§3.2)
  fs_ino INTEGER,
  fs_mtime INTEGER,  -- File modification time at last sync (milliseconds)
  fs_size INTEGER,   -- File size in bytes; watcher fast-path with mtime (§7.4)
  fs_content_hash TEXT,  -- SHA-256 of file bytes; lazy secondary reconciliation signal (§3.3)

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
-- Composite (fs_dev, fs_ino) — primary reconciliation signal (§3.2).
-- Cross-device inode collisions would misattribute without fs_dev.
CREATE INDEX IF NOT EXISTS idx_nodes_fs_dev_ino ON nodes(fs_dev, fs_ino);
CREATE INDEX IF NOT EXISTS idx_nodes_fstype ON nodes(fstype);
CREATE INDEX IF NOT EXISTS idx_nodes_type_item ON nodes(type, item);
CREATE INDEX IF NOT EXISTS idx_nodes_task_status ON nodes(task_status);
CREATE INDEX IF NOT EXISTS idx_nodes_assigned ON nodes(assigned_to);
CREATE INDEX IF NOT EXISTS idx_nodes_due_at ON nodes(due_at);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_block_id ON nodes(block_id);

-- Full-text search
-- unicode61 tokenchars keeps @#+~ as part of tokens so sigil queries like
-- "@next", "#urgent", "+taxes", "~home" survive tokenization. This is required
-- for the Omnibox to resolve sigil-prefixed files/tags at the index level.
--
-- Note: "[" is NOT in the tokenchars set. It's the task-filter bracket
-- ("[x]", "[ ]", etc.) and the wikilink delimiter ("[[...]]") — the query
-- parser strips it before the token hits FTS.
--
-- Columns: id + name + title + content. Indexing name/title lets us find files
-- by literal filename or heading title (e.g. a file named "@next.md" with empty
-- body). If you add/remove columns here or change the tokenizer, bump
-- SCHEMA_VERSION below — existing DBs need the migration path.
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  id,
  name,
  title,
  content,
  content='nodes',
  content_rowid='rowid',
  prefix='2,3,4',
  tokenize='unicode61 tokenchars ''@#+~'''
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, id, name, title, content)
  VALUES (new.rowid, new.id, new.name, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, id, name, title, content)
  VALUES('delete', old.rowid, old.id, old.name, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, id, name, title, content)
  VALUES('delete', old.rowid, old.id, old.name, old.title, old.content);
  INSERT INTO nodes_fts(rowid, id, name, title, content)
  VALUES (new.rowid, new.id, new.name, new.title, new.content);
END;

-- Event replay cursor
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Links cache (occurrence index over KLink inline AST data).
-- 3-column canonical shape per docs/design/model/klink.md.
--   host_id : the node that hosts this link occurrence
--   href    : canonical, parsed target locator (km:Note, km:Note#Section,
--             #Section for self-refs, https://…, mailto:…). Encoded via
--             normalizeLinkHref() — every write goes through it.
--   rel     : 'link' | 'embed' (closed enum for v1)
-- Resolution happens at runtime via the name index (Map<name, nodeId[]>).
--
-- The design's embed invariant ("a node with embed_of set must have exactly
-- one rel=embed row") is enforced at write time by buildEmbedChild + the
-- create/update handlers, not at the DB layer. A plain paragraph that
-- happens to contain multiple embed wikilinks is NOT an embed node (it has
-- no embed_of), and those occurrences legitimately share a host.
CREATE TABLE IF NOT EXISTS links (
  host_id TEXT NOT NULL,
  href    TEXT NOT NULL,
  rel     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_links_host_id ON links(host_id);
CREATE INDEX IF NOT EXISTS idx_links_href    ON links(href);
CREATE INDEX IF NOT EXISTS idx_links_rel     ON links(rel);

-- Sync state: content-hash baseline for bidirectional sync
-- Tracks what we last projected (wrote) or observed (read) for each file path.
-- Used to detect external vs own changes without relying on in-memory tokens alone.
CREATE TABLE IF NOT EXISTS sync_state (
  fs_path TEXT PRIMARY KEY,
  node_id TEXT,
  baseline_hash TEXT NOT NULL,
  baseline_kind TEXT NOT NULL DEFAULT 'projected',  -- 'projected' | 'observed'
  last_seen_mtime_ns INTEGER,
  dirty INTEGER NOT NULL DEFAULT 0
);

-- Collapsed-file link edges.
--
-- Files matched by collapseParse.patterns stay as opaque stubs (no children
-- parsed into the nodes tree), but we still want their outgoing links to
-- appear as backlinks on their targets. This table caches a lightweight
-- regex extraction of link edges for each collapsed file.
--
-- Columns mirror the canonical links table so the backlink query can
-- UNION over both without schema-specific branching:
--   host_id : the collapsed files node id (same role as in links)
--   href    : canonical, parsed target locator (km:Note, #Section, https URL)
--   rel     : link | embed
--
-- Additional fields carry enough context for future UI (see snippet back-nav
-- from a target to a collapsed source):
--   target_path    : authored target text (before normalize)
--   target_heading : section anchor or caret blockid, without the hash
--   link_text      : display text (alias, anchor text)
--   link_type      : wiki | md | mention | tag -- which notation
--   source_offset  : byte offset into the file content
--   created_at     : insertion timestamp (ms)
--
-- Invalidation: delete-then-insert per host_id (same protocol as links).
--   - File mtime changed during reconciliation -> re-extract.
--   - File promoted out of collapse-parse (parseStubFile) -> DELETE rows so
--     the parsed-node links table becomes the sole edge source.
CREATE TABLE IF NOT EXISTS collapsed_file_links (
  host_id        TEXT NOT NULL,
  href           TEXT NOT NULL,
  rel            TEXT NOT NULL,
  target_path    TEXT NOT NULL,
  target_heading TEXT,
  link_text      TEXT,
  link_type      TEXT NOT NULL,
  source_offset  INTEGER,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cfl_host ON collapsed_file_links(host_id);
CREATE INDEX IF NOT EXISTS idx_cfl_href ON collapsed_file_links(href);

-- Collapsed-file referenced anchors (inbound).
--
-- Complement to collapsed_file_links (which tracks OUTBOUND edges from a
-- collapsed file). This table caches the set of anchors INSIDE collapsed
-- files that are referenced BY other files — e.g. when doc-Y contains
-- [[chat-X#turn-5]], we record (file_id=chat-X, anchor="turn-5",
-- source_offset=<byte>) here so clicking the link can scroll chat-X to the
-- right position without fully parsing the file.
--
-- Pruning: only anchors that are ACTUALLY referenced from somewhere are
-- recorded. A collapsed file with 200 headings but only 3 inbound refs
-- produces 3 rows, not 200. This keeps the table proportional to the
-- backlink graph, not the heading graph.
--
-- Columns:
--   id            : surrogate primary key (AUTOINCREMENT).
--   file_id       : the collapsed file's node id (the TARGET of the refs).
--   anchor        : the anchor text as it appears in the href fragment
--                   (e.g. "Plans", "^abc123"). Matched against the
--                   fragment extracted from inbound link hrefs.
--   source_offset : byte offset of the anchor in the file content. Used by
--                   the UI to show a snippet or scroll-to-position.
--   heading_level : 1-6 for ATX headings; NULL for block refs.
--   ref_count     : number of inbound references pointing at this anchor
--                   at the time the row was last recorded. Incremental
--                   updates adjust this; a GC pass can delete rows where
--                   ref_count drops to 0 (deferred to a later session).
--   created_at    : insertion timestamp (ms).
--
-- Invalidation: delete-then-insert per file_id on file-content change (the
-- anchor SET inside the file may have changed). When a file is promoted
-- out of collapse-parse, DELETE rows so the parsed-node lookup becomes the
-- sole source of anchor resolution for that file.
--
-- See km-storage.collapsed-file-anchors and docs/design/model/klink.md.
CREATE TABLE IF NOT EXISTS referenced_anchors (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id        TEXT NOT NULL,
  anchor         TEXT NOT NULL,
  source_offset  INTEGER NOT NULL,
  heading_level  INTEGER,
  ref_count      INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ra_file_anchor ON referenced_anchors(file_id, anchor);
CREATE INDEX IF NOT EXISTS idx_ra_file ON referenced_anchors(file_id);
`

/**
 * Result of a migration pass. `ftsDropped` means the v1 `nodes_fts` was
 * dropped and the caller must rerun SCHEMA (to recreate it with the new
 * layout) and then call `rebuildFtsIndex` to repopulate from `nodes`.
 */
export interface MigrateResult {
  ftsDropped: boolean
}

/**
 * Migrate existing databases to add new columns.
 * Safe to run multiple times — uses IF NOT EXISTS / try-catch for idempotency.
 *
 * Returns a MigrateResult the caller inspects to decide whether to rebuild
 * the FTS index. This avoids paying a full rebuild cost on every DB open.
 */
export function migrateSchema(db: import("bun:sqlite").Database): MigrateResult {
  // Skip if nodes table doesn't exist yet (fresh database) — no FTS to drop.
  const columns = db.query("PRAGMA table_info(nodes)").all() as { name: string }[]
  if (columns.length === 0) return { ftsDropped: false }

  // Fast-path: when `meta` exists AND records the current schema_version, the
  // DB has already been through every migration below, so we can skip the
  // O(N) scans. The hasOldTypes `COUNT(*) ... WHERE type IN ('oi','li','link')`
  // query hits all ~555k rows on mature vaults and costs ~130ms every startup
  // even when the result is always zero; the column-rename guards each do a
  // PRAGMA table_info lookup. All of those can be skipped once migrations have
  // settled.
  //
  // `readSchemaVersion` returns SCHEMA_VERSION when `meta` is absent (fresh
  // DB SCHEMA will create it), so we explicitly check `hasMeta` here to keep
  // pre-v1 DBs (where `meta` exists but `schema_version` is unset) on the
  // slow path — they genuinely need the migrations.
  const hasMeta = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").get()
  if (hasMeta) {
    const row = db.query("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | null
    const recorded = row ? parseInt(row.value, 10) : NaN
    if (Number.isFinite(recorded) && recorded >= SCHEMA_VERSION) {
      return { ftsDropped: false }
    }
  }

  const columnNames = new Set(columns.map((c) => c.name))

  // Add missing columns (schema evolution)
  const missing = (col: string, type = "TEXT") => {
    if (!columnNames.has(col)) db.run(`ALTER TABLE nodes ADD COLUMN ${col} ${type}`)
  }
  missing("fstype")
  missing("due_at")
  missing("start_at")
  missing("item", "INTEGER DEFAULT 0")
  missing("embed_of")
  missing("parsed", "INTEGER DEFAULT 0")
  // v5 identity-schema columns — see SCHEMA_VERSION history.
  // Additive only; null-safe for existing rows until the reconciler fills them in.
  missing("fs_dev", "INTEGER")
  missing("fs_size", "INTEGER")
  missing("fs_content_hash", "TEXT")

  // Rename embed_source → embed_of (column rename migration)
  if (columnNames.has("embed_source") && !columnNames.has("embed_of")) {
    db.run("ALTER TABLE nodes ADD COLUMN embed_of TEXT")
    db.run("UPDATE nodes SET embed_of = embed_source WHERE embed_source IS NOT NULL")
  }

  // Rename symlink_to → embed_of (column rename migration)
  if (columnNames.has("symlink_to") && !columnNames.has("embed_of")) {
    db.run("ALTER TABLE nodes ADD COLUMN embed_of TEXT")
    db.run("UPDATE nodes SET embed_of = symlink_to WHERE symlink_to IS NOT NULL")
  } else if (columnNames.has("symlink_to") && columnNames.has("embed_of")) {
    // Both exist (mid-migration): copy any non-null symlink_to values to embed_of
    db.run("UPDATE nodes SET embed_of = symlink_to WHERE symlink_to IS NOT NULL AND embed_of IS NULL")
  }

  // kmast v2: convert old type values to trait-based model
  // oi → h + item:true, li → p + item:true, link → embed + embed_of from link_to
  const hasOldTypes = (
    db.query("SELECT COUNT(*) as cnt FROM nodes WHERE type IN ('oi', 'li', 'link')").get() as { cnt: number }
  ).cnt
  if (hasOldTypes > 0) {
    db.run("UPDATE nodes SET type = 'h', item = 1 WHERE type = 'oi'")
    db.run("UPDATE nodes SET type = 'p', item = 1 WHERE type = 'li'")
    // Copy link_to → embed_of. Old "link" type becomes "p" with embed_of.
    if (columnNames.has("link_to")) {
      db.run("UPDATE nodes SET type = 'p', embed_of = link_to WHERE type = 'link'")
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

  // Links schema v4: drop the legacy 9-column links table so SCHEMA can
  // recreate it as a 3-column (host_id, href, rel) cache. Safe because the
  // links table is rebuildable by re-parsing .md content — DATA_VERSION=2
  // triggers that rebuild in migrateData() after SCHEMA runs.
  migrateLinksTableToV4(db)

  // Version-gated migrations. `meta` is created by SCHEMA, but on older DBs it
  // may exist without a schema_version row — in which case we treat the DB as
  // version 0 and run every migration below.
  return migrateVersioned(db)
}

/**
 * Read the current schema_version from the meta table, or 0 if absent.
 * Returns 0 for DBs that predate the `schema_version` key, which is the
 * cue for every versioned migration to run.
 */
function readSchemaVersion(db: import("bun:sqlite").Database): number {
  // meta may not exist yet on a truly fresh DB — in that case, SCHEMA will
  // create it and we're at the target version, no migration needed.
  const hasMeta = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").get()
  if (!hasMeta) return SCHEMA_VERSION

  const row = db.query("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | null
  if (!row) return 0
  const n = parseInt(row.value, 10)
  return Number.isFinite(n) ? n : 0
}

function writeSchemaVersion(db: import("bun:sqlite").Database, version: number): void {
  db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)", [String(version)])
}

/**
 * Run version-gated migrations for the nodes_fts schema and any future
 * irreversible changes. Idempotent — re-running after the version is current
 * is a no-op.
 */
function migrateVersioned(db: import("bun:sqlite").Database): MigrateResult {
  const result: MigrateResult = { ftsDropped: false }

  const current = readSchemaVersion(db)
  if (current >= SCHEMA_VERSION) return result

  // Ensure meta exists so we can write the version marker on any migration path.
  db.run("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")

  // v1 → v2: rebuild nodes_fts with name + title columns and sigil tokenchars.
  //
  // CREATE VIRTUAL TABLE IF NOT EXISTS won't update an existing fts5 table's
  // column set or tokenizer, so we must drop the old one if it exists in the
  // pre-v2 shape. Fresh DBs (created by SCHEMA just before migrateSchema ran)
  // already have the correct layout — we detect that by probing for a `name`
  // column on nodes_fts, and skip the drop in that case.
  if (current < 2) {
    const hasFts = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='nodes_fts'").get()
    if (hasFts && !ftsHasNameColumn(db)) {
      dropFtsTable(db)
      result.ftsDropped = true
    }
  }

  // v2 → v3: tokenchars swap from '@#+[' to '@#+~'. The tokenizer is baked
  // into the virtual table at CREATE time, so a tokenizer change requires
  // dropping and recreating the table — same drop-and-rebuild path as v2.
  // We drop unconditionally here because fresh DBs (at the new SCHEMA) don't
  // go through this branch (current would be SCHEMA_VERSION, returning
  // early above). Any table that reaches this line is pre-v3.
  if (current < 3 && current >= 2) {
    dropFtsTable(db)
    result.ftsDropped = true
  }

  // v3 → v4: links table flipped to 3-column (host_id, href, rel). The actual
  // drop runs in migrateLinksTableToV4() above (which executes before this
  // version gate because it's idempotent and needs to run before SCHEMA
  // creates the new-shape table). Nothing to do here beyond recording the
  // version bump; the DATA_VERSION=2 rebuild populates rows from re-parse.

  writeSchemaVersion(db, SCHEMA_VERSION)
  return result
}

/**
 * Drop `nodes_fts` and its triggers in a transaction. Used by both the v1→v2
 * and v2→v3 migrations — neither can update an existing virtual table in
 * place, so the drop-and-recreate path is shared.
 */
function dropFtsTable(db: import("bun:sqlite").Database): void {
  db.run("BEGIN IMMEDIATE")
  try {
    db.run("DROP TRIGGER IF EXISTS nodes_ai")
    db.run("DROP TRIGGER IF EXISTS nodes_ad")
    db.run("DROP TRIGGER IF EXISTS nodes_au")
    db.run("DROP TABLE IF EXISTS nodes_fts")
    db.run("COMMIT")
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }
}

/**
 * Probe whether `nodes_fts` already has the v2 `name` column.
 * Uses `pragma_table_info` which works on fts5 virtual tables and exposes
 * the user-defined columns (id, [name, title], content).
 */
function ftsHasNameColumn(db: import("bun:sqlite").Database): boolean {
  try {
    const cols = db.query("SELECT name FROM pragma_table_info('nodes_fts')").all() as { name: string }[]
    return cols.some((c) => c.name === "name")
  } catch {
    return false
  }
}

/**
 * Rebuild the `nodes_fts` index from the `nodes` table. Used after a v2
 * schema migration that dropped and recreated `nodes_fts` — the new index
 * starts empty and needs to pick up all existing rows.
 *
 * Safe to call on an already-populated index: `INSERT INTO fts(fts)
 * VALUES('rebuild')` is defined by fts5 as "discard the current index and
 * rebuild from the content table", so it's idempotent and doesn't produce
 * duplicate rows. It's O(N) over the nodes table, so callers should only
 * invoke it after a schema change, not on every DB open.
 *
 * No-op on an empty or missing nodes table.
 */
export function rebuildFtsIndex(db: import("bun:sqlite").Database): void {
  const nodesExist = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='nodes'").get()
  if (!nodesExist) return

  const nodeCount = (db.query("SELECT COUNT(*) as cnt FROM nodes").get() as { cnt: number }).cnt
  if (nodeCount === 0) return

  db.run("INSERT INTO nodes_fts(nodes_fts) VALUES('rebuild')")
}

// =============================================================================
// Data migration — application-logic changes that invalidate derived rows
// =============================================================================

export interface DataMigrateResult {
  /** True when derived data is stale and the DB should be rebuilt from .md files */
  needsRebuild: boolean
}

/**
 * Check whether derived data is stale due to application-logic changes.
 * Returns `needsRebuild: true` when the data version is behind, signaling
 * the caller to wipe nodes/links/FTS and re-parse from source .md files.
 *
 * Unlike migrateSchema (which runs ALTER TABLE in-place), data migrations
 * are too complex for SQL — they depend on TypeScript logic (normalizeNodeName,
 * title derivation, link resolution). The safest path is a full rebuild,
 * which is fast (~2-4s for a large vault) and always correct because
 * state.db is a rebuildable cache.
 */
export function migrateData(db: import("bun:sqlite").Database): DataMigrateResult {
  const current = readDataVersion(db)
  if (current >= DATA_VERSION) return { needsRebuild: false }

  // Any version behind DATA_VERSION triggers a full rebuild.
  // Future: if a data migration can be done incrementally (e.g., UPDATE
  // all heading names), add a version-gated branch here before the
  // blanket rebuild. For now, rebuild is the only strategy.

  // Wipe derived data so the loader re-parses everything from .md files.
  db.run("BEGIN IMMEDIATE")
  try {
    db.run("DELETE FROM nodes")
    db.run("DELETE FROM links")
    // FTS is rebuilt automatically after SCHEMA re-runs
    const hasFts = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='nodes_fts'").get()
    if (hasFts) db.run("INSERT INTO nodes_fts(nodes_fts) VALUES('rebuild')")
    // Sync state must also be cleared so the reconciler re-discovers all files
    const hasSyncState = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_state'").get()
    if (hasSyncState) db.run("DELETE FROM sync_state")
    writeDataVersion(db, DATA_VERSION)
    db.run("COMMIT")
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }

  return { needsRebuild: true }
}

function readDataVersion(db: import("bun:sqlite").Database): number {
  const hasMeta = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").get()
  if (!hasMeta) return DATA_VERSION // fresh DB, no migration needed
  const row = db.query("SELECT value FROM meta WHERE key = 'data_version'").get() as { value: string } | null
  if (!row) return 0 // pre-data-versioning DB
  const n = parseInt(row.value, 10)
  return Number.isFinite(n) ? n : 0
}

function writeDataVersion(db: import("bun:sqlite").Database, version: number): void {
  db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('data_version', ?)", [String(version)])
}

/**
 * Migrate the `links` table to the canonical 3-column v4 schema.
 *
 * The legacy schema carried 9 columns (source_id, target_name, target_id,
 * section, block_id, alias, embedded, relationship, created_at) and
 * resolution state. v4 flips this to (host_id, href, rel) with runtime
 * resolution via the name index — see docs/design/model/klink.md.
 *
 * The migration drops the legacy table and its indices so SCHEMA can
 * recreate it empty in the 3-column shape. Rows are repopulated by the
 * DATA_VERSION=2 rebuild (full re-parse of .md content), which is why the
 * destructive drop is safe — the links table has always been a cache.
 *
 * Idempotent: detects the v4 shape by probing for the `host_id` column.
 */
function migrateLinksTableToV4(db: import("bun:sqlite").Database): void {
  const linksExists = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='links'").get()
  if (!linksExists) return

  const cols = db.query("PRAGMA table_info(links)").all() as { name: string }[]
  const hasHostId = cols.some((c) => c.name === "host_id")
  if (hasHostId) return // Already v4

  db.run("BEGIN IMMEDIATE")
  try {
    // Drop legacy indices — CREATE TABLE below won't touch them and they
    // reference dropped columns after the table flip.
    db.run("DROP INDEX IF EXISTS idx_links_unique")
    db.run("DROP INDEX IF EXISTS idx_links_source")
    db.run("DROP INDEX IF EXISTS idx_links_target_name")
    db.run("DROP INDEX IF EXISTS idx_links_target_id")
    db.run("DROP TABLE IF EXISTS links")
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
  "embed_of",
  "parent_idx",
  "fs_path",
  "fs_dev",
  "fs_ino",
  "fs_mtime",
  "fs_size",
  "fs_content_hash",
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
