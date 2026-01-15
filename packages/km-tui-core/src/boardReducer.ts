/**
 * Board State Reducer
 *
 * Pure reducer for board state transitions.
 * No side effects, no React imports - pure TypeScript.
 */

import type { BoardState, BoardAction, ColumnState } from "./types.ts";

/**
 * Pure reducer for board state transitions
 */
export function boardReducer(
  state: BoardState,
  action: BoardAction,
): BoardState {
  switch (action.type) {
    case "MOVE_UP": {
      if (state.cardIndex <= 0) return state;
      return { ...state, cardIndex: state.cardIndex - 1 };
    }

    case "MOVE_DOWN": {
      const currentCol = state.columns[state.colIndex];
      if (!currentCol || state.cardIndex >= currentCol.cards.length - 1) {
        return state;
      }
      return { ...state, cardIndex: state.cardIndex + 1 };
    }

    case "MOVE_LEFT": {
      if (state.colIndex <= 0) return state;
      return { ...state, colIndex: state.colIndex - 1, cardIndex: 0 };
    }

    case "MOVE_RIGHT": {
      if (state.colIndex >= state.columns.length - 1) return state;
      return { ...state, colIndex: state.colIndex + 1, cardIndex: 0 };
    }

    case "JUMP_TOP": {
      return { ...state, cardIndex: 0 };
    }

    case "JUMP_BOTTOM": {
      const currentCol = state.columns[state.colIndex];
      if (!currentCol || currentCol.cards.length === 0) return state;
      return { ...state, cardIndex: currentCol.cards.length - 1 };
    }

    case "SELECT_CARD": {
      return { ...state, colIndex: action.col, cardIndex: action.card };
    }

    case "TOGGLE_FOLD": {
      const newFolded = new Set(state.foldedCards);
      if (newFolded.has(action.cardId)) {
        newFolded.delete(action.cardId);
      } else {
        newFolded.add(action.cardId);
      }
      return { ...state, foldedCards: newFolded };
    }

    case "FOLD_COLUMN": {
      // Fold all cards in the specified column (add all card IDs to foldedCards)
      const column = state.columns[action.colIndex];
      if (!column) return state;
      const newFolded = new Set(state.foldedCards);
      for (const card of column.cards) {
        newFolded.add(card.nodeId);
      }
      return { ...state, foldedCards: newFolded };
    }

    case "UNFOLD_COLUMN": {
      // Unfold all cards in the specified column (remove all card IDs from foldedCards)
      const column = state.columns[action.colIndex];
      if (!column) return state;
      const newFolded = new Set(state.foldedCards);
      for (const card of column.cards) {
        newFolded.delete(card.nodeId);
      }
      return { ...state, foldedCards: newFolded };
    }

    case "TOGGLE_COLLAPSE": {
      const newCollapsed = new Set(state.collapsedColumns);
      if (newCollapsed.has(action.colIndex)) {
        newCollapsed.delete(action.colIndex);
      } else {
        newCollapsed.add(action.colIndex);
      }
      return { ...state, collapsedColumns: newCollapsed };
    }

    case "SET_VIEW_MODE": {
      // View mode is managed separately, but we can track it here if needed
      return state;
    }

    case "SET_SEARCH_QUERY": {
      return { ...state, searchQuery: action.query };
    }

    case "TOGGLE_SEARCH_MODE": {
      return {
        ...state,
        searchMode: !state.searchMode,
        searchQuery: state.searchMode ? "" : state.searchQuery,
      };
    }

    case "TOGGLE_HELP_MODE": {
      return { ...state, helpMode: !state.helpMode };
    }

    case "REFRESH": {
      // Replace columns but preserve selection state
      const newColIndex = Math.min(state.colIndex, action.columns.length - 1);
      const newCol = action.columns[newColIndex];
      const newCardIndex = newCol
        ? Math.min(state.cardIndex, newCol.cards.length - 1)
        : 0;
      return {
        ...state,
        columns: action.columns,
        colIndex: Math.max(0, newColIndex),
        cardIndex: Math.max(0, newCardIndex),
      };
    }

    case "NAV_TO": {
      // Navigate to a specific root, adding current position to history
      const newHistory = [
        ...state.navHistory.slice(0, state.navHistoryIndex + 1),
        {
          rootId: state.rootId,
          colIndex: state.colIndex,
          cardIndex: state.cardIndex,
        },
      ];
      return {
        ...state,
        rootId: action.rootId,
        rootPath: action.rootPath,
        columns: action.columns,
        colIndex: 0,
        cardIndex: 0,
        navHistory: newHistory,
        navHistoryIndex: newHistory.length,
      };
    }

    case "NAV_BACK": {
      // Navigate back in history (decrement index)
      // Actual state restoration happens in the UI layer
      if (state.navHistoryIndex <= 0) return state;
      return {
        ...state,
        navHistoryIndex: state.navHistoryIndex - 1,
      };
    }

    case "NAV_FORWARD": {
      // Navigate forward in history (increment index)
      // Actual state restoration happens in the UI layer
      if (state.navHistoryIndex >= state.navHistory.length - 1) return state;
      return {
        ...state,
        navHistoryIndex: state.navHistoryIndex + 1,
      };
    }

    case "ZOOM_IN": {
      // Zoom into a card: push current rootId to zoomStack, set new rootId
      // The nodeId becomes the new root, its children become columns
      if (!action.nodeId) return state;
      const newZoomStack = [...state.zoomStack];
      if (state.rootId !== null) {
        newZoomStack.push(state.rootId);
      } else {
        // Push a marker for "null" root (top level)
        newZoomStack.push("__ROOT__");
      }
      return {
        ...state,
        rootId: action.nodeId,
        columns: action.columns,
        colIndex: 0,
        cardIndex: 0,
        zoomStack: newZoomStack,
      };
    }

    case "ZOOM_OUT": {
      // Zoom out: pop from zoomStack, restore previous rootId
      if (state.zoomStack.length === 0) return state;
      const newZoomStack = [...state.zoomStack];
      const prevRootId = newZoomStack.pop();
      // Convert marker back to null if needed
      const newRootId = prevRootId === "__ROOT__" ? null : (prevRootId ?? null);
      return {
        ...state,
        rootId: newRootId,
        columns: action.columns,
        colIndex: 0,
        cardIndex: 0,
        zoomStack: newZoomStack,
      };
    }

    // ===== Multi-select Actions =====

    case "SELECT_CARD_ADD": {
      // Add a card to the selection
      const newSelected = new Set(state.selectedCards);
      newSelected.add(action.nodeId);
      return { ...state, selectedCards: newSelected };
    }

    case "SELECT_CARD_REMOVE": {
      // Remove a card from the selection
      const newSelected = new Set(state.selectedCards);
      newSelected.delete(action.nodeId);
      return { ...state, selectedCards: newSelected };
    }

    case "SELECT_CARD_TOGGLE": {
      // Toggle a card's selection state
      const newSelected = new Set(state.selectedCards);
      if (newSelected.has(action.nodeId)) {
        newSelected.delete(action.nodeId);
      } else {
        newSelected.add(action.nodeId);
      }
      return { ...state, selectedCards: newSelected };
    }

    case "SELECT_ALL_COLUMN": {
      // Select all cards in the current column
      const column = state.columns[state.colIndex];
      if (!column) return state;
      const newSelected = new Set(state.selectedCards);
      for (const card of column.cards) {
        newSelected.add(card.nodeId);
      }
      return { ...state, selectedCards: newSelected };
    }

    case "SELECT_ALL": {
      // Select all cards in all columns
      const newSelected = new Set(state.selectedCards);
      for (const column of state.columns) {
        for (const card of column.cards) {
          newSelected.add(card.nodeId);
        }
      }
      return { ...state, selectedCards: newSelected };
    }

    case "CLEAR_SELECTION": {
      // Clear all selected cards
      return { ...state, selectedCards: new Set() };
    }

    // ===== New Item Dialog Actions =====

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

    // ===== Project Picker Actions =====

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
        projectPickerIndex: 0, // Reset index when query changes
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

    // ===== Detail Pane Actions =====

    case "TOGGLE_DETAIL_PANE": {
      return { ...state, detailPaneOpen: !state.detailPaneOpen };
    }

    // ===== Outline Depth Actions =====

    case "INCREASE_OUTLINE_DEPTH": {
      // Cap at 99 (effectively unlimited)
      if (state.maxOutlineDepth >= 99) return state;
      return { ...state, maxOutlineDepth: state.maxOutlineDepth + 1 };
    }

    case "DECREASE_OUTLINE_DEPTH": {
      // Minimum 0 (only top-level cards)
      if (state.maxOutlineDepth <= 0) return state;
      return { ...state, maxOutlineDepth: state.maxOutlineDepth - 1 };
    }

    // ===== Content Lines Actions =====

    case "INCREASE_CONTENT_LINES": {
      // Cap at 10 lines max
      if (state.maxContentLines >= 10) return state;
      return { ...state, maxContentLines: state.maxContentLines + 1 };
    }

    case "DECREASE_CONTENT_LINES": {
      // Minimum 0 (no content preview)
      if (state.maxContentLines <= 0) return state;
      return { ...state, maxContentLines: state.maxContentLines - 1 };
    }

    default:
      return state;
  }
}

/**
 * Create initial board state
 */
export function createInitialBoardState(
  columns: ColumnState[],
  rootId: string | null = null,
  rootPath: string | null = null,
): BoardState {
  return {
    rootId,
    rootPath,
    columns,
    colIndex: 0,
    cardIndex: 0,
    selectedCards: new Set(),
    visualMode: false,
    foldedCards: new Set(),
    collapsedColumns: new Set(),
    searchQuery: "",
    searchMode: false,
    helpMode: false,
    zoomStack: [],
    navHistory: [],
    navHistoryIndex: 0,
    newItemMode: false,
    newItemText: "",
    projectPickerOpen: false,
    projectPickerQuery: "",
    projectPickerIndex: 0,
    detailPaneOpen: false,
    maxOutlineDepth: 99, // 99 = show all levels
    maxContentLines: 2, // Default: show 2 lines of content
  };
}
