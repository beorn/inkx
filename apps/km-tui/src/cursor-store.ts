import { buildViewTree, buildViewIndex, classifyCursorFromViewIndex, type ViewTreeRepo } from "@km/board"

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
 * CursorState holds cursorNodeId plus derived ancestor IDs (card, column).
 * Ancestors are derived from the ViewNode tree (classifyCursorFromViewIndex)
 * when the cursor changes — components use them for self-selection without
 * needing layout derivation.
 */

export interface CursorState {
  cursorNodeId: string | null
  /** The card-level ancestor of cursorNodeId (grandchild of rootId), or null */
  cursorCardNodeId: string | null
  /** The column-level ancestor of cursorNodeId (child of rootId), or null */
  cursorColumnNodeId: string | null
  /** Selection level: where in the tree hierarchy the cursor sits */
  selectionLevel: "board" | "column" | "card"
  /** Column index in the layout (cached from last deriveCursorIndices call, -1 if unknown) */
  colIndex?: number
  /** Card index within the column (cached from last deriveCursorIndices call, -1 if unknown) */
  cardIndex?: number
  /** Whether the cursor is at card level (cached from last deriveCursorIndices call) */
  isAtCardLevel?: boolean
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
 * Create a CursorStore from a repo + root/cursor IDs, deriving ancestors automatically
 * via the ViewNode tree. Eliminates boilerplate at each call site.
 */
export function createCursorStoreFromRepo(
  repo: ViewTreeRepo,
  rootId: string | null,
  cursorNodeId: string | null,
): CursorStore {
  const vTree = buildViewTree(repo, rootId, new Map())
  const vIndex = buildViewIndex(vTree)
  return createCursorStore({
    cursorNodeId,
    ...classifyCursorFromViewIndex(vIndex, cursorNodeId),
  })
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
