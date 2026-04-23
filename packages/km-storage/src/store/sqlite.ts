/**
 * SQLite-backed Store & Observable implementation.
 *
 * Reads/writes directly to SQLite without requiring a Repo object.
 * Used as the foundation for the reactive store layer.
 */

import type { Database } from "bun:sqlite"
import type { Change } from "@km/core"
import type { Store, Observable } from "./store.ts"
import type { CommitResult } from "./commit-types.ts"
import { mergeDeltas } from "./commit-types.ts"
import { applyChangeWithDb } from "../db/changes.ts"
import { rowToNode } from "../db/queries/utils.ts"
import { ulid } from "ulid"

/**
 * Create a Store & Observable backed directly by SQLite.
 *
 * - peekNode: SELECT from nodes table, converted via rowToNode
 * - peekChildIds: SELECT child IDs ordered by parent_idx
 * - commit: applies events via applyChangeWithDb, computes delta, notifies listeners
 */
export function createSQLiteStore(db: Database): Store & Observable {
  const listeners = new Set<(result: CommitResult) => void>()

  return {
    peekNode(id) {
      const row = db.query("SELECT * FROM nodes WHERE id = ?").get(id) as Record<string, unknown> | null
      if (!row) return null
      return rowToNode(row)
    },

    peekChildIds(parentId) {
      const rows = db
        .query("SELECT id FROM nodes WHERE parent_id = ? ORDER BY parent_idx, created_at")
        .all(parentId) as { id: string }[]
      return rows.map((r) => r.id)
    },

    commit(changes, meta?) {
      const applied: Change[] = []
      for (const partial of changes) {
        const change: Change = {
          ...partial,
          id: ulid(),
          ts: Date.now(),
        }
        applyChangeWithDb(db, change)
        applied.push(change)
      }

      const delta = mergeDeltas(applied)
      const commitId = meta?.commitId ?? ulid()
      const commitResult: CommitResult = {
        meta: {
          ...meta,
          commitId,
          source: meta?.source ?? "local",
        },
        changes: applied,
        delta,
      }

      for (const cb of listeners) cb(commitResult)
      return commitResult
    },

    onCommit(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}
