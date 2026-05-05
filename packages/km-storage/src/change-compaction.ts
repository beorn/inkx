/**
 * Change Compaction & Store Health
 *
 * Post-SCHEMA_VERSION 12: events live in a SQLite table inside state.db.
 * The legacy compactJournal / compactChanges / identifyStaleChanges
 * functions operate on the now-deprecated changes.jsonl file. They are
 * kept for vaults that haven't yet run `km doctor migrate-journal`. New
 * code should use:
 *
 *   - retainEvents(kmDir, db, options) — tiered retention compaction
 *   - backupViaVacuumInto(kmDir, path) — atomic backup
 *   - vacuumDb(kmDir) — VACUUM (rare; INCREMENTAL is the steady-state path)
 *
 * The legacy functions are scheduled for removal once every vault has
 * been migrated. See @km/storage/events-table-replaces-jsonl.
 */

import { Database } from "bun:sqlite"
import type { Change } from "@km/core"
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync, writeFileSync, writeSync } from "fs"
import { join } from "path"
import { readChanges } from "./repo/loader.ts"
import { getNodeCount, getLastEventId } from "./db/db.ts"
import { createIgnoreMatcher, shouldIgnore } from "@km/fs-mount"

/** Result of identifying or compacting stale changes */
export interface CompactionResult {
  totalChanges: number
  staleCount: number
  keptChanges: Change[]
}

/** Health status of all three stores */
export interface StoreHealth {
  worktree: { fileCount: number; dirCount: number }
  changes: { count: number; staleCount: number; size: number } | null
  db: { nodeCount: number; size: number; lastEventId: string | null } | null
  issues: string[]
}

/**
 * @deprecated Operates on the legacy changes.jsonl file. Post-v12 use
 *   retainEvents() against the events table inside state.db.
 *
 * Identify stale changes in changes.jsonl by replaying them against the database.
 * Stale changes are those whose node_created changes would hit UNIQUE constraint
 * failures — they reference nodes that already exist from file parsing.
 */
export function identifyStaleChanges(kmDir: string, db: Database): CompactionResult {
  const changes = readChanges(kmDir)
  if (changes.length === 0) {
    return { totalChanges: 0, staleCount: 0, keptChanges: [] }
  }

  // Check which node IDs already exist in the database
  const existingIds = new Set<string>()
  const rows = db.prepare("SELECT id FROM nodes").all() as { id: string }[]
  for (const row of rows) {
    existingIds.add(row.id)
  }

  // Build a set of node IDs that have later changes (update, delete, move, etc.)
  const nodesWithLaterChanges = new Set<string>()
  for (const change of changes) {
    if (change.type !== "node_created" && change.target) {
      nodesWithLaterChanges.add(change.target)
    }
  }

  const kept: Change[] = []
  let staleCount = 0

  for (const change of changes) {
    if (change.type === "node_created") {
      const data = change.data as Record<string, unknown>
      const id = data.id as string | undefined
      // A node_created is only stale if the node exists in DB AND there are
      // no later changes referencing it. If later changes exist, the create
      // must be preserved for replay ordering.
      if (id && existingIds.has(id) && !nodesWithLaterChanges.has(id)) {
        staleCount++
        continue
      }
    }
    kept.push(change)
  }

  return { totalChanges: changes.length, staleCount, keptChanges: kept }
}

/**
 * @deprecated Operates on the legacy changes.jsonl file. Post-v12 use
 *   retainEvents() against the events table inside state.db.
 *
 * Compact changes.jsonl by removing stale changes and rewriting the file.
 * Returns the compaction result.
 */
export function compactChanges(kmDir: string, db: Database): CompactionResult {
  const result = identifyStaleChanges(kmDir, db)

  if (result.staleCount > 0) {
    const changesPath = join(kmDir, "changes.jsonl")
    const lines = result.keptChanges.map((c) => JSON.stringify(c))
    writeFileSync(changesPath, lines.join("\n") + (lines.length > 0 ? "\n" : ""))
  }

  return result
}

/** Result of compactJournal — drops the applied prefix and keeps the unapplied tail. */
export interface JournalCompactionResult {
  /** Bytes in the changes.jsonl file before compaction. */
  bytesBefore: number
  /** Bytes in the changes.jsonl file after compaction. */
  bytesAfter: number
  /** Bytes reclaimed (bytesBefore - bytesAfter). */
  bytesReclaimed: number
  /** True when meta cursors made compaction safe (always set after a successful run). */
  truncated: boolean
}

/**
 * @deprecated Operates on the legacy changes.jsonl file. Post-v12 use
 *   retainEvents() against the events table inside state.db. The events
 *   table doesn't accumulate an "applied prefix" — every event is applied
 *   atomically with the state mutation that produced it, so the entire
 *   notion of journal-truncation is obsolete.
 *
 * Compact changes.jsonl by dropping the prefix that has already been applied to
 * state.db. The DB *is* the snapshot — every event whose id ≤ `meta.last_event`
 * has been folded into the node tree, so the corresponding journal lines are
 * recomputable noise. After compaction:
 *
 *   - `changes.jsonl` contains only the unapplied tail (bytes past the cursor).
 *     For most vaults that's ~0 bytes; for vaults with a pending unsynced tail
 *     it's the small bit that hasn't been folded yet.
 *   - `meta.last_event_offset` is reset to the new file size (== EOF) so the
 *     next sync's tail-read starts at the right place.
 *   - `meta.last_snapshot_event` is set to `meta.last_event` so callers that
 *     want to see "what was the highest event folded into the snapshot at
 *     compaction time" have a stable record.
 *
 * Trade-off: after compaction `km doctor rebuild` can no longer reconstruct
 * state.db from journal-replay alone (the prefix is gone). Recovery falls back
 * to memory-mode (FS scan) — which is the documented .md-is-source-of-truth
 * model. Callers that need full event history must NOT call this.
 */
