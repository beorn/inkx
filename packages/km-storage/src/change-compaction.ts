/**
 * Change Compaction & Store Health
 *
 * The events table inside state.db is the canonical event log
 * (SCHEMA_VERSION 12+). Tiered retention compaction prunes old rows;
 * VACUUM INTO produces atomic backups in WAL mode. There is no separate
 * journal file — see @km/storage/events-table-replaces-jsonl.
 */

import { Database } from "bun:sqlite"
import { existsSync, readdirSync, statSync } from "fs"
import { join } from "path"
import { getNodeCount, getLastEventId } from "./db/db.ts"
import { createIgnoreMatcher, shouldIgnore } from "@km/fs-mount"

/** Health status of the worktree + events table + node store */
export interface StoreHealth {
  worktree: { fileCount: number; dirCount: number }
  db: { nodeCount: number; eventCount: number; size: number; lastEventId: string | null } | null
  issues: string[]
}

/** Result of `retainEvents` — what was kept, dropped, and reclaimed. */
export interface RetainEventsResult {
  /** Events present before compaction. */
  rowsBefore: number
  /** Events present after compaction. */
  rowsAfter: number
  /** Rows deleted by the retention sweep. */
  rowsDropped: number
  /** Rows kept via the by-key compaction (retention boundary). */
  rowsByKeyKept: number
  /** Database file size before compaction (bytes). */
  bytesBefore: number
  /** Database file size after compaction (bytes). */
  bytesAfter: number
}

/** Options for `retainEvents`. Defaults match @km/storage/events-table-replaces-jsonl. */
export interface RetainEventsOptions {
  /** Hot retention window — events newer than this are kept verbatim. Default 30 days. */
  fullRetentionDays?: number
  /**
   * By-key retention window — events between fullRetentionDays and this age
   * are compacted to keep only the latest per (target, type). Default 90 days.
   * Set fullRetentionDays = byKeyRetentionDays to skip the by-key step.
   */
  byKeyRetentionDays?: number
  /**
   * Skip incremental_vacuum after deletion. Useful when the caller plans to
   * VACUUM INTO afterwards (which produces a fresh, defragmented file).
   */
  skipVacuum?: boolean
}

/**
 * Tiered retention compaction for the events table.
 *
 * Default policy (consensus from /pro 4-leg, 2026-05-05):
 *   - 0 to N days (default 30): keep all events.
 *   - N to M days (default 90): keep latest per (target, type) only —
 *     audit trail retains "what was the last update, when, by whom" but
 *     drops the intermediate updates.
 *   - M+ days: drop everything except node_created (forever).
 *
 * `node_created` events are kept indefinitely because they're cheap
 * (~5K nodes × ~200 B = ~1 MB on the user's vault) and enable the
 * "when did I first write this note?" query that PKM users rely on.
 *
 * After deletion, `PRAGMA incremental_vacuum` reclaims free pages
 * incrementally — this requires `auto_vacuum=INCREMENTAL` to have been
 * set on the DB. Existing v11 DBs don't have this PRAGMA enabled
 * (it must be set on a fresh DB before any tables); the pragma sticks
 * after the first VACUUM-INTO + atomic-rename swap.
 */
