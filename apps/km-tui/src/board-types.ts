/**
 * Board Types & State Factory
 *
 * Core state types for board navigation and view models.
 * Moved from @km/board to eliminate the intermediate package.
 *
 * Does NOT include app-specific UI state (modals, dialogs) — that belongs in ui-reducer.ts.
 */

import type { TNode } from "@km/core"
import type { TPath } from "@km/tree"
import type { CursorStore } from "./cursor-store.ts"
import type { SelectionRange } from "./handlers/mouse-handler.ts"
import {
  createEmptyFilterProperties,
  type FilterProperties,
  type LocalSearchState,
  type SearchReplaceState,
  type UIState,
  type PaneUI,
} from "./ui-reducer.ts"

// Re-export common types for convenience
export type { TNode } from "@km/core"
export type { TaskStatus } from "@km/tree"
export type { TPath } from "@km/tree"

// ===== Base Types =====

export type ViewMode = "cards" | "list" | "columns" | "tabs" | "detail"

// ===== Board State =====

/**
 * Navigation history entry.
 * Stores node IDs, not paths.
 */
export interface NavHistoryEntry {
  rootId: string | null
  rootPath: string | null
  cursorNodeId: string | null
}

/**
 * Board navigation state.
 *
 * KEY DESIGN: No tree data (nodes) in state!
 * - cursorNodeId is the single source of truth for cursor position
 * - Visual indices (colIndex, cardIndex) are derived at render time
 * - Navigation uses Repo for tree queries, not state
 */
export interface BoardState {
  // Root context
  rootId: string | null
  rootPath: string | null

  // Cursor node - the ACTUAL selected node (stable across zoom)
  // This is the single source of truth for which node the cursor is on
  // "cursor" = single focused node; "selection" is reserved for multi-select
  cursorNodeId: string | null

  foldDepths: Map<string, number>
  collapsedNodes: Set<string> // Top-level nodes that are collapsed

  // Navigation history (stores cursorNodeId, NOT paths)
  navHistory: NavHistoryEntry[]
  navHistoryIndex: number

  // Move mode (m + destination)
  moveMode: boolean
  moveSourceNodes: string[] // Node IDs being moved
  moveSourceCursorNodeId: string | null // Original cursor node

  // Sticky cursor coordinates (curswant)
  // See bead km-jm2r for details on the curswant pattern
  curswantX: number | null // Sticky column index for board↔column navigation
  curswantY: number | null // Sticky card index for cross-column navigation
}

/**
 * Board actions - all ID-based, no tree traversal.
 * Navigation handlers compute target nodeIds using Repo, then dispatch these.
 */
export type BoardAction =
  // Cursor selection (navigation handler calls this with computed nodeId)
  // cardNodeId + cardHintSource: click handler passes the visual card as a definitive hint.
  // Used for embeds where the data model parent chain leads to the wrong card.
  | { type: "SELECT"; nodeId: string | null; cardNodeId?: string; cardHintSource?: "click" }

  // Fold/unfold (manipulates foldDepths Map)
  | { type: "TOGGLE_FOLD"; nodeId: string }
  | { type: "TOGGLE_COLLAPSE"; nodeId: string }

  // Zoom
  | { type: "ZOOM_IN"; nodeId: string | null; cursorNodeId?: string | null }

  // Root change (e.g., navigating to different file)
  | {
      type: "SET_ROOT"
      rootId: string | null
      rootPath: string | null
      cursorNodeId: string | null
    }

  // Move mode (caller provides node IDs)
  | { type: "ENTER_MOVE_MODE"; nodeIds: string[]; cursorNodeId: string | null }
  | { type: "CONFIRM_MOVE" }
  | { type: "CANCEL_MOVE" }

  // Sticky cursor (set by navigation handlers)
  | { type: "SET_CURSWANT"; x?: number | null; y?: number | null }

// ===== Navigation Types =====

