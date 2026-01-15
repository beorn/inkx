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
  // New item dialog state
  newItemMode: boolean;
  newItemText: string;
  // Project picker state
  projectPickerOpen: boolean;
  projectPickerQuery: string;
  projectPickerIndex: number;
  // Detail pane state
  detailPaneOpen: boolean;
  // Outline depth control (99 = show all levels)
  maxOutlineDepth: number;
  // Content lines control (how many lines of content to show per card)
  maxContentLines: number;
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
  // Rich task display fields
  priority?: number; // 1-5 (P0-P5 style)
  dueDate?: string; // ISO date string (YYYY-MM-DD)
  hasBacklinks?: boolean; // Whether node has backlinks
  refsCount?: number; // Count of @mentions, #tags, [[wikilinks]]
  content?: string; // Full content text
  // Depth within the column hierarchy (0 = direct child of column)
  depth?: number;
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
  | { type: "CLEAR_SELECTION" }
  // New item dialog actions
  | { type: "TOGGLE_NEW_ITEM_MODE" }
  | { type: "SET_NEW_ITEM_TEXT"; text: string }
  | { type: "CLEAR_NEW_ITEM" }
  // Project picker actions
  | { type: "TOGGLE_PROJECT_PICKER" }
  | { type: "SET_PROJECT_PICKER_QUERY"; query: string }
  | { type: "PROJECT_PICKER_UP" }
  | { type: "PROJECT_PICKER_DOWN"; maxIndex: number }
  | { type: "CLOSE_PROJECT_PICKER" }
  // Detail pane actions
  | { type: "TOGGLE_DETAIL_PANE" }
  // Outline depth actions
  | { type: "INCREASE_OUTLINE_DEPTH" }
  | { type: "DECREASE_OUTLINE_DEPTH" }
  // Content lines actions
  | { type: "INCREASE_CONTENT_LINES" }
  | { type: "DECREASE_CONTENT_LINES" };

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
  // Rich task display fields
  priority?: number;
  dueDate?: string;
  hasBacklinks?: boolean;
  refsCount?: number;
  content?: string;
  // Depth within the column hierarchy (0 = direct child of column)
  depth?: number;
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
