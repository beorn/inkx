/**
 * useBoardState Hook
 *
 * Pure state management for the board. Reducer + selectors.
 * No side effects, no store access - just state transitions.
 */

import { useReducer, useMemo } from "react";
import type {
  BoardState,
  BoardAction,
  ColumnState,
  CardState,
} from "../types.ts";

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
  };
}

/**
 * Board state hook with selectors
 */
export interface BoardStateHook {
  state: BoardState;
  dispatch: (action: BoardAction) => void;

  // Computed selectors
  currentColumn: ColumnState | null;
  currentCard: CardState | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
}

export function useBoardState(initialState: BoardState): BoardStateHook {
  const [state, dispatch] = useReducer(boardReducer, initialState);

  const currentColumn = useMemo(
    () => state.columns[state.colIndex] ?? null,
    [state.columns, state.colIndex],
  );

  const currentCard = useMemo(
    () => currentColumn?.cards[state.cardIndex] ?? null,
    [currentColumn, state.cardIndex],
  );

  const canMoveUp = state.cardIndex > 0;
  const canMoveDown = currentColumn
    ? state.cardIndex < currentColumn.cards.length - 1
    : false;
  const canMoveLeft = state.colIndex > 0;
  const canMoveRight = state.colIndex < state.columns.length - 1;

  return {
    state,
    dispatch,
    currentColumn,
    currentCard,
    canMoveUp,
    canMoveDown,
    canMoveLeft,
    canMoveRight,
  };
}

export default useBoardState;
