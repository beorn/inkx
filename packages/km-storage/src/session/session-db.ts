/**
 * session-db — user-local session state (~/.km/session.db)
 *
 * Implements the three durability tiers from hub/km/storage-architecture.md §5.3:
 *
 *   Tier        Location                      Contents                                    Durability
 *   ----------  ----------------------------  ------------------------------------------  -------------------------------
 *   content     `<repo>/.km/state.db`         Nodes, links, FTS, reconciliation meta      Rebuildable cache from .md
 *   session     `~/.km/session.db`            Undo, last cursor, recent, collapsed, panes User-durable; survives reclone
 *   ephemeral   RAM                           Selection, hover, scroll, edit-in-progress  Dies with process
 *
 * The **content** tier stays in the per-repo `.km/state.db` (see ./db/schema.ts).
 * This module owns the **session** tier — one SQLite file at `~/.km/session.db`,
 * shared across all repos on this machine, with every row keyed by `repo_id` so
 * workspaces stay isolated.
 *
 * Design rules honoured here (see `docs/principles.md`):
 *   - Factory functions only — no classes, no module-level globals.
 *   - Pure over the passed-in `Database` handle — every accessor takes it explicitly.
 *   - No hidden FS paths — uses `os.homedir()` (override via `KM_SESSION_DB` env var).
 *   - Additive migration path — first-open can absorb any rows left behind in
 *     `.km/state.db` from an earlier (pre-split) km build.
 *
 * Why separate from `state.db`:
 *   - `.km/state.db` is declared a rebuildable cache (§1.6). Blowing it away must
 *     never cost the user undo history or their last cursor position.
 *   - Cloning the repo on another machine shouldn't drag the first machine's
 *     session state along with it.
 *   - Future adapters (web, canvas) want the same session shape without a repo-
 *     local SQLite file at all.
 */

