/**
 * Bridge between alien-signals and React.
 *
 * useSignal(sig) subscribes to an alien-signals signal and triggers
 * React re-renders when the signal value changes. Built on useSyncExternalStore.
 *
 * Usage:
 *   const store = withReactive(createStoreFromRepo(repo))
 *   const node = useNodeSignal(store, nodeId)  // ResourceState<KNode>
 */

import { useSyncExternalStore } from "react"
import { effect } from "alien-signals"
import type { KNode } from "@km/core"
import { ResourceState, type Reactive, type ReadonlySignal } from "@km/storage"

/**
 * Subscribe to an alien-signals signal in React.
 * Re-renders only when this specific signal changes.
 */
export function useSignal<T>(sig: ReadonlySignal<T>): T {
  return useSyncExternalStore(
    (onStoreChange) =>
      effect(() => {
        sig()
        onStoreChange()
      }),
    () => sig(),
  )
}

/**
 * Subscribe to a node's reactive state. Returns ResourceState<KNode>.
 * Re-renders only when this specific node changes — not on every repo mutation.
 */
export function useNodeSignal(store: Reactive, id: string): ResourceState<KNode> {
  const sig = store.nodeState(id)
  return useSignal(sig)
}

/**
 * Subscribe to a parent's child IDs. Returns ResourceState<readonly string[]>.
 * Re-renders only when children of this parent change.
 */
export function useChildIdsSignal(store: Reactive, parentId: string): ResourceState<readonly string[]> {
  const sig = store.childIdsState(parentId)
  return useSignal(sig)
}
