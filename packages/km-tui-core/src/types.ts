/**
 * TUI Types
 *
 * Core state and view model types for TUI tree navigation.
 * Uses a generic node model supporting arbitrary depth.
 *
 * Node and Board types are imported from @km/core for consistency.
 */

// Import core types from @km/core
import type {
  NodeState as CoreNodeState,
  CursorPath as CoreCursorPath,
  TaskStatus,
} from "@km/core";

// Re-export for backwards compatibility
export type { TaskStatus } from "@km/core";

// ===== Base Types =====

export type ViewMode = "cards" | "list" | "columns" | "tabs";

// ===== Path-based Navigation =====

/**
 * Path-based cursor position.
 * Re-exported from @km/core for convenience.
 */
export type CursorPath = CoreCursorPath;

// ===== Tree Node State =====

/**
 * Generic tree node for TUI state.
 * Alias for @km/core's NodeState.
 */
export type TreeNodeState = CoreNodeState;

// ===== Tree State =====

/**
 * Tree state with path-based navigation.
 * Primary state model for TUI.
 */
export interface TreeState {
  // Root context
  rootId: string | null;
  rootPath: string | null;

  // Tree data
  nodes: TreeNodeState[]; // Top-level nodes

  // Path-based navigation
  cursor: CursorPath; // Current selection path

  // Selection state
  selectedNodes: Set<string>;
  foldedNodes: Set<string>;
  collapsedNodes: Set<string>; // Top-level nodes that are collapsed

  // Search
  searchQuery: string;
  searchMode: boolean;

  // Help
  helpMode: boolean;

  // Zoom stack (with cursor memory)
  zoomStack: Array<{
    rootId: string | null;
    cursor: CursorPath;
  }>;

  // Navigation history
  navHistory: Array<{
    rootId: string | null;
    cursor: CursorPath;
  }>;
  navHistoryIndex: number;

  // View configuration
  maxOutlineDepth: number;
  maxContentLines: number;

  // Modal states
  newItemMode: boolean;
  newItemText: string;
  projectPickerOpen: boolean;
  projectPickerQuery: string;
  projectPickerIndex: number;
  detailPaneOpen: boolean;

  // Command palette
  commandPaletteOpen: boolean;
  commandPaletteQuery: string;
  commandPaletteIndex: number;
}

// ===== Tree Actions =====

/**
 * Actions for tree state transitions.
 *
 * Navigation uses structural terms (prev/next/in/out/to) not spatial (up/down/left/right).
 * The container (App.tsx) translates spatial keys to structural actions,
 * computing paths for cross-column navigation via NAV_TO_PATH.
 */
export type TreeAction =
  // Structural navigation (prev/next within siblings, in/out for depth)
  | { type: "NAV_PREV_SIBLING" }
  | { type: "NAV_NEXT_SIBLING" }
  | { type: "NAV_FIRST_SIBLING" }
  | { type: "NAV_LAST_SIBLING" }
  | { type: "JUMP_TOP" } // alias for NAV_FIRST_SIBLING
  | { type: "JUMP_BOTTOM" } // alias for NAV_LAST_SIBLING
  | { type: "MOVE_UP" } // legacy alias for NAV_PREV_SIBLING
  | { type: "MOVE_DOWN" } // legacy alias for NAV_NEXT_SIBLING
  | { type: "MOVE_LEFT" } // legacy: parent when deep, prev column at top
  | { type: "MOVE_RIGHT" } // legacy: next column at top, child when deep
  | { type: "NAV_CROSS_COLUMN"; direction: "left" | "right" } // move between columns preserving Y
  | { type: "NAV_PARENT" } // out
  | { type: "NAV_CHILD" } // in
  | { type: "NAV_TO_PATH"; path: CursorPath } // absolute positioning

  // Node operations
  | { type: "TOGGLE_FOLD"; nodeId: string }
  | { type: "TOGGLE_COLLAPSE"; nodeId: string }
  | { type: "FOLD_LEVEL"; depth: number }
  | { type: "UNFOLD_LEVEL"; depth: number }

  // Zoom
  | { type: "ZOOM_IN"; nodeId: string; nodes: TreeNodeState[] }
  | { type: "ZOOM_OUT"; nodes: TreeNodeState[] }

  // Refresh
  | { type: "REFRESH"; nodes: TreeNodeState[] }

  // Navigation history
  | { type: "NAV_BACK" }
  | { type: "NAV_FORWARD" }
  | {
      type: "NAV_TO";
      rootId: string | null;
      nodes: TreeNodeState[];
      rootPath: string | null;
    }

  // Selection
  | { type: "SELECT_NODE_ADD"; nodeId: string }
  | { type: "SELECT_NODE_REMOVE"; nodeId: string }
  | { type: "SELECT_NODE_TOGGLE"; nodeId: string }
  | { type: "SELECT_ALL_SIBLINGS" }
  | { type: "SELECT_ALL" }
  | { type: "CLEAR_SELECTION" }

  // Modals
  | { type: "TOGGLE_SEARCH_MODE" }
  | { type: "SET_SEARCH_QUERY"; query: string }
  | { type: "TOGGLE_HELP_MODE" }
  | { type: "TOGGLE_NEW_ITEM_MODE" }
  | { type: "SET_NEW_ITEM_TEXT"; text: string }
  | { type: "CLEAR_NEW_ITEM" }
  | { type: "TOGGLE_PROJECT_PICKER" }
  | { type: "SET_PROJECT_PICKER_QUERY"; query: string }
  | { type: "PROJECT_PICKER_UP" }
  | { type: "PROJECT_PICKER_DOWN"; maxIndex: number }
  | { type: "CLOSE_PROJECT_PICKER" }
  | { type: "TOGGLE_DETAIL_PANE" }

  // Command palette
  | { type: "TOGGLE_COMMAND_PALETTE" }
  | { type: "SET_COMMAND_PALETTE_QUERY"; query: string }
  | { type: "COMMAND_PALETTE_UP" }
  | { type: "COMMAND_PALETTE_DOWN"; maxIndex: number }
  | { type: "CLOSE_COMMAND_PALETTE" }

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
  title: string;
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
  content?: string;
  depth: number;
  children: NodeViewModel[];
}

/**
 * Tree view model for rendering.
 */
export interface TreeViewModel {
  rootPath: string | null;
  nodes: NodeViewModel[];
  cursor: CursorPath;
  selectedNodes: Set<string>;
  viewMode: ViewMode;
  searchQuery: string;
  searchMode: boolean;
  helpMode: boolean;
}
