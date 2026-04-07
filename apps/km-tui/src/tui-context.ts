/**
 * Action Context
 *
 * Context object for action handlers. Built from the signal store
 * once per key event and passed to all handlers.
 *
 * Field names match BoardAppStore to eliminate the mapping layer.
 * Derived fields (column, card) are pre-computed for convenience.
 */

import type { KNode, ToastQueue } from "@km/core"
import type { FocusManager } from "@silvery/ag-react"
import type { SelectionStore } from "@silvery/selection"
import type { Repo } from "./repo-context.tsx"
import type { BoardReducerOp } from "./board/board-types.ts"
import { PaneUI } from "./state/ui-reducer.ts"
import type { EditMode } from "./state/ui-reducer.ts"
import type { GridNavigator, ViewTreeProjection } from "@km/board"
import type { ViewNavigation } from "./navigation/view-navigation.ts"
import type { UndoStack } from "./undo-stack.ts"
import type { UndoableRepoHandle } from "./undo/undoable-repo.ts"

/**
 * Context for all TUI action handlers.
 *
 * Built once per key event from the signal store, passed to all handlers.
 * Names align with BoardAppStore fields (no mapping layer).
 */
export interface OpCtx {
  // === Storage ===
  repo: Repo

  // === Selection (@silvery/selection store) ===
  sel: SelectionStore
  /** Selected node IDs from sel.node.ids (for getSelectedNodes() etc.)
   * OrderedSet has .length (array) — we alias .size = .length for compatibility. */
  selectedIds: {
    readonly size: number
    readonly length: number
    has(id: string): boolean
    [Symbol.iterator](): Iterator<string>
  }
  /** Transient km-specific text editing hints (block index, initial cursor pos).
   * Complements sel.text() which owns nodeId + offset. */
  textEditHints: TextEditHints | null

  // === Board navigation (flat fields from store) ===
  rootId: string | null
  rootPath: string | null
  /** Cursor node ID — reads from sel.node.cursor(). */
  cursor: string | null
  /** Current card containing the cursor (from layout derivation). Used as symlink-aware
   * hint — data model parent chain may lead to the wrong card for symlinks. */
  cursorCardNodeId: string | null
  foldDepths: Map<string, number>
  collapsedNodes: Set<string>
  /** Sticky folds — per-node pins that survive fold-all/unfold-all. */
  stickyFolds: Map<string, "folded" | "unfolded">
  moveState: import("./board/board-types.ts").MoveState

  // === State (merged global + per-pane) ===
  ui: PaneUI
  navigator: GridNavigator
  viewNavigation: ViewNavigation
  toastQueue: ToastQueue

  // === Layout (derived fresh each key event) ===
  /** Current column node ID (null when no column exists) */
  columnId: string | null
  colIndex: number
  cardIndex: number
  isAtCardLevel: boolean
  nodeIndex: Map<string, { colIndex: number; cardIndex: number }>
  /** ViewTreeProjection — per-node navigation (next/prev/parent/children/node).
   * Primary tree API for all action handlers and invariants. */
  tree: ViewTreeProjection

  // === Derived (computed once per key event) ===
  /** Currently selected node (null if none) */
  selectedNode: KNode | null
  /** Current card from layout (null when cursor is at column level or no card exists) */
  card: KNode | undefined

  // === Dispatchers ===
  /** Dispatch to board state (for SELECT, ZOOM_IN, MOVE, etc.) */
  dispatchBoard: (action: BoardReducerOp) => void
  /** Set UI fields directly (partial update, shallow merge). Routes per-pane fields to pane state. */
  setUI: (partial: Partial<PaneUI> | ((prev: PaneUI) => Partial<PaneUI>)) => void
  /** Set foldDepths (single source of truth at store root) */
  setFoldDepths: (depths: Map<string, number>) => void

  // === Sticky folds ===
  /** Pin a node as sticky-folded or sticky-unfolded (persisted). */
  setStickyFold: (nodeId: string, state: "folded" | "unfolded") => void
  /** Remove a node's sticky fold state. */
  removeStickyFold: (nodeId: string) => void
  /** Check whether a node currently has any sticky fold state. */
  isStickyFold: (nodeId: string) => boolean

  // === Undo/Redo ===
  /** Undo stack for reversible operations */
  undoStack: UndoStack
  /** Undoable repo handle for batching and cursor state */
  undoHandle: UndoableRepoHandle

  // === Lifecycle ===
  /** Exit the application */
  exit: () => void

  // === Focus ===
  /** The tree-based focus manager */
  focusManager: FocusManager
  /** Convenience: focus a node by testID */
  focus: (testID: string) => void
  /** Activate a peer focus scope (saves/restores focus per scope) */
  activateScope: (scopeId: string) => void
  /** Sync the focus scope to the current workspace focusedPaneId. Call after pane switching. */
  syncFocusScope: () => void
  /** Whether the detail pane exists as a workspace pane */
  hasDetailPane: boolean

