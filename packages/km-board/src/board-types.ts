/**
 * Board Types
 *
 * Core state types for board navigation and view models.
 * Does NOT include app-specific UI state (modals, dialogs) - that belongs in each app.
 */

// Import types from @km/core and @km/tree
import type { TNode } from "@km/core"
import type { TPath } from "@km/tree"

export type { TaskStatus } from "@km/tree"
export type { TNode } from "@km/core"
export type { TPath } from "@km/tree"

// ===== Base Types =====

export type ViewMode = "cards" | "list" | "columns" | "tabs" | "detail"

// ===== Move State =====

/**
 * Move mode state machine.
 * Either inactive (no move in progress) or active with source nodes and original cursor.
 */
export type MoveState = { active: false } | { active: true; sourceNodes: string[]; sourceCursor: string | null }

// ===== Board State (NEW - simplified architecture) =====

/**
 * Navigation history entry.
 * Stores node IDs, not paths.
 */
export interface NavHistoryEntry {
  rootId: string | null
  rootPath: string | null
  cursor: string | null
}

/**
 * Board navigation state.
 *
 * KEY DESIGN: No tree data (nodes) in state!
 * - Cursor is managed by @silvery/selection (sel.node.cursor())
 * - Visual indices (colIndex, cardIndex) are derived at render time
 * - Navigation uses Repo for tree queries, not state
 *
 * NOTE: Selection (multiSelected) and view config (maxContentLines) live in
 * per-pane UI state (PerPaneUIFields in km-tui), NOT here. The board reducer
 * only manages navigation/fold/zoom/move state.
 */
export interface BoardState {
  // Root context
  rootId: string | null
  rootPath: string | null

  foldDepths: Map<string, number>
  collapsedNodes: Set<string> // Top-level nodes that are collapsed

  // Navigation history (stores cursor IDs, NOT paths)
  navHistory: NavHistoryEntry[]
  navHistoryIndex: number

  // Move mode (m + destination)
  moveState: MoveState

  // Sticky cursor coordinates (curswant)
  // See bead km-jm2r for details on the curswant pattern
  curswantX: number | null // Sticky column index for board↔column navigation
  curswantY: number | null // Sticky card index for cross-column navigation
}

/**
 * Board actions - all ID-based, no tree traversal.
 * Navigation handlers compute target nodeIds using Repo, then dispatch these.
 *
 * NOTE: Multi-select actions (SELECT_NODE_ADD/REMOVE/TOGGLE, CLEAR_SELECTION) and
 * view config actions (INCREASE/DECREASE_CONTENT_LINES) are NOT board reducer actions.
 * They are handled at the app layer via per-pane UI state. See km-commands BoardOp.
 */
export type BoardReducerOp =
  // Cursor selection (navigation handler calls this with computed nodeId)
  // cardNodeId + cardHintSource: click handler passes the visual card as a definitive hint.
  // Used for embeds where the data model parent chain leads to the wrong card.
  | {
      type: "SELECT"
      nodeId: string | null
      cardNodeId?: string
      cardHintSource?: "click"
      /** Pre-built viewIndex from buildopctx cache — avoids redundant buildViewTree */
      _viewIndex?: Map<string, import("./view-tree.ts").ViewNode>
    }

  // Fold/unfold (manipulates foldDepths Map)
  | { type: "TOGGLE_FOLD"; nodeId: string }
  | { type: "TOGGLE_COLLAPSE"; nodeId: string }
  | { type: "SET_COLLAPSED_NODES"; nodeIds: string[] }

  // Zoom
  | { type: "ZOOM_IN"; nodeId: string | null }

  // Root change (e.g., navigating to different file)
  | {
      type: "SET_ROOT"
      rootId: string | null
      rootPath: string | null
    }

  // Move mode (caller provides node IDs)
  | { type: "ENTER_MOVE_MODE"; nodeIds: string[] }
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
