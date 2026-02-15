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
import type { BoardAction, NavHistoryEntry } from "./board-types.ts"
import type { ColumnsLayout, ColumnState, CardState } from "./types.ts"
import type { UIState } from "./ui-reducer.ts"
import type { GridNavigator } from "@km/board"
import type { ViewNavigation } from "./view-navigation.ts"
import type { UndoStack } from "./undo-stack.ts"

/**
 * Context for all TUI action handlers.
 *
 * Built once per key event from the Zustand store, passed to all handlers.
 * Names align with BoardAppStore fields (no mapping layer).
 */
export interface ActionCtx {
  // === Storage ===
  repo: Repo

  // === Board navigation (flat fields from store) ===
  rootId: string | null
  rootPath: string | null
  cursorNodeId: string | null
  selectedNodes: Set<string>
  foldedNodes: Set<string>
  collapsedNodes: Set<string>
  moveMode: boolean
  moveSourceNodes: string[]
  moveSourceCursorNodeId: string | null
  maxOutlineDepth: number
  maxContentLines: number
  curswantX: number | null
  curswantY: number | null
  navHistory: NavHistoryEntry[]
  navHistoryIndex: number

  // === State (from store) ===
  ui: UIState
  layout: ColumnsLayout
  navigator: GridNavigator
  viewNavigation: ViewNavigation
  toastQueue: ToastQueue

  // === Derived (computed once per key event) ===
  /** Currently selected node (null if none) */
  selectedNode: KNode | null
  /** Current column from layout */
  column: ColumnState | undefined
  /** Current card from layout */
  card: CardState | undefined

  // === Dispatchers ===
  /** Dispatch to board state (for SELECT, ZOOM_IN, MOVE, etc.) */
  dispatchBoard: (action: BoardAction) => void
  /** Set UI fields directly (partial update, shallow merge) */
  setUI: (partial: Partial<UIState> | ((prev: UIState) => Partial<UIState>)) => void
  /** Set foldedNodes (single source of truth at store root) */
  setFoldedNodes: (nodes: Set<string>) => void

  // === Undo/Redo ===
  /** Undo stack for reversible operations */
  undoStack: UndoStack

  // === Lifecycle ===
  /** Exit the application */
  exit: () => void

  // === Utilities ===
  /** Count visible descendants for outline mode */
  countVisibleDescendants: (node: KNode, depth: number, maxDepth: number, foldedNodes: Set<string>) => number
}
