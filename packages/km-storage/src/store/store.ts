/**
 * Store Abstraction Layer
 *
 * Trait-based interfaces (Store, Observable, Replicated) + createStoreFromRepo wrapper.
 * Also re-exports NodeStore and MemoryStore for backwards compatibility.
 */

export type { NodeStore } from "./types.ts"
export { MemoryStore } from "./memory.ts"

// =============================================================================
// Store — minimal reactive store interface
// =============================================================================

import type { KNode, Change } from "@km/core"
import type { CommitMeta, CommitResult, ChangeEnvelope } from "./commit-types.ts"
import { mergeDeltas } from "./commit-types.ts"
import type { Repo } from "../repo/repo.ts"
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

  /** Apply a batch of changes atomically, returning a CommitResult with delta */
  commit(changes: readonly Omit<Change, "id" | "ts">[], meta?: Partial<CommitMeta>): CommitResult
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
 * For mem↔sqlite sync: C = Change (identity mapping).
 * For FS sync: C is domain-specific (markdown codec).
 * For Automerge: C is Automerge changes (CRDT-native).
 */
export interface Replicated<C = Change> {
  getChanges(since?: string): readonly ChangeEnvelope<C>[]
  applyChanges(changes: readonly ChangeEnvelope<C>[]): CommitResult
}

/**
 * Wrap an existing Repo as a Store & Observable & Replicated.
 * This is additive — Repo stays unchanged. The wrapper delegates reads
 * to Repo's query methods and writes to Repo's apply() method.
 *
 * Also maintains a committed change log for replication.
 */
export function createStoreFromRepo(repo: Repo): Store & Observable & Replicated & Disposable {
  const listeners = new Set<(result: CommitResult) => void>()
  const changeLog: ChangeEnvelope[] = []

  // Track whether the last mutation went through store.commit() to avoid
  // double-notifying for the same change. When repo is mutated directly
  // (not through store.commit), we still need to fire onCommit so signals update.
  let inCommit = false

  // Pre-bind a prepared SQL statement for child-id lookups when the repo
  // exposes a real database (not FakeRepo, which sets `database: null`).
  // This is the lazy-hydration hot path: O(log N) indexed read instead of
  // fetching full KNode rows for every child just to project their ids.
  const childIdsStmt = repo.database
    ? repo.database.prepare("SELECT id FROM nodes WHERE parent_id = ? ORDER BY parent_idx, created_at")
    : null

  const unsubRepo = repo.subscribe(() => {
    if (inCommit) return // Already notified via store.commit()
    // Repo was mutated directly (e.g., repo.moveNode/addNode/updateNode).
    // Fire a broad onCommit so reactive signals can refresh.
    const broadResult: CommitResult = {
      meta: { commitId: ulid(), source: "repo-direct" },
      changes: [],
      delta: { nodeIds: [], parentIds: ["__all__"], deletedNodeIds: [] },
    }
    for (const cb of listeners) cb(broadResult)
  })

  return {
    [Symbol.dispose]() {
      unsubRepo()
    },

    peekNode(id) {
      return repo.getNode(id)
    },

    peekChildIds(parentId) {
      if (childIdsStmt) {
        const rows = childIdsStmt.all(parentId) as { id: string }[]
        return rows.map((r) => r.id)
      }
      // Fallback for FakeRepo / bare repos without a SQLite handle —
      // goes through the DataStore / in-memory map implementation.
      return repo.getChildren(parentId).map((n) => n.id)
    },

    commit(changes, meta?) {
      inCommit = true
      try {
        const appliedChanges: Change[] = []
        for (const change of changes) {
          appliedChanges.push(repo.apply(change))
        }

        const delta = mergeDeltas(appliedChanges)
        const commitId = meta?.commitId ?? ulid()
        const commitResult: CommitResult = {
          meta: {
            ...meta,
            commitId,
            source: meta?.source ?? "local",
          },
          changes: appliedChanges,
          delta,
        }

        // Record in change log for replication
        changeLog.push({
          commitId,
          source: commitResult.meta.source,
          actorId: commitResult.meta.actorId,
          basis: commitResult.meta.basis,
          changes: appliedChanges,
        })

        for (const cb of listeners) cb(commitResult)
        return commitResult
      } finally {
        inCommit = false
      }
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

    applyChanges(envelopes) {
      if (envelopes.length === 0) {
        return {
          meta: { commitId: ulid(), source: "remote" },
          changes: [],
          delta: { nodeIds: [], parentIds: [], deletedNodeIds: [] },
        }
      }

      inCommit = true
      try {
        const allChanges: Change[] = []
        for (const envelope of envelopes) {
          for (const change of envelope.changes) {
            allChanges.push(repo.apply(change))
          }
        }

        const delta = mergeDeltas(allChanges)
        const source = envelopes[0]?.source ?? "remote"
        const commitId = ulid()
        const commitResult: CommitResult = {
          meta: { commitId, source },
          changes: allChanges,
          delta,
        }

        // Record imported changes
        changeLog.push({
          commitId,
          source,
          changes: allChanges,
        })

        for (const cb of listeners) cb(commitResult)
        return commitResult
      } finally {
        inCommit = false
      }
    },
  }
}
