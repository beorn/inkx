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
export type MoveState = { active: false } | { active: true; sourceNodes: string[]; sourceCursorNodeId: string | null }

// ===== Board State (NEW - simplified architecture) =====

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
  foldDepths: Map<string, number>
  collapsedNodes: Set<string> // Top-level nodes that are collapsed

  // Navigation history (stores cursorNodeId, NOT paths)
  navHistory: NavHistoryEntry[]
  navHistoryIndex: number

  // Move mode (m + destination)
  moveState: MoveState

  // View configuration
  maxContentLines: number

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

  // Fold/unfold (manipulates depth map)
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

  // View configuration
  | { type: "INCREASE_CONTENT_LINES" }
  | { type: "DECREASE_CONTENT_LINES" }

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
  foldDepths: Map<string, number>
  viewMode: ViewMode
}
