/**
 * UI State Reducer for Board Component
 *
 * Manages UI state separately from board navigation state.
 * This enables extracting input handlers to separate files.
 */

import type { ViewMode, SelectionKey } from "./types.ts";
import type { SelectionRange } from "./mouse-handler.ts";

// =============================================================================
// UI State Type
// =============================================================================

export interface UIState {
  // View configuration
  viewMode: ViewMode;
  showDetailPane: boolean;
  maxOutlineDepth: number;
  maxContentLines: number;

  // Overlays/dialogs
  showHelp: boolean;
  showProjectPicker: boolean;
  showNewItemDialog: boolean;

  // Selection state
  selectionLevel: "board" | "column" | "card";
  subIndex: number;
  inOutlineMode: boolean;
  multiSelected: Set<SelectionKey>;
  selectionAnchor: { col: number; card: number; sub: number } | null;
  selectAllLevel: number;

  // Column state
  collapsedColumns: Set<number>;

  // Mouse state
  mouseSelection: SelectionRange | null;
  isMouseDragging: boolean;

  // File drop state
  droppedFiles: string[];
  showDropNotification: boolean;

  // Navigation history
  navHistory: Array<{
    rootId: string | null;
    colIndex: number;
    cardIndex: number;
    subIndex: number;
    multiSelected: Set<SelectionKey>;
    inOutlineMode: boolean;
  }>;
  navHistoryIndex: number;

  // Recent projects for picker
  recentProjectIds: string[];

  // Terminal state
  isReady: boolean;
  dimensions: { columns: number; rows: number };
}

// =============================================================================
// UI Actions
// =============================================================================

export type UIAction =
  // View mode
  | { type: "CYCLE_VIEW_MODE" }
  | { type: "SET_VIEW_MODE"; mode: ViewMode }

  // Overlays
  | { type: "TOGGLE_HELP" }
  | { type: "SHOW_HELP" }
  | { type: "HIDE_HELP" }
  | { type: "SHOW_PROJECT_PICKER" }
  | { type: "HIDE_PROJECT_PICKER" }
  | { type: "SHOW_NEW_ITEM_DIALOG" }
  | { type: "HIDE_NEW_ITEM_DIALOG" }

  // Detail pane
  | { type: "TOGGLE_DETAIL_PANE" }
  | { type: "SET_DETAIL_PANE"; show: boolean }

  // View configuration
  | { type: "INCREASE_OUTLINE_DEPTH" }
  | { type: "DECREASE_OUTLINE_DEPTH" }
  | { type: "INCREASE_CONTENT_LINES" }
  | { type: "DECREASE_CONTENT_LINES" }

  // Selection level
  | { type: "SET_SELECTION_LEVEL"; level: "board" | "column" | "card" }
  | { type: "ENTER_OUTLINE_MODE" }
  | { type: "EXIT_OUTLINE_MODE" }
  | { type: "SET_SUB_INDEX"; index: number }

  // Multi-selection
  | { type: "SET_MULTI_SELECTED"; selected: Set<SelectionKey> }
  | { type: "CLEAR_MULTI_SELECTION" }
  | {
      type: "SET_SELECTION_ANCHOR";
      anchor: { col: number; card: number; sub: number } | null;
    }
  | { type: "SET_SELECT_ALL_LEVEL"; level: number }

  // Column collapse
  | { type: "TOGGLE_COLUMN_COLLAPSE"; colIndex: number }
  | { type: "SET_COLLAPSED_COLUMNS"; columns: Set<number> }

  // Mouse
  | { type: "SET_MOUSE_SELECTION"; selection: SelectionRange | null }
  | { type: "SET_MOUSE_DRAGGING"; dragging: boolean }

  // File drop
  | { type: "SET_DROPPED_FILES"; files: string[] }
  | { type: "SHOW_DROP_NOTIFICATION" }
  | { type: "HIDE_DROP_NOTIFICATION" }

  // Navigation history
  | {
      type: "PUSH_NAV_HISTORY";
      entry: {
        rootId: string | null;
        colIndex: number;
        cardIndex: number;
        subIndex: number;
        multiSelected: Set<SelectionKey>;
        inOutlineMode: boolean;
      };
    }
  | { type: "NAV_BACK" }
  | { type: "NAV_FORWARD" }
  | { type: "SET_NAV_HISTORY_INDEX"; index: number }

  // Recent projects
  | { type: "ADD_RECENT_PROJECT"; projectId: string }

  // Terminal
  | { type: "SET_READY"; ready: boolean }
  | { type: "SET_DIMENSIONS"; dimensions: { columns: number; rows: number } };

// =============================================================================
// Initial State Factory
// =============================================================================

export function createInitialUIState(
  initialViewMode: ViewMode,
  collapsedColumns: number[],
  dimensions: { columns: number; rows: number },
): UIState {
  return {
    viewMode: initialViewMode,
    showDetailPane: initialViewMode === "list",
    maxOutlineDepth: 2,
    maxContentLines: 3,

    showHelp: false,
    showProjectPicker: false,
    showNewItemDialog: false,

    selectionLevel: "card",
    subIndex: 0,
    inOutlineMode: false,
    multiSelected: new Set(),
    selectionAnchor: null,
    selectAllLevel: 0,

    collapsedColumns: new Set(collapsedColumns),

    mouseSelection: null,
    isMouseDragging: false,

    droppedFiles: [],
    showDropNotification: false,

    navHistory: [],
    navHistoryIndex: 0,

    recentProjectIds: [],

    isReady: false,
    dimensions,
  };
}

