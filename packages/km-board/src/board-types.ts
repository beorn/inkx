/**
 * Board Types
 *
 * Core state types for board navigation and view models.
 * Does NOT include app-specific UI state (modals, dialogs) - that belongs in each app.
 *
 * MIGRATION IN PROGRESS (km-board-refactor):
 * - BoardState: Current type with nodes/cursor (being phased out)
 * - SimplifiedBoardState: New type with cursorNodeId only (target)
 *
 * See plan hazy-forging-crayon.md for design rationale.
 */

// Import types from @km/core and @km/tree
import type { TNode } from "@km/core";
import type { TPath } from "@km/tree";

export type { TaskStatus } from "@km/tree";
export type { TNode } from "@km/core";
export type { TPath } from "@km/tree";

// ===== Base Types =====

export type ViewMode = "cards" | "list" | "columns" | "tabs";

// ===== Simplified State Types (NEW - target architecture) =====

/**
 * Zoom stack entry for simplified state.
 * Stores node IDs, not paths.
 */
export interface ZoomEntry {
  rootId: string | null;
  cursorNodeId: string | null;
}

/**
 * Navigation history entry for simplified state.
 * Stores node IDs, not paths.
 */
export interface NavHistoryEntry {
  rootId: string | null;
  rootPath: string | null;
  cursorNodeId: string | null;
}

/**
 * NEW: Simplified board state - target architecture.
 *
 * KEY DESIGN: No tree data (nodes) in state!
 * - cursorNodeId is the single source of truth for cursor position
 * - Visual indices (colIndex, cardIndex) are derived at render time
 * - Navigation uses Vault for tree queries, not state
 */
export interface SimplifiedBoardState {
  // Root context
  rootId: string | null;
  rootPath: string | null;

  // Cursor node - the ACTUAL selected node (stable across zoom)
  // This is the single source of truth for which node the cursor is on
  // "cursor" = single focused node; "selection" is reserved for multi-select
  cursorNodeId: string | null;

  // Selection state
  selectedNodes: Set<string>;
  foldedNodes: Set<string>;
  collapsedNodes: Set<string>; // Top-level nodes that are collapsed

  // Zoom stack (stores cursorNodeId, NOT paths)
  zoomStack: ZoomEntry[];

  // Navigation history (stores cursorNodeId, NOT paths)
  navHistory: NavHistoryEntry[];
  navHistoryIndex: number;

  // Move mode (m + destination)
  moveMode: boolean;
  moveSourceNodes: string[]; // Node IDs being moved
  moveSourceCursorNodeId: string | null; // Original cursor node

  // View configuration
  maxOutlineDepth: number;
  maxContentLines: number;

  // Sticky cursor coordinates (curswant)
  // See bead km-jm2r for details on the curswant pattern
  curswantX: number | null; // Sticky column index for board↔column navigation
  curswantY: number | null; // Sticky card index for cross-column navigation
}

/**
 * NEW: Simplified board actions - all ID-based, no tree traversal.
 * Navigation handlers compute target nodeIds using Vault, then dispatch these.
 */
