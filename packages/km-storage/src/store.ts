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
import type { CommitMeta, CommitResult, RepoDelta, ChangeEnvelope } from "./commit-types.ts"
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
 * Replicated: move committed changes between stores.
 *
 * getChanges(since?) returns committed envelopes since a cursor.
 * applyChanges() imports envelopes from another store.
 *
 * For mem↔sqlite sync: C = Event (identity mapping).
 * For FS sync: C is domain-specific (markdown codec).
 * For Automerge: C is Automerge changes (CRDT-native).
 */
export interface Replicated<C = Event> {
  getChanges(since?: string): readonly ChangeEnvelope<C>[]
  applyChanges(changes: readonly ChangeEnvelope<C>[]): CommitResult
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
 * Wrap an existing Repo as a Store & Observable & Replicated.
 * This is additive — Repo stays unchanged. The wrapper delegates reads
 * to Repo's query methods and writes to Repo's apply() method.
 *
 * Also maintains a committed change log for replication.
 */
export function createStoreFromRepo(repo: Repo): Store & Observable & Replicated {
  const listeners = new Set<(result: CommitResult) => void>()
  const changeLog: ChangeEnvelope[] = []

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
      const commitId = meta?.commitId ?? ulid()
      const commitResult: CommitResult = {
        meta: {
          ...meta,
          commitId,
          source: meta?.source ?? "local",
        },
        events: appliedEvents,
        delta,
      }

      // Record in change log for replication
      changeLog.push({
        commitId,
        source: commitResult.meta.source,
        actorId: commitResult.meta.actorId,
        basis: commitResult.meta.basis,
        changes: appliedEvents,
      })

      for (const cb of listeners) cb(commitResult)
      return commitResult
    },

    onCommit(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },

    getChanges(since?) {
      if (!since) return changeLog
      const idx = changeLog.findIndex((e) => e.commitId === since)
      return idx === -1 ? changeLog : changeLog.slice(idx + 1)
    },

    applyChanges(changes) {
      if (changes.length === 0) return { meta: { commitId: ulid(), source: "remote" }, events: [], delta: { nodeIds: [], parentIds: [], deletedNodeIds: [] } }

      const allEvents: Event[] = []
      for (const envelope of changes) {
        for (const event of envelope.changes) {
          allEvents.push(repo.apply(event))
        }
      }

      const delta = mergeDeltas(allEvents)
      const source = changes[0]?.source ?? "remote"
      const commitId = ulid()
      const commitResult: CommitResult = {
        meta: { commitId, source },
        events: allEvents,
        delta,
      }

      // Record imported changes
      changeLog.push({
        commitId,
        source,
        changes: allEvents,
      })

      for (const cb of listeners) cb(commitResult)
      return commitResult
    },
  }
}
