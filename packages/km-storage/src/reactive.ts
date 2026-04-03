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

import { signal, startBatch, endBatch } from "alien-signals"
import type { KNode } from "@km/core"
import type { Store, Observable } from "./store.ts"
import { ResourceState, type CommitResult } from "./commit-types.ts"

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
 * - Updated in batch when onCommit fires (one notification per commit, not per-event)
 * - Deleted nodes get ResourceState.deleted(), not removed from map
 *   (consumers may still hold a reference and need to see the transition)
 */
export function withReactive<S extends Store & Observable>(store: S): S & Reactive & Disposable {
  const nodeSignals = new Map<string, WritableSignal<ResourceState<KNode>>>()
  const childIdsSignals = new Map<string, WritableSignal<ResourceState<readonly string[]>>>()

  // Subscribe to all commits — update affected signals from delta
  const unsubscribe = store.onCommit((result: CommitResult) => {
    const { delta } = result

    // Skip if no signals exist yet (nothing to update)
    if (nodeSignals.size === 0 && childIdsSignals.size === 0) return

    startBatch()
    try {
      // Update node content signals
      for (const id of delta.nodeIds) {
        const sig = nodeSignals.get(id)
        if (sig) {
          const node = store.peekNode(id)
          sig(node ? ResourceState.loaded(node) : ResourceState.unloaded())
        }
      }

      // Update child list signals
      for (const parentId of delta.parentIds) {
        const sig = childIdsSignals.get(parentId)
        if (sig) {
          const ids = store.peekChildIds(parentId)
          sig(ResourceState.loaded(ids))
        }
      }

      // Mark deleted nodes
      for (const id of delta.deletedNodeIds) {
        const sig = nodeSignals.get(id)
        if (sig) sig(ResourceState.deleted())
      }
    } finally {
      endBatch()
    }
  })

  return {
    ...store,

    [Symbol.dispose]() {
      unsubscribe()
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
  }
}
