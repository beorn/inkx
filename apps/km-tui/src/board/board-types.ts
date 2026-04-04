/**
 * Board Types & State Factory
 *
 * Re-exports canonical board types from @km/board and adds TUI-specific
 * workspace/pane types.
 *
 * Does NOT include app-specific UI state (modals, dialogs) — that belongs in ui-reducer.ts.
 */

import type { CursorStore } from "../state/cursor-store.ts"
import type { SelectionRange } from "../handlers/mouse-handler.ts"
import {
  createEmptyFilterProperties,
  type FilterProperties,
  type LocalSearchState,
  type SearchReplaceState,
  type UIState,
  type PaneUI,
} from "../state/ui-reducer.ts"

// ===== Re-export canonical board types from @km/board =====

export type {
  BoardState,
  BoardReducerOp,
  MoveState,
  NavHistoryEntry,
  ViewMode,
  NodeDirection,
  BoardViewModel,
  TNode,
  TPath,
  TaskStatus,
} from "@km/board"

export { createBoardState } from "@km/board"

import type { BoardState, MoveState, NavHistoryEntry, ViewMode } from "@km/board"

// ===== Workspace / Pane Types =====

/** Discriminator for what a pane displays. "detail" is a BoardPaneState with viewMode "detail". */
export type PaneViewType = "board" | "detail" | "empty"

/**
 * Fields that live per-pane (on BoardPaneState) but are accessed via ctx.ui in action handlers.
 * Used to route setUI() writes to the correct store location.
 */
export interface PerPaneUIFields {
  viewMode: ViewMode
  maxContentLines: number
  collapsedColumns: Set<number>
  columnScrollAnchor: { colIdx: number; anchor: number } | null
  localSearch: LocalSearchState | null
  searchReplace: SearchReplaceState | null
  showFilterDialog: boolean
  filterText: string
  filterProperties: FilterProperties
  filterCursorRow: number
  filterCursorVal: number
  showHidden: boolean
  hiddenVersion: number
  mouseSelection: SelectionRange | null
  isMouseDragging: boolean
}

/** Field names in PerPaneUIFields — used for runtime routing in setUI() */
export const PANE_UI_FIELD_NAMES: ReadonlySet<string> = new Set([
  "viewMode",
  "maxContentLines",
  "collapsedColumns",
  "columnScrollAnchor",
  "localSearch",
  "searchReplace",
  "showFilterDialog",
  "filterText",
  "filterProperties",
  "filterCursorRow",
  "filterCursorVal",
  "showHidden",
  "hiddenVersion",
  "mouseSelection",
  "isMouseDragging",
])

/** Merge global UIState with per-pane fields from a BoardPaneState into a single PaneUI. */
export function mergePaneUI(ui: UIState, pane: BoardPaneState): PaneUI {
  return {
    ...ui,
    viewMode: pane.viewMode,
    maxContentLines: pane.maxContentLines,
    collapsedColumns: pane.collapsedColumns,
    columnScrollAnchor: pane.columnScrollAnchor,
    localSearch: pane.localSearch,
    searchReplace: pane.searchReplace,
    showFilterDialog: pane.showFilterDialog,
    filterText: pane.filterText,
    filterProperties: pane.filterProperties,
    filterCursorRow: pane.filterCursorRow,
    filterCursorVal: pane.filterCursorVal,
    showHidden: pane.showHidden,
    hiddenVersion: pane.hiddenVersion,
    mouseSelection: pane.mouseSelection,
    isMouseDragging: pane.isMouseDragging,
  } as PaneUI
}

/** Base fields shared by all pane types */
interface PaneStateBase {
  id: string
  cursorStore: CursorStore
}

/**
 * Board pane — full board navigation state.
 * Contains everything that becomes independent when a second board pane is added.
 */
export interface BoardPaneState extends PaneStateBase {
  viewType: "board"

  /** When viewMode is "detail", this is the pane whose cursor we follow. */
  parentPaneId?: string

  // Board navigation
  rootId: string | null
  rootPath: string | null
  cursorNodeId: string | null
  foldDepths: Map<string, number>
  collapsedNodes: Set<string>
  navHistory: NavHistoryEntry[]
  navHistoryIndex: number
  moveState: MoveState
  curswantX: number | null
  curswantY: number | null

  // Per-pane view config
  viewMode: ViewMode
  maxContentLines: number

  // Per-pane column state
  collapsedColumns: Set<number>
  columnScrollAnchor: { colIdx: number; anchor: number } | null

  // Per-pane search
  localSearch: LocalSearchState | null
  searchReplace: SearchReplaceState | null

  // Per-pane filter
  showFilterDialog: boolean
  filterText: string
  filterProperties: FilterProperties
  filterCursorRow: number
  filterCursorVal: number

  // Per-pane ignore mode
  showHidden: boolean
  hiddenVersion: number

  // Per-pane mouse state
  mouseSelection: SelectionRange | null
  isMouseDragging: boolean
}

/**
 * Empty pane — placeholder before content is assigned.
 */
