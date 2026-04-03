/**
 * Event Compaction & Store Health
 *
 * Provides diagnostic and repair functions for the three km data stores:
 * - Worktree (markdown files on disk)
 * - events.jsonl (event log)
 * - state.db (materialized SQLite state)
 */

import { Database } from "bun:sqlite"
import type { Event } from "@km/core"
import { existsSync, readdirSync, statSync, writeFileSync } from "fs"
import { join } from "path"
import { readEvents } from "./repo/loader.ts"
import { getNodeCount, getLastEventId } from "./db/db.ts"
import { getIgnorePatterns, shouldIgnore } from "./fs/ignore.ts"

/** Result of identifying or compacting stale events */
export interface CompactionResult {
  totalEvents: number
  staleCount: number
  keptEvents: Event[]
}

/** Health status of all three stores */
export interface StoreHealth {
  worktree: { fileCount: number; dirCount: number }
  events: { count: number; staleCount: number; size: number } | null
  db: { nodeCount: number; size: number; lastEventId: string | null } | null
  issues: string[]
}

/**
 * Identify stale events in events.jsonl by replaying them against the database.
 * Stale events are those whose node_created events would hit UNIQUE constraint
 * failures — they reference nodes that already exist from file parsing.
 */
export function identifyStaleEvents(kmDir: string, db: Database): CompactionResult {
  const events = readEvents(kmDir)
  if (events.length === 0) {
    return { totalEvents: 0, staleCount: 0, keptEvents: [] }
  }

  // Check which node IDs already exist in the database
  const existingIds = new Set<string>()
  const rows = db.prepare("SELECT id FROM nodes").all() as { id: string }[]
  for (const row of rows) {
    existingIds.add(row.id)
  }

  // Build a set of node IDs that have later events (update, delete, move, etc.)
  const nodesWithLaterEvents = new Set<string>()
  for (const event of events) {
    if (event.type !== "node_created" && event.target) {
      nodesWithLaterEvents.add(event.target)
    }
  }

  const kept: Event[] = []
  let staleCount = 0

  for (const event of events) {
    if (event.type === "node_created") {
      const data = event.data as Record<string, unknown>
      const id = data.id as string | undefined
      // A node_created is only stale if the node exists in DB AND there are
      // no later events referencing it. If later events exist, the create
      // must be preserved for replay ordering.
      if (id && existingIds.has(id) && !nodesWithLaterEvents.has(id)) {
        staleCount++
        continue
      }
    }
    kept.push(event)
  }

  return { totalEvents: events.length, staleCount, keptEvents: kept }
}

/**
 * Compact events.jsonl by removing stale events and rewriting the file.
 * Returns the compaction result.
 */
export function compactEvents(kmDir: string, db: Database): CompactionResult {
  const result = identifyStaleEvents(kmDir, db)

  if (result.staleCount > 0) {
    const eventsPath = join(kmDir, "events.jsonl")
    const lines = result.keptEvents.map((e) => JSON.stringify(e))
    writeFileSync(eventsPath, lines.join("\n") + (lines.length > 0 ? "\n" : ""))
  }

  return result
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

  // Events stats
  let events: StoreHealth["events"] = null
  const eventsPath = join(kmDir, "events.jsonl")
  if (existsSync(eventsPath)) {
    const size = statSync(eventsPath).size
    const allEvents = readEvents(kmDir)
    let staleCount = 0

    if (db) {
      const result = identifyStaleEvents(kmDir, db)
      staleCount = result.staleCount
    }

    events = { count: allEvents.length, staleCount, size }

    if (staleCount > 0) {
      issues.push(`${staleCount} stale events in events.jsonl\n` + `      Run 'km doctor gc' to compact`)
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

  return { worktree, events, db: dbInfo, issues }
}

/** Count files and directories in the worktree (respecting ignore patterns) */
function countWorktree(repoPath: string, _kmDir: string): { fileCount: number; dirCount: number } {
  let fileCount = 0
  let dirCount = 0

  const ignorePatterns = getIgnorePatterns(repoPath)

  function walk(dir: string): void {
    let entries: import("fs").Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true, encoding: "utf-8" })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (shouldIgnore(fullPath, ignorePatterns, repoPath)) continue

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
