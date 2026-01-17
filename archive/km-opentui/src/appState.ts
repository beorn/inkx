/**
 * App UI State
 *
 * Application-specific UI state for modals, dialogs, and view configuration.
 * This state is managed at the app layer, separate from board navigation state.
 *
 * Layer Model:
 *   App (this file) → Board (@km/board) → Tree (@km/tree) → DB (@km/storage)
 */

import type { BoardState, BoardAction, TNode, TAction } from "@km/board";
import { createBoardState } from "@km/board";

// ===== App UI State =====

/**
 * Application-specific UI state for modals and dialogs.
 * This state is specific to TUI applications.
 */
export interface AppUIState {
  // Search
  searchQuery: string;
  searchMode: boolean;

  // Help
  helpMode: boolean;

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

// ===== App UI Actions =====

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
  | { type: "CLOSE_COMMAND_PALETTE" };

// ===== Combined App State =====

/**
 * Full app state combining board navigation and app UI state.
 * This is the state shape used by the TUI application.
 */
export interface AppState extends BoardState, AppUIState {}

/**
 * All app actions (board + app UI + tree mutations).
 * Used by the combined app reducer.
 *
 * TActions (tree mutations) pass through the reducer unchanged -
 * the effect layer in useAppState handles persistence.
 */
export type AppAction = BoardAction | AppUIAction | TAction;

// ===== App UI Reducer =====

/**
 * Reducer for app-specific UI state.
 */
export function appUIReducer(
  state: AppUIState,
  action: AppUIAction,
): AppUIState {
  switch (action.type) {
    // ===== Search =====
    case "TOGGLE_SEARCH_MODE": {
      return {
        ...state,
        searchMode: !state.searchMode,
        searchQuery: state.searchMode ? "" : state.searchQuery,
      };
    }

    case "SET_SEARCH_QUERY": {
      return { ...state, searchQuery: action.query };
    }

    // ===== Help =====
    case "TOGGLE_HELP_MODE": {
      return { ...state, helpMode: !state.helpMode };
    }

    // ===== New Item Dialog =====
    case "TOGGLE_NEW_ITEM_MODE": {
      return {
        ...state,
        newItemMode: !state.newItemMode,
        newItemText: state.newItemMode ? "" : state.newItemText,
      };
    }

    case "SET_NEW_ITEM_TEXT": {
      return { ...state, newItemText: action.text };
    }

    case "CLEAR_NEW_ITEM": {
      return { ...state, newItemMode: false, newItemText: "" };
    }

    // ===== Project Picker =====
    case "TOGGLE_PROJECT_PICKER": {
      return {
        ...state,
        projectPickerOpen: !state.projectPickerOpen,
        projectPickerQuery: state.projectPickerOpen
          ? ""
          : state.projectPickerQuery,
        projectPickerIndex: state.projectPickerOpen
          ? 0
          : state.projectPickerIndex,
      };
    }

    case "SET_PROJECT_PICKER_QUERY": {
      return {
        ...state,
        projectPickerQuery: action.query,
        projectPickerIndex: 0,
      };
    }

    case "PROJECT_PICKER_UP": {
      if (state.projectPickerIndex <= 0) return state;
      return { ...state, projectPickerIndex: state.projectPickerIndex - 1 };
    }

    case "PROJECT_PICKER_DOWN": {
      if (state.projectPickerIndex >= action.maxIndex) return state;
      return { ...state, projectPickerIndex: state.projectPickerIndex + 1 };
    }

    case "CLOSE_PROJECT_PICKER": {
      return {
        ...state,
        projectPickerOpen: false,
        projectPickerQuery: "",
        projectPickerIndex: 0,
      };
    }

    // ===== Detail Pane =====
    case "TOGGLE_DETAIL_PANE": {
      return { ...state, detailPaneOpen: !state.detailPaneOpen };
    }

    // ===== Command Palette =====
    case "TOGGLE_COMMAND_PALETTE": {
      return {
        ...state,
        commandPaletteOpen: !state.commandPaletteOpen,
        commandPaletteQuery: state.commandPaletteOpen
          ? ""
          : state.commandPaletteQuery,
        commandPaletteIndex: state.commandPaletteOpen
          ? 0
          : state.commandPaletteIndex,
      };
    }

    case "SET_COMMAND_PALETTE_QUERY": {
      return {
        ...state,
        commandPaletteQuery: action.query,
        commandPaletteIndex: 0,
      };
    }

    case "COMMAND_PALETTE_UP": {
      if (state.commandPaletteIndex <= 0) return state;
      return { ...state, commandPaletteIndex: state.commandPaletteIndex - 1 };
    }

    case "COMMAND_PALETTE_DOWN": {
      if (state.commandPaletteIndex >= action.maxIndex) return state;
      return { ...state, commandPaletteIndex: state.commandPaletteIndex + 1 };
    }

    case "CLOSE_COMMAND_PALETTE": {
      return {
        ...state,
        commandPaletteOpen: false,
        commandPaletteQuery: "",
        commandPaletteIndex: 0,
      };
    }

    default:
      return state;
  }
}

// ===== Initial State Factories =====

/**
 * Create app UI state with default values.
 */
export function createAppUIState(): AppUIState {
  return {
    searchQuery: "",
    searchMode: false,
    helpMode: false,
    newItemMode: false,
    newItemText: "",
    projectPickerOpen: false,
    projectPickerQuery: "",
    projectPickerIndex: 0,
    detailPaneOpen: false,
    commandPaletteOpen: false,
    commandPaletteQuery: "",
    commandPaletteIndex: 0,
  };
}

/**
 * Create app state combining board state and app UI state.
 */
export function createAppState(
  nodes: TNode[],
  rootId: string | null = null,
  rootPath: string | null = null,
): AppState {
  const boardState = createBoardState(nodes, rootId, rootPath);
  const appUIState = createAppUIState();
  return { ...boardState, ...appUIState };
}

// ===== Type Guards =====

/**
 * Check if an action is an app UI action.
 */
export function isAppUIAction(action: { type: string }): action is AppUIAction {
  const appUIActionTypes = new Set([
    "TOGGLE_SEARCH_MODE",
    "SET_SEARCH_QUERY",
    "TOGGLE_HELP_MODE",
    "TOGGLE_NEW_ITEM_MODE",
    "SET_NEW_ITEM_TEXT",
    "CLEAR_NEW_ITEM",
    "TOGGLE_PROJECT_PICKER",
    "SET_PROJECT_PICKER_QUERY",
    "PROJECT_PICKER_UP",
    "PROJECT_PICKER_DOWN",
    "CLOSE_PROJECT_PICKER",
    "TOGGLE_DETAIL_PANE",
    "TOGGLE_COMMAND_PALETTE",
    "SET_COMMAND_PALETTE_QUERY",
    "COMMAND_PALETTE_UP",
    "COMMAND_PALETTE_DOWN",
    "CLOSE_COMMAND_PALETTE",
  ]);
  return appUIActionTypes.has(action.type);
}

// Re-export isTAction for convenience
export { isTAction } from "@km/board";