  // === Detail pane cursor ===
  /** Get the detail pane cursor ID (from detail view pane's sel.node.cursor()) */
  getDetailCursorId: () => string | null
  /** Set the detail pane cursor ID */
  setDetailCursor: (id: string | null) => void

  // === Workspace pane operations ===
  /** Open the detail pane (adds pane to workspace, updates layout) */
  openDetailPane: () => void
  /** Close the detail pane (removes pane from workspace, restores layout) */
  closeDetailPane: () => void
  /** Toggle the detail pane open/closed */
  toggleDetailPane: () => void

  // === Workspace pane operations (Phase 3: splitting) ===
  /** Split the focused pane in the given layout direction ("h" = side by side, "v" = stacked) */
  splitFocusedPane: (direction: "h" | "v") => void
  /** Close the focused pane (if more than one pane exists) */
  closeFocusedPane: () => void

  // === Workspace pane operations (Phase 4: focus navigation) ===
  /** Move focus to an adjacent pane in the given direction */
  focusPaneInDirection: (direction: "left" | "right" | "up" | "down") => void
  /** Toggle focus between current and previous pane */
  focusPreviousPane: () => void
  /** Cycle focus to next/prev pane in tab order */
  cyclePaneFocus: (direction: "next" | "prev") => void
  /** Jump focus to pane by number (1-indexed, based on tab order) */
  focusPaneByNumber: (number: number) => void
  /** Focus a specific pane by ID (updates workspace.focusedPaneId + saves/restores state) */
  focusPaneById: (paneId: string) => void

  // === Workspace pane operations (Phase 5: resize, zoom, close-all, swap) ===
  /** Resize the focused pane by delta on the given axis */
  resizeFocusedPane: (delta: number, axis: "h" | "v") => void
  /** Set all pane splits to equal sizes */
  equalizePanes: () => void
  /** Toggle zoom/maximize the focused pane */
  zoomFocusedPane: () => void
  /** Close all panes except the focused one */
  closeAllButFocused: () => void
  /** Swap the focused pane with its neighbor in the given direction */
  swapPaneInDirection: (direction: "left" | "right" | "up" | "down") => void

  // === Workspace pane operations (Phase 6: pane-aware navigation) ===
  /** Change the focused pane's viewType from "empty" to "board" */
  activateEmptyPane: () => void
  /** Get the focused pane's viewType */
  focusedPaneViewType: () => "board" | "detail" | "empty"
  /** Get the current focused pane ID from workspace state */
  focusedPaneId: () => string
  /** Get the parent pane ID when focused on a detail pane (null otherwise) */
  getParentPaneId: () => string | null

  // === Utilities ===
}

// ===== Delegated keys (pure pass-throughs from store) =====

/** Keys of OpCtx that are delegated directly from the store with no transformation. */
export const DELEGATED_OP_CTX_KEYS = [
  "dispatchBoard",
  "setUI",
  "setFoldDepths",
  "setStickyFold",
  "removeStickyFold",
  "isStickyFold",
  "getDetailCursorId",
  "setDetailCursor",
  "openDetailPane",
  "closeDetailPane",
  "toggleDetailPane",
  "splitFocusedPane",
  "closeFocusedPane",
  "focusPaneInDirection",
  "focusPreviousPane",
  "cyclePaneFocus",
  "focusPaneByNumber",
  "focusPaneById",
  "resizeFocusedPane",
  "equalizePanes",
  "zoomFocusedPane",
  "closeAllButFocused",
  "swapPaneInDirection",
  "activateEmptyPane",
] as const satisfies readonly (keyof OpCtx)[]

/** Union type of delegated OpCtx keys. */
export type DelegatedOpCtxKeys = (typeof DELEGATED_OP_CTX_KEYS)[number]

// ===== Mode helpers =====

/** Get the current editing mode */
export function currentMode(ctx: OpCtx): EditMode {
  return PaneUI.editMode(ctx.ui, ctx.sel.text() !== null)
}

/**
 * Transient km-specific text editing hints.
 * Lives alongside sel.text() which owns nodeId and cursor offset.
 * These hints control which block within a node to edit and initial cursor placement.
 */
export interface TextEditHints {
  /** Which block to edit: 0 = title, 1+ = body child at index (blockIndex - 1) */
  blockIndex: number
  /** Initial cursor placement hint (consumed once on mount) */
  initialCursorPos?: "start" | "end" | number
  /** Sticky X column for vertical cursor movement */
  stickyX?: number
}

/** Enter text editing mode on a node */
export function enterTextMode(
  ctx: OpCtx,
  nodeId: string,
  blockIndex = 0,
  initialCursorPos?: "start" | "end" | number,
): void {
  const offset = initialCursorPos === "end" ? -1 : typeof initialCursorPos === "number" ? initialCursorPos : 0
  ctx.sel.text.edit(nodeId as import("@silvery/selection").ID, offset)
  // Store km-specific block hints
  ctx.textEditHints = { blockIndex, initialCursorPos }
}

/** Exit text editing mode (save is handled by the EditContext cleanup) */
export function exitTextMode(ctx: OpCtx): void {
  ctx.sel.text.deselect()
  ctx.textEditHints = null
}
