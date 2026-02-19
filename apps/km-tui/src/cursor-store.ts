/**
 * CursorStore — Lightweight pub/sub for cursor state.
 *
 * Separate from Zustand to allow cursor changes without triggering
 * Board re-renders. Only components that subscribe via useSyncExternalStore
 * (useIsCursorAtCard, useIsCursorInColumn, useIsCursorAtNode) re-render on
 * cursor moves.
 *
 * This enables ~3ms j/k presses: only 2 Cards re-render instead of the
 * entire Board → Column → Card cascade.
 *
 * NODE MODEL V2: cursorNodeId is data model (keeps). colIndex/cardIndex are
 * view model (derived from cursorNodeId + columns). selectionLevel is view
 * model (derived from node type via isItem()). Target: CursorState = just
 * { cursorNodeId: string | null }, with position derived on demand.
 *
 * Phase 1 additions: cursorCardNodeId and cursorColumnNodeId allow cards and
 * columns to self-select by nodeId (useIsCursorAtNode) instead of positional
 * indices (useIsCursorAtCard). This decouples rendering from layout derivation.
 */

export interface CursorState {
  cursorNodeId: string | null
  /** The node ID of the card the cursor is in (null if at column/board level) */
  cursorCardNodeId: string | null
  /** The node ID of the column the cursor is in (null if at board level) */
  cursorColumnNodeId: string | null
  colIndex: number
  cardIndex: number
  selectionLevel: "board" | "column" | "card"
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