export function retainEvents(kmDir: string, db: Database, options: RetainEventsOptions = {}): RetainEventsResult {
  const fullDays = options.fullRetentionDays ?? 30
  const byKeyDays = options.byKeyRetentionDays ?? 90

  const dbPath = join(kmDir, "state.db")
  const bytesBefore = existsSync(dbPath) ? statSync(dbPath).size : 0
  const rowsBefore = (db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n
  if (rowsBefore === 0) {
    return { rowsBefore: 0, rowsAfter: 0, rowsDropped: 0, rowsByKeyKept: 0, bytesBefore, bytesAfter: bytesBefore }
  }

  const now = Date.now()
  const fullCutoff = now - fullDays * 86_400_000
  const byKeyCutoff = now - byKeyDays * 86_400_000

  db.run("BEGIN IMMEDIATE")
  try {
    // Step 1 — for events between fullCutoff and byKeyCutoff, keep only the
    // latest seq per (target, type). Drop the older duplicates.
    //
    // node_created events are excluded — those are kept for the lifetime of
    // the vault, regardless of retention window.
    const byKeyDeleteResult = db.run(
      `DELETE FROM events
        WHERE ts < ? AND ts >= ?
          AND type != 'node_created'
          AND seq NOT IN (
            SELECT MAX(seq) FROM events
            WHERE ts < ? AND ts >= ?
              AND type != 'node_created'
            GROUP BY target, type
          )`,
      [fullCutoff, byKeyCutoff, fullCutoff, byKeyCutoff],
    )
    const byKeyDropped = byKeyDeleteResult.changes ?? 0

    // Step 2 — drop events older than byKeyCutoff entirely (except
    // node_created, which is retained forever).
    const oldDeleteResult = db.run(`DELETE FROM events WHERE ts < ? AND type != 'node_created'`, [byKeyCutoff])
    const oldDropped = oldDeleteResult.changes ?? 0

    db.run("COMMIT")

    const rowsByKeyKept = byKeyDropped // approximation: rows we kept via by-key are (input - dropped)
    const rowsAfter = (db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n
    const rowsDropped = byKeyDropped + oldDropped

    if (!options.skipVacuum) {
      try {
        db.run("PRAGMA incremental_vacuum")
      } catch {
        // auto_vacuum may not be INCREMENTAL on this DB; skip silently.
        // Caller can VACUUM INTO afterwards to defragment.
      }
    }

    const bytesAfter = existsSync(dbPath) ? statSync(dbPath).size : 0

    return { rowsBefore, rowsAfter, rowsDropped, rowsByKeyKept, bytesBefore, bytesAfter }
  } catch (err) {
    db.run("ROLLBACK")
    throw err
  }
}

/**
 * Atomic backup via SQLite's `VACUUM INTO` — the only safe way to copy
 * a WAL-mode database while it may be in use.
 *
 * Why not `cp state.db backup.db`: in WAL mode the on-disk state.db
 * doesn't reflect committed transactions until a checkpoint runs;
 * meanwhile state.db-wal can hold uncommitted pages. A raw file copy
 * may capture a half-written page or miss recent commits.
 *
 * `VACUUM INTO` serializes through SQLite's transaction layer and
 * produces a new, consistent, standalone database file at `backupPath`.
 * Safe to run while the source is being written to. Returns the size
 * of the resulting backup file in bytes.
 *
 * Recommended cadence: run nightly (or before `retainEvents`) and keep
 * the last 3-7 backups. Snapshots double as cold-load restore points
 * if state.db corrupts.
 */
export function backupViaVacuumInto(kmDir: string, backupPath: string): number {
  const dbPath = join(kmDir, "state.db")
  if (!existsSync(dbPath)) return 0

  // VACUUM INTO requires the destination not to exist.
  if (existsSync(backupPath)) {
    throw new Error(`backup path already exists: ${backupPath} — refusing to clobber`)
  }

  const db = new Database(dbPath)
  try {
    db.run("VACUUM INTO ?", [backupPath])
  } finally {
    db.close()
  }

  return statSync(backupPath).size
}

/**
 * Vacuum the SQLite database. Returns bytes saved.
 */
export function vacuumDb(kmDir: string): number {
  const dbPath = join(kmDir, "state.db")
  if (!existsSync(dbPath)) return 0

  const sizeBefore = statSync(dbPath).size
  // Open a separate connection for VACUUM (can't run on existing connection)
  const vacDb = new Database(dbPath)
  vacDb.run("VACUUM")
  vacDb.close()
  const sizeAfter = statSync(dbPath).size

  return sizeBefore - sizeAfter
}

/**
 * Get health status of the worktree + events table + node store.
 */
export function getStoreHealth(repoPath: string, kmDir: string, db: Database | null): StoreHealth {
  const issues: string[] = []

  const worktree = countWorktree(repoPath, kmDir)

  let dbInfo: StoreHealth["db"] = null
  const dbPath = join(kmDir, "state.db")
  if (db && existsSync(dbPath)) {
    const size = statSync(dbPath).size
    const nodeCount = getNodeCount(db)
    const eventCount = (db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n
    const lastEventId = getLastEventId(db)
    dbInfo = { nodeCount, eventCount, size, lastEventId }

    // Check for orphan nodes (parent_id IS NULL but not the root)
    const orphanCount = (
      db.prepare("SELECT COUNT(*) as count FROM nodes WHERE parent_id IS NULL AND id != '.'").get() as { count: number }
    ).count
    if (orphanCount > 0) {
      issues.push(`${orphanCount} orphan node(s) without parent\n` + `      Run 'km doctor rebuild' to fix`)
    }

    // Check for absolute fs_path values
    const absoluteCount = (
      db.prepare("SELECT COUNT(*) as count FROM nodes WHERE fs_path LIKE '/%'").get() as { count: number }
    ).count
    if (absoluteCount > 0) {
      issues.push(`${absoluteCount} node(s) with absolute fs_path\n` + `      Run 'km doctor rebuild' to fix`)
    }

    // Check for missing root node
    const rootExists = db.prepare("SELECT id FROM nodes WHERE id = '.'").get() as { id: string } | undefined
    if (!rootExists && nodeCount > 0) {
      issues.push(`Missing root node (.)\n` + `      Run 'km doctor rebuild' to fix`)
    }
  }

  return { worktree, db: dbInfo, issues }
}

/** Count files and directories in the worktree (respecting ignore patterns) */
function countWorktree(repoPath: string, _kmDir: string): { fileCount: number; dirCount: number } {
  let fileCount = 0
  let dirCount = 0

  const ignoreMatcher = createIgnoreMatcher(repoPath)

  function walk(dir: string): void {
    let entries: import("fs").Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true, encoding: "utf-8" })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (shouldIgnore(fullPath, ignoreMatcher, repoPath)) continue

      if (entry.isDirectory()) {
        dirCount++
        walk(fullPath)
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        fileCount++
      }
    }
  }

  walk(repoPath)
  return { fileCount, dirCount }
}
