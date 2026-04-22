/**
 * SyncState — Persisted content-hash baseline for bidirectional sync.
 *
 * Tracks what we last projected (wrote to FS) or observed (read from FS)
 * for each file path. This is the durable L2 backing store for
 * OwnershipTracker. The L1 in-memory cache is checked first for speed.
 *
 * Used to detect whether a file change is ours or external without
 * relying solely on volatile in-memory state.
 */

import { hashContent } from "../fs/cas.ts"
import type { Database } from "bun:sqlite"

export interface SyncStateEntry {
  fs_path: string
  node_id: string | null
  baseline_hash: string
  baseline_kind: "projected" | "observed"
  last_seen_mtime_ns: number | null
  dirty: boolean
}

export interface SyncState {
  /** Record that we projected these bytes to disk */
  recordProjection(fsPath: string, content: string, nodeId?: string): void

  /** Record that we observed and reconciled these bytes from disk */
  recordObservation(fsPath: string, content: string, nodeId?: string): void

  /** Check if file content matches our baseline (no-op if matches) */
  isOurs(fsPath: string, content: string): boolean

  /** Move baseline state on rename (don't re-read file) */
  renamePath(oldPath: string, newPath: string): void

  /** Cascade rename for folder subtree */
  renamePrefix(oldPrefix: string, newPrefix: string): void

  /** Remove state for deleted path */
  removePath(fsPath: string): void

  /** Mark path as dirty (needs re-projection) */
  markDirty(fsPath: string): void

  /** Get all dirty paths (for consistency heartbeat) */
  getDirtyPaths(): string[]

  /** Clear dirty flag after successful re-projection */
  clearDirty(fsPath: string): void

  /** Get entry for a path */
  get(fsPath: string): SyncStateEntry | null
}

export function createSyncState(db: Database): SyncState {
  // Prepare statements for hot-path operations
  const upsertStmt = db.prepare(
    `INSERT OR REPLACE INTO sync_state (fs_path, node_id, baseline_hash, baseline_kind, dirty)
     VALUES (?, ?, ?, ?, 0)`,
  )

  const selectHashStmt = db.prepare("SELECT baseline_hash FROM sync_state WHERE fs_path = ?")

  const renameStmt = db.prepare("UPDATE sync_state SET fs_path = ? WHERE fs_path = ?")

  const renamePrefixStmt = db.prepare(
    `UPDATE sync_state SET fs_path = ? || SUBSTR(fs_path, ?) WHERE fs_path LIKE ? || '/%'`,
  )

  const deleteStmt = db.prepare("DELETE FROM sync_state WHERE fs_path = ?")

  const markDirtyStmt = db.prepare("UPDATE sync_state SET dirty = 1 WHERE fs_path = ?")

  const getDirtyStmt = db.prepare("SELECT fs_path FROM sync_state WHERE dirty = 1")

  const clearDirtyStmt = db.prepare("UPDATE sync_state SET dirty = 0 WHERE fs_path = ?")

  const getStmt = db.prepare("SELECT * FROM sync_state WHERE fs_path = ?")

  return {
    recordProjection(fsPath: string, content: string, nodeId?: string): void {
      const hash = hashContent(content)
      upsertStmt.run(fsPath, nodeId ?? null, hash, "projected")
    },

    recordObservation(fsPath: string, content: string, nodeId?: string): void {
      const hash = hashContent(content)
      upsertStmt.run(fsPath, nodeId ?? null, hash, "observed")
    },

    isOurs(fsPath: string, content: string): boolean {
      const row = selectHashStmt.get(fsPath) as { baseline_hash: string } | null
      if (!row) return false
      return hashContent(content) === row.baseline_hash
    },

    renamePath(oldPath: string, newPath: string): void {
      renameStmt.run(newPath, oldPath)
    },

    renamePrefix(oldPrefix: string, newPrefix: string): void {
      renamePrefixStmt.run(newPrefix, oldPrefix.length + 1, oldPrefix)
    },

    removePath(fsPath: string): void {
      deleteStmt.run(fsPath)
    },

    markDirty(fsPath: string): void {
      markDirtyStmt.run(fsPath)
    },

    getDirtyPaths(): string[] {
      const rows = getDirtyStmt.all() as { fs_path: string }[]
      return rows.map((r) => r.fs_path)
    },

    clearDirty(fsPath: string): void {
      clearDirtyStmt.run(fsPath)
    },

    get(fsPath: string): SyncStateEntry | null {
      const row = getStmt.get(fsPath) as {
        fs_path: string
        node_id: string | null
        baseline_hash: string
        baseline_kind: string
        last_seen_mtime_ns: number | null
        dirty: number
      } | null
      if (!row) return null
      return {
        fs_path: row.fs_path,
        node_id: row.node_id,
        baseline_hash: row.baseline_hash,
        baseline_kind: row.baseline_kind as "projected" | "observed",
        last_seen_mtime_ns: row.last_seen_mtime_ns,
        dirty: row.dirty === 1,
      }
    },
  }
}