export type SimplifiedBoardAction =
  // Cursor selection (navigation handler calls this with computed nodeId)
  | { type: "SELECT"; nodeId: string | null }

  // Fold/unfold (just toggles Sets)
  | { type: "TOGGLE_FOLD"; nodeId: string }
  | { type: "TOGGLE_COLLAPSE"; nodeId: string }

  // Zoom
  | { type: "ZOOM_IN"; nodeId: string }
  | { type: "ZOOM_OUT" }

  // Root change (e.g., navigating to different file)
  | {
      type: "SET_ROOT";
      rootId: string | null;
      rootPath: string | null;
      cursorNodeId: string | null;
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
  | { type: "INCREASE_OUTLINE_DEPTH" }
  | { type: "DECREASE_OUTLINE_DEPTH" }
  | { type: "INCREASE_CONTENT_LINES" }
  | { type: "DECREASE_CONTENT_LINES" }

  // Sticky cursor (set by navigation handlers)
  | { type: "SET_CURSWANT"; x?: number | null; y?: number | null };

/**
 * Transitional action type that accepts both old and new actions.
 * Used during migration to allow gradual update of action handlers.
 * TODO: Remove once all handlers use SimplifiedBoardAction.
 */
export type TransitionalBoardAction = SimplifiedBoardAction | BoardAction;

// ===== Current Board State (legacy, being phased out) =====

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
  // Visual/spatial (arrows)
  | "up"
  | "down"
  | "left"
  | "right"
  // Structural (hjkl)
  | "prev"
  | "next"
  | "in"
  | "out"
  | "first"
  | "last";

/**
 * Current board navigation state (includes nodes array).
 * Being migrated to SimplifiedBoardState.
 */
export interface BoardState {
  // Root context
  rootId: string | null;
  rootPath: string | null;

  // Tree data (BEING REMOVED - use Vault instead)
  nodes: TNode[]; // Top-level nodes

  // Cursor node - the ACTUAL selected node (stable across zoom)
  cursorNodeId: string | null;

  // Path-based cursor (BEING REMOVED - derive from cursorNodeId)
  cursor: TPath;

  // Selection state
  selectedNodes: Set<string>;
  foldedNodes: Set<string>;
  collapsedNodes: Set<string>; // Top-level nodes that are collapsed

  // Zoom stack (with cursor memory)
  zoomStack: Array<{
    rootId: string | null;
    cursor: TPath;
  }>;

  // Navigation history
  navHistory: Array<{
    rootId: string | null;
    cursor: TPath;
  }>;
  navHistoryIndex: number;

  // Move mode (m + destination)
  moveMode: boolean;
  moveSourceNodes: string[]; // Node IDs being moved
  moveSourceCursor: TPath; // Original cursor position

  // View configuration
  maxOutlineDepth: number;
  maxContentLines: number;

  // Sticky cursor coordinates (curswant)
  curswantX: number | null;
  curswantY: number | null;
}

/**
 * Current board actions (some require tree data).
 * Being migrated to SimplifiedBoardAction.
 */
export type BoardAction =
  // Cursor movement (parameterized)
  | { type: "CURSOR_MOVE"; dir: NodeDirection }

  // Jump navigation (not cursor movement)
  | { type: "NAV_CROSS_COLUMN"; direction: "left" | "right" }
  | { type: "NAV_TO_PATH"; path: TPath }
  | { type: "NAV_PAGE"; direction: "up" | "down"; pageSize: number }

  // Node operations
  | { type: "TOGGLE_FOLD"; nodeId: string }
  | { type: "TOGGLE_COLLAPSE"; nodeId: string }
  | { type: "FOLD_LEVEL"; depth: number }
  | { type: "UNFOLD_LEVEL"; depth: number }

  // Zoom/root change
  | { type: "ZOOM_IN"; nodeId: string | null; nodes: TNode[]; cursor?: TPath }
  | { type: "ZOOM_OUT"; nodes: TNode[] }

  // Refresh
  | { type: "REFRESH"; nodes: TNode[] }

  // Navigation history
  | { type: "NAV_BACK" }
  | { type: "NAV_FORWARD" }
  | {
      type: "NAV_TO";
      rootId: string | null;
      nodes: TNode[];
      rootPath: string | null;
    }

  // Selection
  | { type: "SELECT_NODE_ADD"; nodeId: string }
  | { type: "SELECT_NODE_REMOVE"; nodeId: string }
  | { type: "SELECT_NODE_TOGGLE"; nodeId: string }
  | { type: "SELECT_ALL_SIBLINGS" }
  | { type: "SELECT_ALL" }
  | { type: "CLEAR_SELECTION" }

  // Extend-select
  | { type: "EXTEND_SELECT_UP" }
  | { type: "EXTEND_SELECT_DOWN" }
  | { type: "EXTEND_SELECT_LEFT" }
  | { type: "EXTEND_SELECT_RIGHT" }

  // Shifting (move selected nodes)
  | { type: "SHIFT_UP" }
  | { type: "SHIFT_DOWN" }
  | { type: "SHIFT_LEFT" }
  | { type: "SHIFT_RIGHT" }

  // Move mode
  | { type: "ENTER_MOVE_MODE" }
  | { type: "CONFIRM_MOVE" }
  | { type: "CANCEL_MOVE" }

  // View configuration
  | { type: "INCREASE_OUTLINE_DEPTH" }
  | { type: "DECREASE_OUTLINE_DEPTH" }
  | { type: "INCREASE_CONTENT_LINES" }
  | { type: "DECREASE_CONTENT_LINES" };

// ===== View Level Configuration =====

/**
 * How views interpret tree levels.
 */
export interface ViewLevelConfig {
  /** Which depth level represents horizontal grouping */
  columnLevel: number;
  /** Which depth level represents vertical items */
  itemLevel: number;
  /** Maximum depth to render inline */
  maxInlineDepth: number;
  /** Whether to flatten all levels with indentation */
  flattenAll: boolean;
}

/** Preset configurations for view modes */
export const VIEW_LEVEL_PRESETS: Record<ViewMode, ViewLevelConfig> = {
  cards: { columnLevel: 0, itemLevel: 1, maxInlineDepth: 1, flattenAll: false },
  list: { columnLevel: 0, itemLevel: 1, maxInlineDepth: 99, flattenAll: true },
  columns: {
    columnLevel: 0,
    itemLevel: 1,
    maxInlineDepth: 2,
    flattenAll: false,
  },
  tabs: { columnLevel: 0, itemLevel: 1, maxInlineDepth: 1, flattenAll: false },
};

// ===== ViewModel Types =====

/**
 * Board view model for rendering.
 * Uses TNode[] directly - UI state (selection, folding) is in BoardState Sets.
 */
export interface BoardViewModel {
  rootPath: string | null;
  nodes: TNode[];
  cursor: TPath;
  selectedNodes: Set<string>;
  foldedNodes: Set<string>;
  viewMode: ViewMode;
}
