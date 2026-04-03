/**
 * SQLite-backed Store & Observable implementation.
 *
 * Reads/writes directly to SQLite without requiring a Repo object.
 * Used as the foundation for the reactive store layer.
 */

import type { Database } from "bun:sqlite"
import type { KNode, Event } from "@km/core"
import type { Store, Observable } from "./store.ts"
import type { CommitMeta, CommitResult, RepoDelta } from "./commit-types.ts"
import { computeDelta } from "./commit-types.ts"
import { applyEventWithDb } from "./db-events.ts"
import { rowToNode } from "./db-queries/utils.ts"
import { ulid } from "ulid"

/**
 * Merge multiple per-event deltas into one aggregated RepoDelta.
 * Deduplicates IDs across the batch.
 */
function mergeDeltas(events: readonly Event[]): RepoDelta {
  const nodeIds = new Set<string>()
  const parentIds = new Set<string>()
  const deletedNodeIds = new Set<string>()

  for (const event of events) {
    const d = computeDelta(event)
    for (const id of d.nodeIds) nodeIds.add(id)
    for (const id of d.parentIds) parentIds.add(id)
    for (const id of d.deletedNodeIds) deletedNodeIds.add(id)
  }

  return {
    nodeIds: [...nodeIds],
    parentIds: [...parentIds],
    deletedNodeIds: [...deletedNodeIds],
  }
}

/**
 * Create a Store & Observable backed directly by SQLite.
 *
 * - peekNode: SELECT from nodes table, converted via rowToNode
 * - peekChildIds: SELECT child IDs ordered by parent_idx
 * - commit: applies events via applyEventWithDb, computes delta, notifies listeners
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

    commit(events, meta?) {
      const appliedEvents: Event[] = []
      for (const partial of events) {
        const event: Event = {
          ...partial,
          id: ulid(),
          ts: Date.now(),
        }
        applyEventWithDb(db, event)
        appliedEvents.push(event)
      }

      const delta = mergeDeltas(appliedEvents)
      const commitId = meta?.commitId ?? ulid()
      const commitResult: CommitResult = {
        meta: {
          commitId,
          source: meta?.source ?? "local",
          ...meta,
        },
        events: appliedEvents,
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
