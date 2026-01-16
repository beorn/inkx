/**
 * Board Layer Types
 *
 * Visual navigation state for TUI board navigation.
 * Manages cursor, selection, fold/collapse, zoom, and history.
 */

import type { TPath } from "@km/tree";

/** Path-based cursor position in the tree */
export type CursorPath = TPath;

/**
 * Board state with path-based navigation.
 * Manages visual navigation state separate from node structure.
 */
export interface BoardState {
  // Root context
  rootId: string | null;
  rootPath: string | null;

  // Path-based navigation
  cursor: CursorPath; // Current selection path

  // Selection state
  selectedNodes: Set<string>;
  foldedNodes: Set<string>;
  collapsedNodes: Set<string>; // Top-level nodes that are collapsed

  // Search filter
  searchQuery: string;

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
}

/**
 * Actions for board state transitions.
 *
 * Navigation uses structural terms (prev/next/in/out/to) not spatial (up/down/left/right).
 * The container (App.tsx) translates spatial keys to structural actions,
 * computing paths for cross-column navigation via NAV_TO_PATH.
 */
export type BoardAction =
  // Visual/spatial cursor movement (cursor-select)
  | { type: "CURSOR_UP" }
  | { type: "CURSOR_DOWN" }
  | { type: "CURSOR_LEFT" }
  | { type: "CURSOR_RIGHT" }

  // Structural navigation (prev/next within siblings, in/out for depth)
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
  | { type: "NAV_CROSS_COLUMN"; direction: "left" | "right" } // move between columns preserving Y
  | { type: "NAV_PARENT" } // out
  | { type: "NAV_CHILD" } // in
  | { type: "NAV_TO_PATH"; path: CursorPath } // absolute positioning

  // Node operations
  | { type: "TOGGLE_FOLD"; nodeId: string }
  | { type: "TOGGLE_COLLAPSE"; nodeId: string }
  | { type: "FOLD_LEVEL"; depth: number }
  | { type: "UNFOLD_LEVEL"; depth: number }

  // Zoom (navigating)
  | { type: "ZOOM_IN"; nodeId: string }
  | { type: "ZOOM_OUT" }

  // Navigation history
  | { type: "NAV_BACK" }
  | { type: "NAV_FORWARD" }
  | {
      type: "SET_ROOT";
      rootId: string | null;
      rootPath: string | null;
    }

  // Selection (extend-select and command-select)
  | { type: "SELECT_NODE_ADD"; nodeId: string }
  | { type: "SELECT_NODE_REMOVE"; nodeId: string }
  | { type: "SELECT_NODE_TOGGLE"; nodeId: string }
  | { type: "SELECT_ALL_SIBLINGS" }
  | { type: "SELECT_ALL" }
  | { type: "CLEAR_SELECTION" }
  | { type: "EXTEND_SELECT_UP" }
  | { type: "EXTEND_SELECT_DOWN" }
  | { type: "EXTEND_SELECT_LEFT" }
  | { type: "EXTEND_SELECT_RIGHT" }

  // Shifting (move selected nodes visually)
  | { type: "SHIFT_UP" }
  | { type: "SHIFT_DOWN" }
  | { type: "SHIFT_LEFT" }
  | { type: "SHIFT_RIGHT" }

  // Search filter
  | { type: "SET_SEARCH_QUERY"; query: string };

/**
 * Create initial board state
 */
export function createInitialBoardState(
  rootId: string | null = null,
  rootPath: string | null = null,
  initialCursor: CursorPath = [0, 0],
): BoardState {
  return {
    rootId,
    rootPath,
    cursor: initialCursor,
    selectedNodes: new Set(),
    foldedNodes: new Set(),
    collapsedNodes: new Set(),
    searchQuery: "",
    zoomStack: [],
    navHistory: [],
    navHistoryIndex: 0,
  };
}