export interface EmptyPaneState extends PaneStateBase {
  viewType: "empty"
}

/** Discriminated union of all pane types */
export type PaneState = BoardPaneState | EmptyPaneState

/** Type guard for board panes */
export function isBoardPane(pane: PaneState): pane is BoardPaneState {
  return pane.viewType === "board"
}

/** Type guard for detail view mode (BoardPaneState with viewMode "detail") */
export function isDetailViewPane(pane: PaneState): pane is BoardPaneState {
  return pane.viewType === "board" && (pane as BoardPaneState).viewMode === "detail"
}

// ===== Pane ID Convention Helpers =====

/** Detail pane ID for a given board pane. Convention: `${boardPaneId}-detail` */
export function detailPaneIdFor(boardPaneId: string): string {
  return `${boardPaneId}-detail`
}

/** Board pane ID that owns a detail pane. Inverse of detailPaneIdFor. */
export function ownerPaneId(paneId: string): string {
  return paneId.replace(/-detail$/, "")
}

/** Whether a pane ID refers to a detail pane. */
export function isDetailPaneId(paneId: string): boolean {
  return paneId.endsWith("-detail")
}

/** Resolved board + detail pane pair from any pane ID. */
export interface PanePair {
  board: BoardPaneState | null
  detail: BoardPaneState | null
}

/**
 * Resolve both panes from any pane ID (board or detail).
 * Given "main" → returns { board: main, detail: main-detail | null }
 * Given "main-detail" → returns { board: main, detail: main-detail }
 */
export function resolvePanes(workspace: WorkspaceState, paneId: string): PanePair {
  const pane = workspace.panes.get(paneId)
  if (pane && isDetailViewPane(pane)) {
    const boardId = ownerPaneId(paneId)
    const boardPane = workspace.panes.get(boardId)
    return {
      board: boardPane && isBoardPane(boardPane) ? boardPane : null,
      detail: pane,
    }
  }
  const detailId = detailPaneIdFor(paneId)
  const detailPane = workspace.panes.get(detailId)
  return {
    board: pane && isBoardPane(pane) ? pane : null,
    detail: detailPane && isDetailViewPane(detailPane) ? detailPane : null,
  }
}

/** Get the detail pane associated with any pane ID (board or detail). */
export function getDetailPaneFor(workspace: WorkspaceState, paneId: string): BoardPaneState | null {
  return resolvePanes(workspace, paneId).detail
}

/** Whether a pane ID (board or detail) has an associated detail pane. */
export function hasDetailPaneFor(workspace: WorkspaceState, paneId: string): boolean {
  return resolvePanes(workspace, paneId).detail !== null
}

/**
 * Layout tree for workspace pane arrangement.
 * Phase 1: always a single leaf node.
 */
export type LayoutNode =
  | { type: "leaf"; paneId: string }
  | { type: "split"; direction: "h" | "v"; ratio: number; left: LayoutNode; right: LayoutNode }

/**
 * Workspace state — contains all panes and their layout.
 * Phase 1: single pane, simple leaf layout.
 */
export interface WorkspaceState {
  panes: Map<string, PaneState>
  focusedPaneId: string
  previousFocusedPaneId: string | null
  layout: LayoutNode
  /** Saved layout before zoom/maximize — null when not zoomed */
  preZoomLayout: LayoutNode | null
  /** Saved panes map before zoom/maximize — null when not zoomed */
  preZoomPanes: Map<string, PaneState> | null
}

/**
 * Create a BoardPaneState from the flat board navigation fields.
 * Used during store initialization to populate the workspace's initial pane.
 */
export function createPaneState(
  id: string,
  board: BoardState,
  opts: {
    viewMode: ViewMode
    cursorStore: CursorStore
  },
): BoardPaneState {
  return {
    id,
    viewType: "board",
    rootId: board.rootId,
    rootPath: board.rootPath,
    cursorNodeId: board.cursorNodeId,
    foldDepths: board.foldDepths,
    collapsedNodes: board.collapsedNodes,
    navHistory: board.navHistory,
    navHistoryIndex: board.navHistoryIndex,
    moveState: board.moveState,
    curswantX: board.curswantX,
    curswantY: board.curswantY,
    viewMode: opts.viewMode,
    cursorStore: opts.cursorStore,
    // Per-pane UI fields (defaults)
    maxContentLines: 3,
    collapsedColumns: new Set(),
    columnScrollAnchor: null,
    localSearch: null,
    searchReplace: null,
    showFilterDialog: false,
    filterText: "",
    filterProperties: createEmptyFilterProperties(),
    filterCursorRow: 0,
    filterCursorVal: 0,
    showHidden: false,
    hiddenVersion: 0,
    mouseSelection: null,
    isMouseDragging: false,
  }
}

/**
 * Create an EmptyPaneState placeholder.
 */
export function createEmptyPaneState(id: string, cursorStore: CursorStore): EmptyPaneState {
  return {
    id,
    viewType: "empty",
    cursorStore,
  }
}
