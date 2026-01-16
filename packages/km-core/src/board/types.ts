/**
 * Board Layer Types
 *
 * Visual navigation state for TUI board navigation.
 * Manages cursor, selection, fold/collapse, zoom, and history.
 */

import type { CursorPath } from "../node/types.ts";

// Re-export CursorPath for convenience
export type { CursorPath } from "../node/types.ts";

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

  // Selection
  | { type: "SELECT_NODE_ADD"; nodeId: string }
  | { type: "SELECT_NODE_REMOVE"; nodeId: string }
  | { type: "SELECT_NODE_TOGGLE"; nodeId: string }
  | { type: "SELECT_ALL_SIBLINGS" }
  | { type: "SELECT_ALL" }
  | { type: "CLEAR_SELECTION" }

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
