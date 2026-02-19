/**
 * CursorStore — Lightweight pub/sub for cursor state.
 *
 * Separate from Zustand to allow cursor changes without triggering
 * Board re-renders. Only components that subscribe via useSyncExternalStore
 * (useIsCursorAtNode, useIsColumnSelectedByNode) re-render on cursor moves.
 *
 * This enables ~3ms j/k presses: only 2 Cards re-render instead of the
 * entire Board → Column → Card cascade.
 *
 * CursorState is just { cursorNodeId }. Position (colIndex/cardIndex) and
 * selection level are derived on demand from columns + cursorNodeId.
 */

export interface CursorState {
  cursorNodeId: string | null
}

export interface CursorStore {
  getState(): CursorState
  setState(state: CursorState): void
  /** Subscribe to cursor changes. Returns unsubscribe function. */
  subscribe(listener: () => void): () => void
  /** Version counter for useSyncExternalStore — increments on each setState */
  getSnapshot(): number
}

/**
 * Create a lightweight cursor store with pub/sub.
 */
export function createCursorStore(initial: CursorState): CursorStore {
  let state = initial
  let version = 0
  const listeners = new Set<() => void>()

  return {
    getState() {
      return state
    },
    setState(next: CursorState) {
      state = next
      version++
      for (const listener of listeners) {
        listener()
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return version
    },
  }
}
