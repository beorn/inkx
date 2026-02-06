/**
 * Action Context
 *
 * Context object for action handlers. Built from the Zustand store
 * once per key event and passed to all handlers.
 *
 * Field names match BoardAppStore to eliminate the mapping layer.
 * Derived fields (column, card) are pre-computed for convenience.
 */

import type { KNode, ToastQueue } from "@km/core"
import type { Repo } from "./repo-context.tsx"
import type { BoardState, BoardAction } from "@km/board"
import type { ColumnsLayout, ColumnState, CardState } from "./types.ts"
import type { UIState, UIAction } from "./ui-reducer.ts"
import type { LayoutRegistry } from "./card-positions.ts"

/**
 * Context for all TUI action handlers.
 *
 * Built once per key event from the Zustand store, passed to all handlers.
 * Names align with BoardAppStore fields (no mapping layer).
 */
export interface ActionCtx {
  // === Storage ===
  repo: Repo

  // === State (from store, names match store fields) ===
  boardState: BoardState
  ui: UIState
  layout: ColumnsLayout
  layoutRegistry: LayoutRegistry
  toastQueue: ToastQueue

  // === Derived (computed once per key event) ===
  /** Currently selected node (null if none) */
  selectedNode: KNode | null
  /** Current column from layout */
  column: ColumnState | undefined
  /** Current card from layout */
  card: CardState | undefined

  // === Dispatchers ===
  /** Dispatch to UI reducer */
  dispatchUI: (action: UIAction) => void
  /** Dispatch to board reducer */
  dispatchBoard: (action: BoardAction) => void

  // === Lifecycle ===
  /** Exit the application */
  exit: () => void

  // === Utilities ===
  /** Count visible descendants for outline mode */
  countVisibleDescendants: (
    node: KNode,
    depth: number,
    maxDepth: number,
    foldedNodes: Set<string>,
  ) => number
}
