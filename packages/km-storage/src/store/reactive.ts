/**
 * withReactive — Per-node reactive signals driven by RepoDelta.
 *
 * Subscribes to store commits, reads the delta, and updates the relevant
 * signals. Signals are lazy: created on first access, not eagerly for every node.
 *
 * Usage:
 *   const store = withReactive(createStoreFromRepo(repo))
 *   const nodeSignal = store.nodeState("abc")  // () => ResourceState<KNode>
 *   effect(() => {
 *     const state = nodeSignal()
 *     if (ResourceState.isLoaded(state)) render(state.value)
 *   })
 */

import type { Database } from "bun:sqlite"
import { signal, startBatch, endBatch } from "alien-signals"
import type { KNode } from "@km/core"
import type { Store, Observable } from "./store.ts"
import { ResourceState, type CommitResult, type LinkDelta } from "./commit-types.ts"
import { getBacklinksForNode, computeHrefsForNode, type KLink } from "../db/links.ts"

// =============================================================================
// Reactive interface
// =============================================================================

/** Read-only signal — call to get current value. */
export type ReadonlySignal<T> = () => T

export interface Reactive {
  /** Reactive state for a node. Creates signal on first access. */
  nodeState(id: string): ReadonlySignal<ResourceState<KNode>>

  /** Reactive child ID list for a parent. Creates signal on first access. */
  childIdsState(parentId: string): ReadonlySignal<ResourceState<readonly string[]>>

  /**
   * Reactive backlinks for a node — list of link-occurrence rows targeting it.
   * Requires a DB-backed reactive store (see `withReactive(store, { db })`).
   * Returns `unloaded` if the store wasn't constructed with a `db`.
   *
   * Invalidation fires when the commit delta carries link changes for any of
   * the node's hrefs (via `linkChanges.targetHrefs`) or when the node's own
   * content changes (its href set may have shifted — e.g. rename).
   */
  backlinksState(nodeId: string): ReadonlySignal<ResourceState<readonly KLink[]>>

  /**
   * Imperative notification path for link-table mutations that happen outside
   * `store.commit()` (e.g. reconciliation rewriting link rows). The reactive
   * layer uses this to invalidate affected backlink signals targetedly,
   * instead of forcing a broad refresh.
   */
  notifyLinkChange(delta: LinkDelta): void
}

/**
 * Optional options for `withReactive`. Pass `{ db }` when the underlying store
 * is SQLite-backed so `backlinksState` can issue indexed SQL queries. Without
 * it, the reactive layer falls back to a no-DB mode where `backlinksState`
 * stays at `unloaded`.
 */
export interface WithReactiveOptions {
  db?: Database
}

// =============================================================================
// withReactive decorator
// =============================================================================

type WritableSignal<T> = { (): T; (value: T): void }

/**
 * Add per-node reactive signals to a Store & Observable.
 *
 * Signal lifecycle:
 * - Created lazily on first nodeState(id) / childIdsState(parentId) call
 * - Updated in batch when onCommit fires (one notification per commit, not per-change)
 * - Deleted nodes get ResourceState.deleted(), not removed from map
 *   (consumers may still hold a reference and need to see the transition)
 */