export function compactJournal(kmDir: string, db: Database): JournalCompactionResult {
  const changesPath = join(kmDir, "changes.jsonl")

  if (!existsSync(changesPath)) {
    return { bytesBefore: 0, bytesAfter: 0, bytesReclaimed: 0, truncated: false }
  }

  const bytesBefore = statSync(changesPath).size
  if (bytesBefore === 0) {
    return { bytesBefore: 0, bytesAfter: 0, bytesReclaimed: 0, truncated: false }
  }

  // Read the byte cursor — events past this are NOT yet in state.db.
  const offsetRow = db.prepare("SELECT value FROM meta WHERE key = ?").get("last_event_offset") as
    | { value: string }
    | undefined
  const lastEventOffset = offsetRow?.value !== undefined ? Number(offsetRow.value) : 0

  // Read the highest applied event id for the snapshot marker.
  const lastEvent = getLastEventId(db) ?? ""

  let tail = ""
  if (lastEventOffset > 0 && lastEventOffset < bytesBefore) {
    // Read the unapplied tail (bytes past the cursor) before truncation.
    // The cursor *should* be on a newline boundary (the loader stamps it
    // at file EOF after a clean read). When it isn't (corrupted cursor or
    // crash mid-write), we fall back to scanning forward to the next `\n`
    // so the resulting file always starts on a record boundary.
    const fd = openSync(changesPath, "r")
    try {
      const buf = Buffer.alloc(bytesBefore - lastEventOffset)
      readSync(fd, buf, 0, buf.length, lastEventOffset)
      tail = buf.toString("utf-8")

      // Only trim a partial-first-line when the cursor is genuinely
      // mid-line. We detect that by reading the byte immediately BEFORE
      // the cursor — if it's not `\n`, the cursor is mid-record and we
      // skip ahead to the next newline.
      const probe = Buffer.alloc(1)
      readSync(fd, probe, 0, 1, lastEventOffset - 1)
      const onBoundary = probe[0] === 0x0a // '\n'
      if (!onBoundary) {
        const firstNewline = tail.indexOf("\n")
        if (firstNewline >= 0) {
          tail = tail.slice(firstNewline + 1)
        } else {
          tail = ""
        }
      }
    } finally {
      closeSync(fd)
    }
  }

  // Atomic write: rewrite the file with just the tail. Empty tail truncates
  // to 0 bytes (the common case — everything's already applied).
  const fd = openSync(changesPath, "w")
  try {
    if (tail.length > 0) writeSync(fd, tail)
  } finally {
    closeSync(fd)
  }

  const bytesAfter = statSync(changesPath).size

  // Reset cursor to EOF — the next sync's tail-read starts here.
  db.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ["last_event_offset", String(bytesAfter)])
  if (lastEvent) {
    db.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ["last_snapshot_event", lastEvent])
  }

  return {
    bytesBefore,
    bytesAfter,
    bytesReclaimed: bytesBefore - bytesAfter,
    truncated: true,
  }
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
 * Tiered retention compaction for the SCHEMA_VERSION 12 events table.
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
 * Recommended cadence: run nightly (or before `compactEvents` /
 * retainEvents) and keep the last 3-7 backups. Snapshots double as
 * cold-load restore points if state.db corrupts.
 */
export function backupViaVacuumInto(kmDir: string, backupPath: string): number {
  const dbPath = join(kmDir, "state.db")
  if (!existsSync(dbPath)) return 0

  // VACUUM INTO requires the destination not to exist.
  if (existsSync(backupPath)) {
    throw new Error(`backup path already exists: ${backupPath} — refusing to clobber`)
  }

  const db = new Database(dbPath, { readonly: false })
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
 * Get health status of all three stores.
 */
export function getStoreHealth(repoPath: string, kmDir: string, db: Database | null): StoreHealth {
  const issues: string[] = []

  // Worktree stats
  const worktree = countWorktree(repoPath, kmDir)

  // Changes stats
  let changes: StoreHealth["changes"] = null
  const changesPath = join(kmDir, "changes.jsonl")
  if (existsSync(changesPath)) {
    const size = statSync(changesPath).size
    const allChanges = readChanges(kmDir)
    let staleCount = 0

    if (db) {
      const result = identifyStaleChanges(kmDir, db)
      staleCount = result.staleCount
    }

    changes = { count: allChanges.length, staleCount, size }

    if (staleCount > 0) {
      issues.push(`${staleCount} stale changes in changes.jsonl\n` + `      Run 'km doctor gc' to compact`)
    }
  }

  // Database stats
  let dbInfo: StoreHealth["db"] = null
  const dbPath = join(kmDir, "state.db")
  if (db && existsSync(dbPath)) {
    const size = statSync(dbPath).size
    const nodeCount = getNodeCount(db)
    const lastEventId = getLastEventId(db)
    dbInfo = { nodeCount, size, lastEventId }

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

  return { worktree, changes, db: dbInfo, issues }
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
