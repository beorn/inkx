/**
 * Board Types
 *
 * Core state types for board navigation and view models.
 * Split into BoardState (core navigation) and AppUIState (modal/dialog state).
 */

// Import types from @km/tree
import type { TNode, TPath, TaskStatus } from "@km/tree";

export type { TaskStatus } from "@km/tree";

// ===== Base Types =====

export type ViewMode = "cards" | "list" | "columns" | "tabs";

// ===== Path-based Navigation =====

/** Path-based cursor position in the tree */
export type CursorPath = TPath;

// Re-export TNode from @km/tree
export type { TNode } from "@km/tree";

// ===== Board State (Core Navigation) =====

/**
 * Core board navigation state.
 * Handles cursor, selection, fold/collapse, zoom, and history.
 * Does NOT include modal/dialog state - that belongs in AppUIState.
 */
export interface BoardState {
  // Root context
  rootId: string | null;
  rootPath: string | null;

  // Tree data
  nodes: TNode[]; // Top-level nodes

  // Path-based navigation
  cursor: CursorPath; // Current selection path

  // Selection state
  selectedNodes: Set<string>;
  foldedNodes: Set<string>;
  collapsedNodes: Set<string>; // Top-level nodes that are collapsed

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

  // Move mode (m + destination)
  moveMode: boolean;
  moveSourceNodes: string[]; // Node IDs being moved
  moveSourceCursor: CursorPath; // Original cursor position
}

// ===== App UI State (Modal/Dialog State) =====

/**
 * Application-specific UI state for modals and dialogs.
 * This state is specific to TUI applications and should be managed
 * in the app layer, not in the shared @km/board package.
 */
export interface AppUIState {
  // Search
  searchQuery: string;
  searchMode: boolean;

  // Help
  helpMode: boolean;

  // View configuration
  maxOutlineDepth: number;
  maxContentLines: number;

  // New item dialog
  newItemMode: boolean;
  newItemText: string;

  // Project picker
  projectPickerOpen: boolean;
  projectPickerQuery: string;
  projectPickerIndex: number;

  // Detail pane
  detailPaneOpen: boolean;

  // Command palette
  commandPaletteOpen: boolean;
  commandPaletteQuery: string;
  commandPaletteIndex: number;
}

// ===== Combined Tree State =====

/**
 * Full tree state combining board navigation and app UI state.
 * Used by TUI applications that need both navigation and modal state.
 */
export interface TreeState extends BoardState, AppUIState {}

// ===== Board Actions (Core Navigation) =====

/**
 * Actions for board navigation state transitions.
 *
 * Visual/Spatial Navigation (CURSOR_*):
 *   Moves to visually adjacent block. May traverse tree structure arbitrarily.
 *   See specs/km-board-navigation.md for the visual navigation model.
 *
 * Structural Navigation (NAV_*):
 *   Moves within tree structure (prev/next sibling, parent/child).
 */
export type BoardAction =
  // Visual/spatial navigation (cursor-select)
  | { type: "CURSOR_UP" }
  | { type: "CURSOR_DOWN" }
  | { type: "CURSOR_LEFT" }
  | { type: "CURSOR_RIGHT" }

  // Structural navigation
  | { type: "NAV_PREV_SIBLING" }
  | { type: "NAV_NEXT_SIBLING" }
  | { type: "NAV_FIRST_SIBLING" }
  | { type: "NAV_LAST_SIBLING" }
  | { type: "JUMP_TOP" }
  | { type: "JUMP_BOTTOM" }
  | { type: "MOVE_UP" }
  | { type: "MOVE_DOWN" }
  | { type: "MOVE_LEFT" }
  | { type: "MOVE_RIGHT" }
  | { type: "NAV_CROSS_COLUMN"; direction: "left" | "right" }
  | { type: "NAV_PARENT" }
  | { type: "NAV_CHILD" }
  | { type: "NAV_TO_PATH"; path: CursorPath }

  // Node operations
  | { type: "TOGGLE_FOLD"; nodeId: string }
  | { type: "TOGGLE_COLLAPSE"; nodeId: string }
  | { type: "FOLD_LEVEL"; depth: number }
  | { type: "UNFOLD_LEVEL"; depth: number }

  // Zoom/root change
  | { type: "ZOOM_IN"; nodeId: string; nodes: TNode[] }
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
  | { type: "CANCEL_MOVE" };

// ===== App UI Actions (Modal/Dialog State) =====

/**
 * Actions for application-specific UI state (modals, dialogs, view config).
 */
export type AppUIAction =
  // Search
  | { type: "TOGGLE_SEARCH_MODE" }
  | { type: "SET_SEARCH_QUERY"; query: string }

  // Help
  | { type: "TOGGLE_HELP_MODE" }

  // New item dialog
  | { type: "TOGGLE_NEW_ITEM_MODE" }
  | { type: "SET_NEW_ITEM_TEXT"; text: string }
  | { type: "CLEAR_NEW_ITEM" }

  // Project picker
  | { type: "TOGGLE_PROJECT_PICKER" }
  | { type: "SET_PROJECT_PICKER_QUERY"; query: string }
  | { type: "PROJECT_PICKER_UP" }
  | { type: "PROJECT_PICKER_DOWN"; maxIndex: number }
  | { type: "CLOSE_PROJECT_PICKER" }

  // Detail pane
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

// ===== Combined Tree Action =====

/**
 * All tree actions (board + app UI).
 * Used by TUI applications that need the full reducer.
 */
export type TreeAction = BoardAction | AppUIAction;

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
