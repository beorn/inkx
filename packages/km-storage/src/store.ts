/**
 * Store Abstraction Layer
 *
 * Split into focused modules:
 * - store-types.ts: NodeStore interface
 * - store-base.ts:  BaseStore abstract class (shared query methods)
 * - store-memory.ts: MemoryStore implementation (in-memory SQLite with filesystem scanning)
 *
 * This file re-exports legacy types and adds the new Store interface.
 */

export type { NodeStore } from "./store-types.ts"
export { MemoryStore } from "./store-memory.ts"

// NOTE: Singleton functions (initStore, getStore, closeStore) removed.
// Use createRepo() factory or instantiate MemoryStore/DiskStore directly.

// =============================================================================
// Store — minimal reactive store interface
// =============================================================================

import type { KNode, Event } from "@km/core"
import type { CommitMeta, CommitResult, RepoDelta } from "./commit-types.ts"
import { computeDelta } from "./commit-types.ts"
import type { Repo } from "./repo.ts"
import { ulid } from "ulid"

/**
 * Minimal store interface — what every store backend must provide.
 * The current Repo satisfies this via createStoreFromRepo().
 */
export interface Store {
  /** Local snapshot of a node, no loading side-effects */
  peekNode(id: string): KNode | null

  /** Child IDs of a parent, synchronous snapshot */
  peekChildIds(parentId: string): readonly string[]

  /** Apply a batch of events atomically, returning a CommitResult with delta */
  commit(events: readonly Omit<Event, "id" | "ts">[], meta?: Partial<CommitMeta>): CommitResult
}

/** Observable: subscribe to committed changes */
export interface Observable {
  onCommit(cb: (result: CommitResult) => void): () => void
}

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
 * Wrap an existing Repo as a Store & Observable.
 * This is additive — Repo stays unchanged. The wrapper delegates reads
 * to Repo's query methods and writes to Repo's apply() method.
 */
export function createStoreFromRepo(repo: Repo): Store & Observable {
  const listeners = new Set<(result: CommitResult) => void>()

  return {
    peekNode(id) {
      return repo.getNode(id)
    },

    peekChildIds(parentId) {
      return repo.getChildren(parentId).map((n) => n.id)
    },

    commit(events, meta?) {
      const appliedEvents: Event[] = []
      for (const event of events) {
        appliedEvents.push(repo.apply(event))
      }

      const delta = mergeDeltas(appliedEvents)
      const commitResult: CommitResult = {
        meta: {
          commitId: ulid(),
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
