/**
 * TUI Types
 *
 * Core state and view model types for TUI board management.
 * These are shareable across different renderers (OpenTUI, React DOM).
 */

// ===== State Types =====

export type TaskStatus = "todo" | "wip" | "blocked" | "done" | "dropped";

export type ViewMode = "cards" | "list" | "columns" | "tabs";

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
  | { type: "TOGGLE_COLLAPSE"; colIndex: number }
  | { type: "SET_VIEW_MODE"; mode: ViewMode }
  | { type: "SET_SEARCH_QUERY"; query: string }
  | { type: "TOGGLE_SEARCH_MODE" }
  | { type: "TOGGLE_HELP_MODE" }
  | { type: "REFRESH"; columns: ColumnState[] };

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
  viewMode: ViewMode;
  searchQuery: string;
  searchMode: boolean;
  helpMode: boolean;
}