/**
 * Direction for node-relative operations (cursor movement, selection, etc.)
 *
 * Visual/spatial directions (arrow key semantics):
 *   - up/down: moves to visually adjacent block (may cross tree levels)
 *   - left/right: cross-column horizontal movement
 *
 * Structural directions (tree navigation):
 *   - prev/next: sibling navigation within same parent
 *   - in/out: child/parent navigation
 *   - first/last: jump to first/last sibling
 *
 * See docs/06-ui.md for the visual navigation model.
 */
export type NodeDirection =
  // Visual/spatial
  | "up"
  | "down"
  | "left"
  | "right"
  // Block-by-block (auto-unfolds, jumps by block)
  | "block_up"
  | "block_down"
  // Structural
  | "prev"
  | "next"
  | "in"
  | "out"
  | "first"
  | "last"

// ===== ViewModel Types =====

/**
 * Board view model for rendering.
 * Uses TNode[] directly - UI state (selection, folding) is in BoardState Sets.
 */
export interface BoardViewModel {
  rootPath: string | null
  nodes: TNode[]
  cursor: TPath
  foldDepths: Map<string, number>
  viewMode: ViewMode
}

// ===== State Factory =====

/**
 * Create initial board state
 */
export function createBoardState(
  rootId: string | null = null,
  rootPath: string | null = null,
  cursorNodeId: string | null = null,
  collapsedNodeIds?: Set<string>,
): BoardState {
  return {
    rootId,
    rootPath,
    cursorNodeId,
    foldDepths: new Map(),
    collapsedNodes: collapsedNodeIds ?? new Set(),
    navHistory: [],
    navHistoryIndex: 0,
    moveMode: false,
    moveSourceNodes: [],
    moveSourceCursorNodeId: null,
    curswantX: null,
    curswantY: null,
  }
}

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
  multiSelected: Set<string>
  selectionAnchor: { nodeId: string } | null
  selectAllLevel: number
  visualMode: boolean
  visualAnchor: string | null
  collapsedColumns: Set<number>
  columnScrollAnchor: { colIdx: number; anchor: number } | null
  inlineEditBlock: {
    nodeId: string
    blockIndex: number
    initialCursorPos?: "start" | "end" | number
    stickyX?: number
  } | null
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
  "multiSelected",
  "selectionAnchor",
  "selectAllLevel",
  "visualMode",
  "visualAnchor",
  "collapsedColumns",
  "columnScrollAnchor",
  "inlineEditBlock",
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
    multiSelected: pane.multiSelected,
    selectionAnchor: pane.selectionAnchor,
    selectAllLevel: pane.selectAllLevel,
    visualMode: pane.visualMode,
    visualAnchor: pane.visualAnchor,
    collapsedColumns: pane.collapsedColumns,
    columnScrollAnchor: pane.columnScrollAnchor,
    inlineEditBlock: pane.inlineEditBlock,
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
  moveMode: boolean
  moveSourceNodes: string[]
  moveSourceCursorNodeId: string | null
  curswantX: number | null
  curswantY: number | null

  // Per-pane view config
  viewMode: ViewMode
  maxContentLines: number

  // Per-pane selection
  multiSelected: Set<string>
  selectionAnchor: { nodeId: string } | null
  selectAllLevel: number
  visualMode: boolean
  visualAnchor: string | null

  // Per-pane column state
  collapsedColumns: Set<number>
  columnScrollAnchor: { colIdx: number; anchor: number } | null

  // Per-pane edit state
  inlineEditBlock: {
    nodeId: string
    blockIndex: number
    initialCursorPos?: "start" | "end" | number
    stickyX?: number
  } | null

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
    moveMode: board.moveMode,
    moveSourceNodes: board.moveSourceNodes,
    moveSourceCursorNodeId: board.moveSourceCursorNodeId,
    curswantX: board.curswantX,
    curswantY: board.curswantY,
    viewMode: opts.viewMode,
    cursorStore: opts.cursorStore,
    // Per-pane UI fields (defaults)
    maxContentLines: 3,
    multiSelected: new Set(),
    selectionAnchor: null,
    selectAllLevel: 0,
    visualMode: false,
    visualAnchor: null,
    collapsedColumns: new Set(),
    columnScrollAnchor: null,
    inlineEditBlock: null,
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
