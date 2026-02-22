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

// Re-export common types for convenience
export type { TNode } from "@km/core"
export type { TaskStatus } from "@km/tree"
export type { TPath } from "@km/tree"

// ===== Base Types =====

export type ViewMode = "cards" | "list" | "columns" | "tabs"

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

  // Selection state
  selectedNodes: Set<string>
  foldedNodes: Set<string>
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
  | { type: "SELECT"; nodeId: string | null }

  // Fold/unfold (just toggles Sets)
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

  // Multi-select
  | { type: "SELECT_NODE_ADD"; nodeId: string }
  | { type: "SELECT_NODE_REMOVE"; nodeId: string }
  | { type: "SELECT_NODE_TOGGLE"; nodeId: string }
  | { type: "CLEAR_SELECTION" }

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
  selectedNodes: Set<string>
  foldedNodes: Set<string>
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
    selectedNodes: new Set(),
    foldedNodes: new Set(),
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

// ===== Workspace / Pane Types (Phase 1–2: Windowing) =====

/** Discriminator for what a pane displays. */
export type PaneViewType = "board" | "detail" | "empty"

/**
 * Per-pane state — everything that becomes independent when a second pane is added.
 * In Phase 1 (single pane), a single PaneState mirrors the flat BoardAppState fields.
 * In Phase 2, the detail pane is a separate PaneState with viewType "detail".
 */
export interface PaneState {
  id: string
  viewType: PaneViewType

  // Board navigation (mirrors flat BoardAppState fields)
  rootId: string | null
  rootPath: string | null
  cursorNodeId: string | null
  selectedNodes: Set<string>
  foldedNodes: Set<string>
  collapsedNodes: Set<string>
  navHistory: NavHistoryEntry[]
  navHistoryIndex: number
  moveMode: boolean
  moveSourceNodes: string[]
  moveSourceCursorNodeId: string | null
  curswantX: number | null
  curswantY: number | null

  // Per-pane view config (subset of UIState)
  viewMode: ViewMode
  showDetailPane: boolean
  detailScrollOffset: number

  // Per-pane cursor store
  cursorStore: CursorStore

  // Per-pane zoom loading
  isZoomLoading: boolean
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
  layout: LayoutNode
}

/**
 * Create a PaneState from the flat board navigation fields.
 * Used during store initialization to populate the workspace's initial pane.
 */
export function createPaneState(
  id: string,
  board: BoardState,
  opts: {
    viewType?: PaneViewType
    viewMode: ViewMode
    showDetailPane: boolean
    detailScrollOffset: number
    cursorStore: CursorStore
    isZoomLoading: boolean
  },
): PaneState {
  return {
    id,
    viewType: opts.viewType ?? "board",
    rootId: board.rootId,
    rootPath: board.rootPath,
    cursorNodeId: board.cursorNodeId,
    selectedNodes: board.selectedNodes,
    foldedNodes: board.foldedNodes,
    collapsedNodes: board.collapsedNodes,
    navHistory: board.navHistory,
    navHistoryIndex: board.navHistoryIndex,
    moveMode: board.moveMode,
    moveSourceNodes: board.moveSourceNodes,
    moveSourceCursorNodeId: board.moveSourceCursorNodeId,
    curswantX: board.curswantX,
    curswantY: board.curswantY,
    viewMode: opts.viewMode,
    showDetailPane: opts.showDetailPane,
    detailScrollOffset: opts.detailScrollOffset,
    cursorStore: opts.cursorStore,
    isZoomLoading: opts.isZoomLoading,
  }
}
