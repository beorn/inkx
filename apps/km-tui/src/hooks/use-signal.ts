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
import { useApp as useAppStore } from "@silvery/create/create-app"
import { usePaneId } from "../pane-context.tsx"
import type { PaneSignals } from "../state/pane-signals.ts"
import type { BoardAppStore } from "../state/board-app-store.ts"
import { isBoardPane, type BoardPaneState } from "../board/board-types.ts"
import type { ViewTreeProjection, ProjectedViewNode, ViewNodeState } from "@km/board"

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

// =============================================================================
// PaneSignals hooks
// =============================================================================

/**
 * Get the PaneSignals for the current pane (via PaneIdProvider context).
 * Returns the signal bag for this pane — use with useSignal() for reactive reads:
 *
 * ```tsx
 * const ps = usePaneSignals()
 * const rootId = useSignal(ps.rootId)
 * const view = useSignal(ps.view)
 * ```
 */
export function usePaneSignals(): PaneSignals {
  const paneId = usePaneId()
  return useAppStore<BoardAppStore, PaneSignals>((s) => {
    const p = s.workspace.panes.get(paneId) as BoardPaneState | undefined
    if (p && isBoardPane(p) && p.signals) return p.signals
    // Fallback: find any board pane with signals (shouldn't happen in practice)
    for (const pane of s.workspace.panes.values()) {
      if (isBoardPane(pane) && pane.signals) return pane.signals
    }
    throw new Error(`usePaneSignals: no PaneSignals for pane ${paneId}`)
  })
}

/**
 * Get the PaneSignals for the currently focused pane.
 * Used by workspace-level components (WorkspaceChrome) that track the active pane.
 */
export function useFocusedPaneSignals(): PaneSignals | null {
  return useAppStore<BoardAppStore, PaneSignals | null>((s) => {
    const p = s.workspace.panes.get(s.workspace.focusedPaneId) as BoardPaneState | undefined
    if (p && isBoardPane(p) && p.signals) return p.signals
    return null
  })
}

// =============================================================================
// ViewTree hooks
// =============================================================================

/**
 * Get the ViewTree for the current pane.
 *
 * The ViewTree provides tree-wide navigation (next, prev, nodes, walkOrder)
 * and per-node signal bags (via track/getProjected).
 *
 * For per-node reactive data, use useNode(id) instead.
 */
export function useViewTree(): ViewTreeProjection | null {
  const ps = usePaneSignals()
  return ps?.viewTree ?? null
}

/**
 * Subscribe to a single node's projected view state.
 *
 * Re-renders ONLY when this specific node's view state changes.
 * Returns a ViewNode with viewType, childIds, display, etc.
 *
 * @example
 * ```tsx
 * function Card({ id }: { id: string }) {
 *   const node = useNode(id)
 *   if (!node) return null
 *   return <Box>{node.display?.content}</Box>
 * }
 * ```
 */
export function useNode(id: string): ProjectedViewNode | null {
  const ps = usePaneSignals()
  const tree = ps?.viewTree
  if (!tree) return null

  // Track this node — creates signal bag on first access
  const proj = tree.track(id)
  if (!proj) return null

  // Subscribe to each signal via useSignal — React re-renders when any changes
  return {
    id,
    viewType: useSignal(proj.viewType),
    childIds: useSignal(proj.childIds),
    parentId: useSignal(proj.parentId),
    display: useSignal(proj.display),
    isBody: useSignal(proj.isBody),
    isEmbed: useSignal(proj.isEmbed),
    rules: useSignal(proj.rules),
    data: useSignal(proj.data),
  }
}