import { Database } from "bun:sqlite"
import { existsSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

import type { RepoId } from "@km/core"

// =============================================================================
// Schema
// =============================================================================

/**
 * Session schema — all tables keyed by `repo_id` (branded RepoId from @km/core).
 *
 * - `session_cursor`: last-known cursor position per repo. Single row per repo.
 * - `session_recent`: recently-opened nodes. Composite PK (repo_id, node_id).
 * - `session_collapsed`: set of collapsed node ids per repo.
 * - `session_pane_layout`: named workspace layouts (JSON-encoded). Keyed by name.
 * - `session_undo`: append-only undo log. `seq` monotonic per repo.
 * - `session_meta`: key/value for schema_version and future metadata.
 */
export const SESSION_SCHEMA = `
CREATE TABLE IF NOT EXISTS session_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS session_cursor (
  repo_id    TEXT NOT NULL,
  node_id    TEXT NOT NULL,
  updated_at INTEGER,
  PRIMARY KEY (repo_id)
);

CREATE TABLE IF NOT EXISTS session_recent (
  repo_id   TEXT NOT NULL,
  node_id   TEXT NOT NULL,
  opened_at INTEGER,
  PRIMARY KEY (repo_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_session_recent_opened
  ON session_recent(repo_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS session_collapsed (
  repo_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  PRIMARY KEY (repo_id, node_id)
);

CREATE TABLE IF NOT EXISTS session_pane_layout (
  repo_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  json       TEXT NOT NULL,
  updated_at INTEGER,
  PRIMARY KEY (repo_id, name)
);

CREATE TABLE IF NOT EXISTS session_undo (
  repo_id TEXT NOT NULL,
  seq     INTEGER NOT NULL,
  op_json TEXT NOT NULL,
  ts      INTEGER,
  PRIMARY KEY (repo_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_session_undo_repo_seq
  ON session_undo(repo_id, seq);
`

/** Bump when the session schema gets a non-additive change. */
export const SESSION_SCHEMA_VERSION = 1

// =============================================================================
// Open / create
// =============================================================================

export interface OpenSessionDbOptions {
  /** Override home dir lookup. Defaults to `os.homedir()`. */
  home?: string
  /**
   * Override the full DB path. Takes precedence over `home` when set.
   * Honoured equivalently to the `KM_SESSION_DB` env var.
   */
  dbPath?: string
}

/**
 * Resolve the session DB path. Precedence:
 *   1. Explicit `dbPath` option
 *   2. `KM_SESSION_DB` env var
 *   3. `<home>/.km/session.db` (home from option or `os.homedir()`)
 */
export function resolveSessionDbPath(opts: OpenSessionDbOptions = {}): string {
  if (opts.dbPath) return opts.dbPath
  const envOverride = process.env.KM_SESSION_DB
  if (envOverride && envOverride.length > 0) return envOverride
  const home = opts.home ?? homedir()
  return join(home, ".km", "session.db")
}

/**
 * Open (or create) the user-local session DB.
 *
 * - Ensures the parent directory exists.
 * - Applies `SESSION_SCHEMA` (idempotent via `CREATE … IF NOT EXISTS`).
 * - Records `schema_version` so future migrations can gate on it.
 * - Enables WAL for concurrent read during writes (matches state.db).
 *
 * The caller owns the returned handle and is responsible for `close()`.
 */
export function openSessionDb(opts: OpenSessionDbOptions = {}): Database {
  const path = resolveSessionDbPath(opts)
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const db = new Database(path, { create: true })
  // WAL matches `.km/state.db`; keeps readers unblocked while we append undo rows.
  try {
    db.run("PRAGMA journal_mode = WAL")
  } catch {
    /* best-effort; :memory: and some filesystems reject WAL */
  }
  db.run("PRAGMA foreign_keys = ON")
  db.run(SESSION_SCHEMA)
  writeSessionMeta(db, "schema_version", String(SESSION_SCHEMA_VERSION))
  return db
}

// =============================================================================
// Meta
// =============================================================================

export function readSessionMeta(db: Database, key: string): string | null {
  const row = db.query("SELECT value FROM session_meta WHERE key = ?").get(key) as { value: string } | null
  return row ? row.value : null
}

export function writeSessionMeta(db: Database, key: string, value: string): void {
  db.run("INSERT OR REPLACE INTO session_meta (key, value) VALUES (?, ?)", [key, value])
}

// =============================================================================
// Cursor — one row per repo
// =============================================================================

export interface SessionCursor {
  nodeId: string
  updatedAt: number
}

export function getSessionCursor(db: Database, repoId: RepoId): SessionCursor | null {
  const row = db.query("SELECT node_id, updated_at FROM session_cursor WHERE repo_id = ?").get(String(repoId)) as {
    node_id: string
    updated_at: number | null
  } | null
  if (!row) return null
  return { nodeId: row.node_id, updatedAt: row.updated_at ?? 0 }
}

export function setSessionCursor(db: Database, repoId: RepoId, nodeId: string, now: number = Date.now()): void {
  db.run(
    `INSERT INTO session_cursor (repo_id, node_id, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(repo_id) DO UPDATE SET node_id = excluded.node_id, updated_at = excluded.updated_at`,
    [String(repoId), nodeId, now],
  )
}

export function clearSessionCursor(db: Database, repoId: RepoId): void {
  db.run("DELETE FROM session_cursor WHERE repo_id = ?", [String(repoId)])
}

// =============================================================================
// Recent — append / query most-recent-first, cap enforced at write time
// =============================================================================

export interface SessionRecentEntry {
  nodeId: string
  openedAt: number
}

export function addSessionRecent(db: Database, repoId: RepoId, nodeId: string, now: number = Date.now()): void {
  db.run(
    `INSERT INTO session_recent (repo_id, node_id, opened_at) VALUES (?, ?, ?)
     ON CONFLICT(repo_id, node_id) DO UPDATE SET opened_at = excluded.opened_at`,
    [String(repoId), nodeId, now],
  )
}

/** Returns recents most-recent-first, limited to `limit` entries. */
export function getSessionRecent(db: Database, repoId: RepoId, limit = 100): SessionRecentEntry[] {
  const rows = db
    .query(
      `SELECT node_id, opened_at FROM session_recent
       WHERE repo_id = ?
       ORDER BY opened_at DESC
       LIMIT ?`,
    )
    .all(String(repoId), limit) as { node_id: string; opened_at: number | null }[]
  return rows.map((r) => ({ nodeId: r.node_id, openedAt: r.opened_at ?? 0 }))
}

/** Trim entries older than the newest `keep` rows for this repo. */
export function trimSessionRecent(db: Database, repoId: RepoId, keep: number): void {
  db.run(
    `DELETE FROM session_recent
     WHERE repo_id = ?
       AND node_id NOT IN (
         SELECT node_id FROM session_recent
         WHERE repo_id = ?
         ORDER BY opened_at DESC
         LIMIT ?
       )`,
    [String(repoId), String(repoId), keep],
  )
}

// =============================================================================
// Collapsed state — set membership per repo
// =============================================================================

export function setCollapsed(db: Database, repoId: RepoId, nodeId: string, collapsed: boolean): void {
  if (collapsed) {
    db.run("INSERT OR IGNORE INTO session_collapsed (repo_id, node_id) VALUES (?, ?)", [String(repoId), nodeId])
  } else {
    db.run("DELETE FROM session_collapsed WHERE repo_id = ? AND node_id = ?", [String(repoId), nodeId])
  }
}

export function isCollapsed(db: Database, repoId: RepoId, nodeId: string): boolean {
  const row = db
    .query("SELECT 1 FROM session_collapsed WHERE repo_id = ? AND node_id = ? LIMIT 1")
    .get(String(repoId), nodeId) as { 1: number } | null
  return row !== null
}

export function getCollapsedSet(db: Database, repoId: RepoId): Set<string> {
  const rows = db.query("SELECT node_id FROM session_collapsed WHERE repo_id = ?").all(String(repoId)) as {
    node_id: string
  }[]
  return new Set(rows.map((r) => r.node_id))
}

// =============================================================================
// Pane layouts — arbitrary named JSON blobs per repo
// =============================================================================

export interface SessionPaneLayout<T = unknown> {
  name: string
  layout: T
  updatedAt: number
}

export function savePaneLayout(
  db: Database,
  repoId: RepoId,
  name: string,
  layout: unknown,
  now: number = Date.now(),
): void {
  db.run(
    `INSERT INTO session_pane_layout (repo_id, name, json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(repo_id, name) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
    [String(repoId), name, JSON.stringify(layout), now],
  )
}

export function loadPaneLayout<T = unknown>(db: Database, repoId: RepoId, name: string): SessionPaneLayout<T> | null {
  const row = db
    .query("SELECT name, json, updated_at FROM session_pane_layout WHERE repo_id = ? AND name = ?")
    .get(String(repoId), name) as { name: string; json: string; updated_at: number | null } | null
  if (!row) return null
  return { name: row.name, layout: JSON.parse(row.json) as T, updatedAt: row.updated_at ?? 0 }
}

export function listPaneLayouts(db: Database, repoId: RepoId): string[] {
  const rows = db.query("SELECT name FROM session_pane_layout WHERE repo_id = ? ORDER BY name").all(String(repoId)) as {
    name: string
  }[]
  return rows.map((r) => r.name)
}

export function deletePaneLayout(db: Database, repoId: RepoId, name: string): void {
  db.run("DELETE FROM session_pane_layout WHERE repo_id = ? AND name = ?", [String(repoId), name])
}

// =============================================================================
// Undo log — append-only, monotonic `seq` per repo
// =============================================================================

export interface SessionUndoEntry {
  seq: number
  opJson: string
  ts: number
}

/** Returns the new seq assigned to this op. */
export function appendUndo(db: Database, repoId: RepoId, op: unknown, now: number = Date.now()): number {
  const row = db
    .query("SELECT COALESCE(MAX(seq), 0) as max_seq FROM session_undo WHERE repo_id = ?")
    .get(String(repoId)) as { max_seq: number }
  const next = row.max_seq + 1
  db.run(`INSERT INTO session_undo (repo_id, seq, op_json, ts) VALUES (?, ?, ?, ?)`, [
    String(repoId),
    next,
    JSON.stringify(op),
    now,
  ])
  return next
}

/** Most-recent-first, capped at `limit`. */
export function getUndoEntries(db: Database, repoId: RepoId, limit = 100): SessionUndoEntry[] {
  const rows = db
    .query(
      `SELECT seq, op_json, ts FROM session_undo
       WHERE repo_id = ?
       ORDER BY seq DESC
       LIMIT ?`,
    )
    .all(String(repoId), limit) as { seq: number; op_json: string; ts: number | null }[]
  return rows.map((r) => ({ seq: r.seq, opJson: r.op_json, ts: r.ts ?? 0 }))
}

/** Drop undo entries with seq <= threshold for this repo (compaction). */
export function truncateUndoUpTo(db: Database, repoId: RepoId, seqInclusive: number): void {
  db.run("DELETE FROM session_undo WHERE repo_id = ? AND seq <= ?", [String(repoId), seqInclusive])
}

export function clearSessionForRepo(db: Database, repoId: RepoId): void {
  db.run("DELETE FROM session_cursor WHERE repo_id = ?", [String(repoId)])
  db.run("DELETE FROM session_recent WHERE repo_id = ?", [String(repoId)])
  db.run("DELETE FROM session_collapsed WHERE repo_id = ?", [String(repoId)])
  db.run("DELETE FROM session_pane_layout WHERE repo_id = ?", [String(repoId)])
  db.run("DELETE FROM session_undo WHERE repo_id = ?", [String(repoId)])
}

// =============================================================================
// Migration — pull session rows out of a legacy state.db, if present
// =============================================================================

/**
 * Per-table migration counts. All zero on DBs that predate any session-state
 * persistence — current state, until a consumer starts writing.
 */
export interface SessionMigrationCounts {
  cursor: number
  recent: number
  collapsed: number
  paneLayouts: number
  undo: number
}

/**
 * Migrate any session-state rows found in a repo-local `state.db` into the
 * user-local session DB, keyed by the given `repoId`.
 *
 * Safe to run repeatedly — `INSERT OR IGNORE` preserves whatever is already in
 * `session.db`. Returns per-table counts so callers can log what was moved.
 *
 * This is the contract the first consumer honours: when a pre-split km opened
 * `.km/state.db` and wrote `session_cursor` / `session_recent` / etc. rows
 * there, the post-split km sees those tables, lifts them into `session.db`,
 * then drops them from `state.db` so the content tier is clean.
 *
 * If no session tables exist in `stateDb` (today's reality), this is a no-op.
 */
export function migrateSessionStateFromStateDb(
  sessionDb: Database,
  stateDb: Database,
  repoId: RepoId,
): SessionMigrationCounts {
  const counts: SessionMigrationCounts = { cursor: 0, recent: 0, collapsed: 0, paneLayouts: 0, undo: 0 }

  // session_cursor may have existed either as the keyed shape or as an older
  // single-row `(node_id, updated_at)` layout. Accept both.
  if (hasTable(stateDb, "session_cursor")) {
    const cols = new Set(
      (stateDb.query("PRAGMA table_info(session_cursor)").all() as { name: string }[]).map((c) => c.name),
    )
    if (cols.has("node_id")) {
      const rows = stateDb.query("SELECT * FROM session_cursor").all() as Array<{
        node_id: string
        updated_at?: number
        repo_id?: string
      }>
      for (const r of rows) {
        sessionDb.run(`INSERT OR IGNORE INTO session_cursor (repo_id, node_id, updated_at) VALUES (?, ?, ?)`, [
          String(r.repo_id ?? repoId),
          r.node_id,
          r.updated_at ?? Date.now(),
        ])
        counts.cursor++
      }
    }
    stateDb.run("DROP TABLE IF EXISTS session_cursor")
  }

  if (hasTable(stateDb, "session_recent")) {
    const rows = stateDb.query("SELECT * FROM session_recent").all() as Array<{
      node_id: string
      opened_at?: number
      repo_id?: string
    }>
    for (const r of rows) {
      sessionDb.run(`INSERT OR IGNORE INTO session_recent (repo_id, node_id, opened_at) VALUES (?, ?, ?)`, [
        String(r.repo_id ?? repoId),
        r.node_id,
        r.opened_at ?? Date.now(),
      ])
      counts.recent++
    }
    stateDb.run("DROP TABLE IF EXISTS session_recent")
  }

  if (hasTable(stateDb, "session_collapsed")) {
    const rows = stateDb.query("SELECT * FROM session_collapsed").all() as Array<{
      node_id: string
      repo_id?: string
    }>
    for (const r of rows) {
      sessionDb.run(`INSERT OR IGNORE INTO session_collapsed (repo_id, node_id) VALUES (?, ?)`, [
        String(r.repo_id ?? repoId),
        r.node_id,
      ])
      counts.collapsed++
    }
    stateDb.run("DROP TABLE IF EXISTS session_collapsed")
  }

  if (hasTable(stateDb, "session_pane_layout")) {
    const rows = stateDb.query("SELECT * FROM session_pane_layout").all() as Array<{
      name: string
      json: string
      updated_at?: number
      repo_id?: string
    }>
    for (const r of rows) {
      sessionDb.run(`INSERT OR IGNORE INTO session_pane_layout (repo_id, name, json, updated_at) VALUES (?, ?, ?, ?)`, [
        String(r.repo_id ?? repoId),
        r.name,
        r.json,
        r.updated_at ?? Date.now(),
      ])
      counts.paneLayouts++
    }
    stateDb.run("DROP TABLE IF EXISTS session_pane_layout")
  }

  if (hasTable(stateDb, "session_undo")) {
    const rows = stateDb.query("SELECT * FROM session_undo ORDER BY seq").all() as Array<{
      seq: number
      op_json: string
      ts?: number
      repo_id?: string
    }>
    for (const r of rows) {
      sessionDb.run(`INSERT OR IGNORE INTO session_undo (repo_id, seq, op_json, ts) VALUES (?, ?, ?, ?)`, [
        String(r.repo_id ?? repoId),
        r.seq,
        r.op_json,
        r.ts ?? Date.now(),
      ])
      counts.undo++
    }
    stateDb.run("DROP TABLE IF EXISTS session_undo")
  }

  return counts
}

function hasTable(db: Database, name: string): boolean {
  const row = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name) as {
    name: string
  } | null
  return row !== null
}
