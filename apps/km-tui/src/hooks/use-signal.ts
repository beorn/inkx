/**
 * Bridge between alien-signals and React.
 *
 * useSignal(sig) subscribes to an alien-signals signal/computed and triggers
 * React re-renders when the signal value changes. Built on useSyncExternalStore.
 *
 * Handles both writable signals `{ (): T; (value: T): void }` and
 * read-only computed `() => T` via TypeScript overloads.
 */

import { useCallback, useRef, useSyncExternalStore } from "react"
import { effect } from "alien-signals"
import type { KNode } from "@km/core"
import { ResourceState, type Observable, type Reactive, type ReadonlySignal } from "@km/storage"

/**
 * Subscribe to an alien-signals signal in React.
 * Re-renders only when this specific signal changes.
 *
 * Overloads ensure correct type inference for both writable signals
 * (which have `(): T` and `(value: T): void` overloads) and computed signals.
 */
// Overload: writable alien-signals signal
export function useSignal<T>(sig: { (): T; (value: T): void }): T
// Overload: read-only signal (computed, or any () => T)
export function useSignal<T>(sig: () => T): T
// Implementation
export function useSignal<T>(sig: () => T): T {
  // Keep a ref to the signal so the subscribe callback is stable (never changes).
  // This prevents useSyncExternalStore from re-subscribing on every render.
  const sigRef = useRef(sig)
  sigRef.current = sig

  // Stable subscribe: creates an alien-signals effect that notifies React on change.
  // The effect fires immediately on creation (alien-signals standard behavior),
  // so we guard with `mounted` to skip the initial invocation.
  const subscribe = useCallback((onStoreChange: () => void) => {
    let mounted = false
    const cleanup = effect(() => {
      sigRef.current() // track signal dependency
      if (mounted) onStoreChange()
    })
    mounted = true
    return cleanup
  }, [])

  return useSyncExternalStore(subscribe, () => sig())
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

/**
 * Subscribe to ALL commits via store.onCommit. Returns a monotonic version counter.
 * Use for components that need to react to any structural change (e.g., column derivation).
 * Prefer useNodeSignal/useChildIdsSignal for narrower subscriptions.
 */
export function useCommitVersion(store: Observable): number {
  const versionRef = useRef(0)

  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      store.onCommit(() => {
        versionRef.current++
        onStoreChange()
      }),
    [store],
  )

  const getSnapshot = useCallback(() => versionRef.current, [])

  return useSyncExternalStore(subscribe, getSnapshot)
}
