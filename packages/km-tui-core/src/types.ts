/**
 * TUI Types
 *
 * Core state and view model types for TUI board management.
 * These are shareable across different renderers (OpenTUI, React DOM).
 */

// ===== State Types =====

export type TaskStatus = "todo" | "wip" | "blocked" | "done" | "dropped";

export type ViewMode = "cards" | "list" | "columns" | "tabs";

// ===== Navigation History =====

export interface NavHistoryEntry {
  rootId: string | null;
  colIndex: number;
  cardIndex: number;
}

export interface BoardState {
  rootId: string | null;
  rootPath: string | null;
  columns: ColumnState[];
  colIndex: number;
  cardIndex: number;
  selectedCards: Set<string>;
  visualMode: boolean;
  foldedCards: Set<string>;
  collapsedColumns: Set<number>;
  searchQuery: string;
  searchMode: boolean;
  helpMode: boolean;
  zoomStack: string[];
  // Navigation history for back/forward
  navHistory: NavHistoryEntry[];
  navHistoryIndex: number;
}

export interface ColumnState {
  nodeId: string;
  title: string;
  cards: CardState[];
  wipLimit?: number;
}

export interface CardState {
  nodeId: string;
  title: string;
  childCount: number;
  isTask: boolean;
  taskStatus?: TaskStatus;
  color?: string;
  icon?: string;
}

export type BoardAction =
  | { type: "MOVE_UP" }
  | { type: "MOVE_DOWN" }
  | { type: "MOVE_LEFT" }
  | { type: "MOVE_RIGHT" }
  | { type: "JUMP_TOP" }
  | { type: "JUMP_BOTTOM" }
  | { type: "SELECT_CARD"; col: number; card: number }
  | { type: "TOGGLE_FOLD"; cardId: string }
  | { type: "FOLD_COLUMN"; colIndex: number }
  | { type: "UNFOLD_COLUMN"; colIndex: number }
  | { type: "TOGGLE_COLLAPSE"; colIndex: number }
  | { type: "SET_VIEW_MODE"; mode: ViewMode }
  | { type: "SET_SEARCH_QUERY"; query: string }
  | { type: "TOGGLE_SEARCH_MODE" }
  | { type: "TOGGLE_HELP_MODE" }
  | { type: "REFRESH"; columns: ColumnState[] }
  // Navigation history actions
  | { type: "NAV_BACK" }
  | { type: "NAV_FORWARD" }
  | {
      type: "NAV_TO";
      rootId: string | null;
      columns: ColumnState[];
      rootPath: string | null;
    }
  // Zoom actions
  | { type: "ZOOM_IN"; nodeId: string; columns: ColumnState[] }
  | { type: "ZOOM_OUT"; columns: ColumnState[] }
  // Multi-select actions
  | { type: "SELECT_CARD_ADD"; nodeId: string }
  | { type: "SELECT_CARD_REMOVE"; nodeId: string }
  | { type: "SELECT_CARD_TOGGLE"; nodeId: string }
  | { type: "SELECT_ALL_COLUMN" }
  | { type: "SELECT_ALL" }
  | { type: "CLEAR_SELECTION" };

// ===== ViewModel Types =====

export interface CardViewModel {
  id: string;
  title: string;
  childCount: number;
  isTask: boolean;
  taskStatus?: TaskStatus;
  color?: string;
  icon?: string;
  isFolded: boolean;
}

export interface ColumnViewModel {
  id: string;
  title: string;
  count: number;
  wipLimit?: number;
  isOverLimit: boolean;
  isCollapsed: boolean;
  cards: CardViewModel[];
}

export interface BoardViewModel {
  rootPath: string | null;
  columns: ColumnViewModel[];
  selectedCol: number;
  selectedCard: number;
  selectedCards: Set<string>;
  viewMode: ViewMode;
  searchQuery: string;
  searchMode: boolean;
  helpMode: boolean;
}
