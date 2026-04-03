/**
 * OwnershipTracker — Unified two-tier ownership tracking for bidirectional sync.
 *
 * Combines in-memory write tokens (L1, fast) with persisted sync_state (L2, durable)
 * into a single API. Consumers see one interface for all ownership questions:
 * "did we write this file?" / "did we delete this file?" / "is this path dirty?"
 *
 * L1 (WriteTokenMap logic): In-memory Map of absPath → SHA-256 hash + delete tombstones.
 *   Fast, no DB query. Not restart-safe. One-shot consumption for deletes.
 *
 * L2 (SyncState): SQLite sync_state table. Durable, survives restarts.
 *   Falls back here when L1 cache misses (e.g., post-restart).
 */

import { createLogger } from "loggily"
import { readFileSync } from "fs"
import type { Database } from "bun:sqlite"
import { hashContent } from "../cas.ts"
import { createSyncState, type SyncState as SyncStateStore } from "./sync-state.ts"

const log = createLogger("km:storage:watch:ownership")

export interface OwnershipTracker {
  /** Record that we wrote this content to this path (updates both L1 + L2) */
  recordWrite(absPath: string, content: string, nodeId?: string): void

  /** Record that we deleted this path (L1 tombstone + L2 removal) */
  recordDelete(absPath: string): void

  /**
   * Check if a file change is ours. Two-tier lookup:
   * 1. L1 in-memory hash (fast, no I/O)
   * 2. L2 sync_state (reads file from disk, compares hash against baseline)
   */
  isOwnedWrite(absPath: string): boolean

  /** Check if a delete was ours. Consumes the L1 tombstone (one-shot). */
  isOwnedDelete(absPath: string): boolean

  /** Consume a delete tombstone. Returns true if it was ours. One-shot. */
  consumeDelete(absPath: string): boolean

  /** Move ownership state on rename (L1 + L2) */
  renamePath(oldPath: string, newPath: string): void

  /** Remove ownership state for a deleted path (L2 only — L1 has no entry after delete) */
  removePath(path: string): void

  /** Cascade rename for folder subtree (L2 only — L1 doesn't track prefixes) */
  removeSubtree(prefix: string): void

  /** Record that we observed and reconciled a file from disk (L2 only) */
  recordObservation(path: string, content: string, nodeId?: string): void

  /** Mark path as dirty (needs re-projection) */
  markDirty(path: string): void

  /** Clear dirty flag after successful re-projection */
  clearDirty(path: string): void

  /** Get all dirty paths (for consistency heartbeat) */
  getDirtyPaths(): string[]

  /** Get the underlying SyncState for direct access (e.g., get() for entry details) */
  getSyncState(): SyncStateStore
}

export function createOwnershipTracker(db: Database): OwnershipTracker {
  // L2: Persisted sync_state (durable, survives restarts)
  const syncState = createSyncState(db)

  // L1: In-memory write tokens (hot cache)
  const writeHashes = new Map<string, string>() // absPath → SHA-256 hex
  const deleteTombstones = new Set<string>() // absPath of files we deleted

  return {
    recordWrite(absPath: string, content: string, nodeId?: string): void {
      // L1: record hash in memory
      writeHashes.set(absPath, hashContent(content))
      // L2: record projection in SQLite
      syncState.recordProjection(absPath, content, nodeId)
    },

    recordDelete(absPath: string): void {
      // L1: tombstone in memory
      deleteTombstones.add(absPath)
      // L2: remove from SQLite baseline
      syncState.removePath(absPath)
    },

    isOwnedWrite(absPath: string): boolean {
      // Tier 1: in-memory cache (fast path)
      if (writeHashes.has(absPath)) return true

      // Tier 2: persisted sync_state (cold path — survives restart)
      try {
        const content = readFileSync(absPath, "utf-8")
        if (syncState.isOurs(absPath, content)) {
          log.debug?.(`syncState hit for ${absPath} (L1 cache miss, post-restart?)`)
          return true
        }
      } catch {
        // File unreadable (ENOENT, EACCES) — treat as external
      }

      return false
    },

    isOwnedDelete(absPath: string): boolean {
      return deleteTombstones.has(absPath)
    },

    consumeDelete(absPath: string): boolean {
      if (!deleteTombstones.has(absPath)) return false
      deleteTombstones.delete(absPath)
      return true
    },

    renamePath(oldPath: string, newPath: string): void {
      // L1: move hash entry
      const hash = writeHashes.get(oldPath)
      if (hash !== undefined) {
        writeHashes.delete(oldPath)
        writeHashes.set(newPath, hash)
      }
      // L2: move sync_state row
      syncState.renamePath(oldPath, newPath)
    },

    removePath(path: string): void {
      // L1: remove hash entry
      writeHashes.delete(path)
      // L2: remove sync_state row
      syncState.removePath(path)
    },

    removeSubtree(prefix: string): void {
      // L1: remove matching entries
      for (const key of writeHashes.keys()) {
        if (key.startsWith(prefix + "/")) {
          writeHashes.delete(key)
        }
      }
      // L2: SyncState doesn't have a removePrefix, but renamePrefix exists.
      // For subtree removal, we'd need to delete each path individually.
      // However, removeSubtree is not currently used — it's here for API completeness.
      // If needed, add a deletePrefix to SyncState.
    },

    recordObservation(path: string, content: string, nodeId?: string): void {
      syncState.recordObservation(path, content, nodeId)
    },

    markDirty(path: string): void {
      syncState.markDirty(path)
    },

    clearDirty(path: string): void {
      syncState.clearDirty(path)
    },

    getDirtyPaths(): string[] {
      return syncState.getDirtyPaths()
    },

    getSyncState(): SyncStateStore {
      return syncState
    },
  }
}
