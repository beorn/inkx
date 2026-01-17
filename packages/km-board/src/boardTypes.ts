/**
 * Board Types
 *
 * Core state types for board navigation and view models.
 * Does NOT include app-specific UI state (modals, dialogs) - that belongs in each app.
 */

// Import types from @km/core and @km/tree
import type { TreeNode } from "@km/core";
import type { TPath, TaskStatus } from "@km/tree";

export type { TaskStatus } from "@km/tree";
export type { TreeNode } from "@km/core";
export type { TPath } from "@km/tree";

// ===== Base Types =====

export type ViewMode = "cards" | "list" | "columns" | "tabs";

// ===== Board State (Core Navigation) =====

/**
 * Core board navigation state.
 * Handles cursor, selection, fold/collapse, zoom, and history.
 * Does NOT include modal/dialog state - that belongs in app layer.
 */
export interface BoardState {
  // Root context
  rootId: string | null;
  rootPath: string | null;

  // Tree data
  nodes: TreeNode[]; // Top-level nodes

  // Path-based navigation
  cursor: TPath; // Current selection path

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
}

// ===== Board Actions (Core Navigation) =====

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
 * Actions for board navigation state transitions.
 * See docs/06-ui.md for the visual navigation model.
 */
export type BoardAction =
  // Cursor movement (parameterized)
  | { type: "CURSOR_MOVE"; dir: NodeDirection }

  // Jump navigation (not cursor movement)
  | { type: "NAV_CROSS_COLUMN"; direction: "left" | "right" }
  | { type: "NAV_TO_PATH"; path: TPath }

  // Node operations
  | { type: "TOGGLE_FOLD"; nodeId: string }
  | { type: "TOGGLE_COLLAPSE"; nodeId: string }
  | { type: "FOLD_LEVEL"; depth: number }
  | { type: "UNFOLD_LEVEL"; depth: number }

  // Zoom/root change
  | { type: "ZOOM_IN"; nodeId: string; nodes: TreeNode[] }
  | { type: "ZOOM_OUT"; nodes: TreeNode[] }

  // Refresh
  | { type: "REFRESH"; nodes: TreeNode[] }

  // Navigation history
  | { type: "NAV_BACK" }
  | { type: "NAV_FORWARD" }
  | {
      type: "NAV_TO";
      rootId: string | null;
      nodes: TreeNode[];
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
 * Node view model for rendering.
 */
export interface NodeViewModel {
  id: string;
  name: string; // Stable identifier (filename/slug)
  title: string; // Display text (may have formatting)
  childCount: number;
  isTask: boolean;
  taskStatus?: TaskStatus;
  color?: string;
  icon?: string;
  isFolded: boolean;
  priority?: number;
  dueDate?: string;
  hasBacklinks?: boolean;
  refsCount?: number;
  body?: string; // Text content below the title (renamed from 'content')
  depth: number;
  children: NodeViewModel[];
}

/**
 * Board view model for rendering.
 */
export interface BoardViewModel {
  rootPath: string | null;
  nodes: NodeViewModel[];
  cursor: TPath;
  selectedNodes: Set<string>;
  viewMode: ViewMode;
}