export function withReactive<S extends Store & Observable>(
  store: S,
  options?: WithReactiveOptions,
): S & Reactive & Disposable {
  const nodeSignals = new Map<string, WritableSignal<ResourceState<KNode>>>()
  const childIdsSignals = new Map<string, WritableSignal<ResourceState<readonly string[]>>>()
  const backlinksSignals = new Map<string, WritableSignal<ResourceState<readonly KLink[]>>>()
  const db = options?.db

  /** Load backlinks for a node, falling back to unloaded when no DB is wired. */
  function loadBacklinks(nodeId: string): ResourceState<readonly KLink[]> {
    if (!db) return ResourceState.unloaded()
    try {
      const links = getBacklinksForNode(db, nodeId)
      return ResourceState.loaded(links)
    } catch (err) {
      return ResourceState.error(err)
    }
  }

  /**
   * Pick subset of backlink signals to refresh from a LinkDelta + node-content delta.
   *
   * Rules:
   *   - Any signal whose node id is in `delta.nodeIds` (content changed —
   *     its href set may have shifted, so recompute).
   *   - Any signal whose node's target hrefs intersect `linkChanges.targetHrefs`.
   *   - Any signal whose node is a host in `linkChanges.hostIds` (the node
   *     may have both outgoing and incoming links — conservative refresh).
   */
  function refreshBacklinksForDelta(nodeIds: readonly string[], linkChanges?: LinkDelta): void {
    if (backlinksSignals.size === 0) return
    const touchedTargets = new Set(linkChanges?.targetHrefs ?? [])
    const touchedHosts = new Set(linkChanges?.hostIds ?? [])
    const touchedNodes = new Set(nodeIds)

    for (const [id, sig] of backlinksSignals) {
      let shouldRefresh = touchedNodes.has(id) || touchedHosts.has(id)
      if (!shouldRefresh && touchedTargets.size > 0 && db) {
        const row = db.query("SELECT name, fs_path FROM nodes WHERE id = ?").get(id) as {
          name: string | null
          fs_path: string | null
        } | null
        if (row) {
          const hrefs = computeHrefsForNode(row)
          for (const h of hrefs) {
            if (touchedTargets.has(h)) {
              shouldRefresh = true
              break
            }
          }
        }
      }
      if (shouldRefresh) sig(loadBacklinks(id))
    }
  }

  // Subscribe to all commits — update affected signals from delta
  const unsubscribe = store.onCommit((result: CommitResult) => {
    const { delta } = result

    // Skip if no signals exist yet (nothing to update)
    if (nodeSignals.size === 0 && childIdsSignals.size === 0 && backlinksSignals.size === 0) return

    // Broad refresh: repo was mutated directly (not through store.commit),
    // so we don't know which specific nodes/parents changed. Refresh all signals.
    const isBroadRefresh = result.meta.source === "repo-direct"

    startBatch()
    try {
      if (isBroadRefresh) {
        // Refresh all node signals
        for (const [id, sig] of nodeSignals) {
          const node = store.peekNode(id)
          sig(node ? ResourceState.loaded(node) : ResourceState.unloaded())
        }
        // Refresh all child list signals
        for (const [parentId, sig] of childIdsSignals) {
          const ids = store.peekChildIds(parentId)
          sig(ResourceState.loaded(ids))
        }
        // Refresh all backlink signals
        for (const [id, sig] of backlinksSignals) {
          sig(loadBacklinks(id))
        }
      } else {
        // Targeted refresh: update only affected signals from delta
        for (const id of delta.nodeIds) {
          const sig = nodeSignals.get(id)
          if (sig) {
            const node = store.peekNode(id)
            sig(node ? ResourceState.loaded(node) : ResourceState.unloaded())
          }
        }

        for (const parentId of delta.parentIds) {
          const sig = childIdsSignals.get(parentId)
          if (sig) {
            const ids = store.peekChildIds(parentId)
            sig(ResourceState.loaded(ids))
          }
        }

        for (const id of delta.deletedNodeIds) {
          const sig = nodeSignals.get(id)
          if (sig) sig(ResourceState.deleted())
          // If a linked node disappeared, backlinks that mention it stale —
          // let the regular targeted refresh below handle that via linkChanges.
        }

        refreshBacklinksForDelta(delta.nodeIds, delta.linkChanges)
      }
    } finally {
      endBatch()
    }
  })

  // Chain dispose: clean up our subscription, then the underlying store's dispose if present
  const storeDispose = Symbol.dispose in store ? (store as Disposable)[Symbol.dispose] : undefined

  return {
    ...store,

    [Symbol.dispose]() {
      unsubscribe()
      // Drop signal maps so GC can reclaim the WritableSignal closures.
      // Alien-signals holds subscribers in a doubly-linked list on each signal;
      // breaking our strong refs lets untouched signals fall off.
      nodeSignals.clear()
      childIdsSignals.clear()
      backlinksSignals.clear()
      storeDispose?.()
    },

    nodeState(id: string): ReadonlySignal<ResourceState<KNode>> {
      let sig = nodeSignals.get(id)
      if (!sig) {
        const node = store.peekNode(id)
        sig = signal<ResourceState<KNode>>(node ? ResourceState.loaded(node) : ResourceState.unloaded())
        nodeSignals.set(id, sig)
      }
      return sig
    },

    childIdsState(parentId: string): ReadonlySignal<ResourceState<readonly string[]>> {
      let sig = childIdsSignals.get(parentId)
      if (!sig) {
        const ids = store.peekChildIds(parentId)
        sig = signal<ResourceState<readonly string[]>>(ResourceState.loaded(ids))
        childIdsSignals.set(parentId, sig)
      }
      return sig
    },

    backlinksState(nodeId: string): ReadonlySignal<ResourceState<readonly KLink[]>> {
      let sig = backlinksSignals.get(nodeId)
      if (!sig) {
        sig = signal<ResourceState<readonly KLink[]>>(loadBacklinks(nodeId))
        backlinksSignals.set(nodeId, sig)
      }
      return sig
    },

    notifyLinkChange(linkDelta: LinkDelta): void {
      if (backlinksSignals.size === 0) return
      startBatch()
      try {
        refreshBacklinksForDelta([], linkDelta)
      } finally {
        endBatch()
      }
    },
  }
}
