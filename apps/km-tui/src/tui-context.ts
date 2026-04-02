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
import type { FocusManager } from "@silvery/ag-react"
import type { Repo } from "./repo-context.tsx"
import type { BoardAction } from "./board-types.ts"
import type { ColumnView } from "./types.ts"
import type { PaneUI, EditMode } from "./ui-reducer.ts"
import { getEditMode } from "./ui-reducer.ts"
import type { GridNavigator, ViewNode } from "@km/board"
import type { ViewNavigation } from "./view-navigation.ts"
import type { UndoStack } from "./undo-stack.ts"
import type { UndoableRepoHandle } from "./undo/undoable-repo.ts"

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
  /** Current card containing the cursor (from CursorStore). Used as embed-aware
   * hint — data model parent chain may lead to the wrong card for embeds. */
  cursorCardNodeId: string | null
  foldDepths: Map<string, number>
  collapsedNodes: Set<string>
  moveState: import("./board-types.ts").MoveState

  // === State (merged global + per-pane) ===
  ui: PaneUI
  navigator: GridNavigator
  viewNavigation: ViewNavigation
  toastQueue: ToastQueue

  // === Layout (derived fresh each key event) ===
  columns: ColumnView[]
  colIndex: number
  cardIndex: number
  isAtCardLevel: boolean
  nodeIndex: Map<string, { colIndex: number; cardIndex: number }>
  /** ViewNode tree — explicit visual hierarchy (replaces ad-hoc role derivation) */
  viewTree: ViewNode
  /** ViewNode index — O(1) lookup by node ID */
  viewIndex: Map<string, ViewNode>

  // === Derived (computed once per key event) ===
  /** Currently selected node (null if none) */
  selectedNode: KNode | null
  /** Current column from layout */
  column: ColumnView | undefined
  /** Current card from layout (CardView at top level) */
  card: KNode | undefined

  // === Dispatchers ===
  /** Dispatch to board state (for SELECT, ZOOM_IN, MOVE, etc.) */
  dispatchBoard: (action: BoardAction) => void
  /** Set UI fields directly (partial update, shallow merge). Routes per-pane fields to pane state. */
  setUI: (partial: Partial<PaneUI> | ((prev: PaneUI) => Partial<PaneUI>)) => void
  /** Set foldDepths (single source of truth at store root) */
  setFoldDepths: (depths: Map<string, number>) => void

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
  /** Get the detail pane cursor ID (from detail view pane's cursorNodeId) */
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
  /** Get flat list of visible descendant IDs in DFS order (card itself first, then descendants) */
  getVisibleDescendantIds: (cardNode: KNode, maxDepth: number, foldDepths: Map<string, number>) => string[]
}

// ===== Delegated keys (pure pass-throughs from store) =====

/** Keys of ActionCtx that are delegated directly from the store with no transformation. */
export const DELEGATED_ACTION_CTX_KEYS = [
  "dispatchBoard",
  "setUI",
  "setFoldDepths",
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
] as const satisfies readonly (keyof ActionCtx)[]

/** Union type of delegated ActionCtx keys. */
export type DelegatedActionCtxKeys = (typeof DELEGATED_ACTION_CTX_KEYS)[number]

// ===== Mode helpers =====

/** Get the current editing mode */
export function currentMode(ctx: ActionCtx): EditMode {
  return getEditMode(ctx.ui)
}

/** Enter text editing mode on a node */
export function enterTextMode(
  ctx: ActionCtx,
  nodeId: string,
  blockIndex = 0,
  initialCursorPos?: "start" | "end" | number,
): void {
  ctx.setUI({ inlineEditBlock: { nodeId, blockIndex, initialCursorPos } })
}

/** Exit text editing mode (save is handled by the EditContext cleanup) */
export function exitTextMode(ctx: ActionCtx): void {
  ctx.setUI({ inlineEditBlock: null })
}