// =============================================================================
// UI Reducer
// =============================================================================

export function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    // View mode
    case "CYCLE_VIEW_MODE": {
      const modes: ViewMode[] = ["cards", "columns", "list", "tabs"];
      const currentIndex = modes.indexOf(state.viewMode);
      const nextIndex = (currentIndex + 1) % modes.length;
      const nextMode = modes[nextIndex] ?? "cards";
      return { ...state, viewMode: nextMode };
    }
    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.mode };

    // Overlays
    case "TOGGLE_HELP":
      return { ...state, showHelp: !state.showHelp };
    case "SHOW_HELP":
      return { ...state, showHelp: true };
    case "HIDE_HELP":
      return { ...state, showHelp: false };
    case "SHOW_PROJECT_PICKER":
      return { ...state, showProjectPicker: true };
    case "HIDE_PROJECT_PICKER":
      return { ...state, showProjectPicker: false };
    case "SHOW_NEW_ITEM_DIALOG":
      return { ...state, showNewItemDialog: true };
    case "HIDE_NEW_ITEM_DIALOG":
      return { ...state, showNewItemDialog: false };

    // Detail pane
    case "TOGGLE_DETAIL_PANE":
      return { ...state, showDetailPane: !state.showDetailPane };
    case "SET_DETAIL_PANE":
      return { ...state, showDetailPane: action.show };

    // View configuration
    case "INCREASE_OUTLINE_DEPTH":
      return {
        ...state,
        maxOutlineDepth: Math.min(10, state.maxOutlineDepth + 1),
      };
    case "DECREASE_OUTLINE_DEPTH":
      return {
        ...state,
        maxOutlineDepth: Math.max(0, state.maxOutlineDepth - 1),
      };
    case "INCREASE_CONTENT_LINES":
      return {
        ...state,
        maxContentLines: Math.min(10, state.maxContentLines + 1),
      };
    case "DECREASE_CONTENT_LINES":
      return {
        ...state,
        maxContentLines: Math.max(1, state.maxContentLines - 1),
      };

    // Selection level
    case "SET_SELECTION_LEVEL":
      return { ...state, selectionLevel: action.level };
    case "ENTER_OUTLINE_MODE":
      return { ...state, inOutlineMode: true };
    case "EXIT_OUTLINE_MODE":
      return { ...state, inOutlineMode: false, subIndex: 0 };
    case "SET_SUB_INDEX":
      return { ...state, subIndex: action.index };

    // Multi-selection
    case "SET_MULTI_SELECTED":
      return { ...state, multiSelected: action.selected };
    case "CLEAR_MULTI_SELECTION":
      return { ...state, multiSelected: new Set() };
    case "SET_SELECTION_ANCHOR":
      return { ...state, selectionAnchor: action.anchor };
    case "SET_SELECT_ALL_LEVEL":
      return { ...state, selectAllLevel: action.level };

    // Column collapse
    case "TOGGLE_COLUMN_COLLAPSE": {
      const newCollapsed = new Set(state.collapsedColumns);
      if (newCollapsed.has(action.colIndex)) {
        newCollapsed.delete(action.colIndex);
      } else {
        newCollapsed.add(action.colIndex);
      }
      return { ...state, collapsedColumns: newCollapsed };
    }
    case "SET_COLLAPSED_COLUMNS":
      return { ...state, collapsedColumns: action.columns };

    // Mouse
    case "SET_MOUSE_SELECTION":
      return { ...state, mouseSelection: action.selection };
    case "SET_MOUSE_DRAGGING":
      return { ...state, isMouseDragging: action.dragging };

    // File drop
    case "SET_DROPPED_FILES":
      return { ...state, droppedFiles: action.files };
    case "SHOW_DROP_NOTIFICATION":
      return { ...state, showDropNotification: true };
    case "HIDE_DROP_NOTIFICATION":
      return { ...state, showDropNotification: false };

    // Navigation history
    case "PUSH_NAV_HISTORY": {
      // Truncate forward history when adding new entry
      const newHistory = state.navHistory.slice(0, state.navHistoryIndex + 1);
      newHistory.push(action.entry);
      return {
        ...state,
        navHistory: newHistory,
        navHistoryIndex: newHistory.length - 1,
      };
    }
    case "NAV_BACK":
      if (state.navHistoryIndex > 0) {
        return { ...state, navHistoryIndex: state.navHistoryIndex - 1 };
      }
      return state;
    case "NAV_FORWARD":
      if (state.navHistoryIndex < state.navHistory.length - 1) {
        return { ...state, navHistoryIndex: state.navHistoryIndex + 1 };
      }
      return state;
    case "SET_NAV_HISTORY_INDEX":
      return { ...state, navHistoryIndex: action.index };

    // Recent projects
    case "ADD_RECENT_PROJECT": {
      const filtered = state.recentProjectIds.filter(
        (id) => id !== action.projectId,
      );
      return {
        ...state,
        recentProjectIds: [action.projectId, ...filtered].slice(0, 10),
      };
    }

    // Terminal
    case "SET_READY":
      return { ...state, isReady: action.ready };
    case "SET_DIMENSIONS":
      return { ...state, dimensions: action.dimensions };

    default:
      return state;
  }
}
