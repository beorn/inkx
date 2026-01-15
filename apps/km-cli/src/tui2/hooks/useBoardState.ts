/**
 * useBoardState Hook
 *
 * React hook wrapper around the shared board state reducer.
 * Provides selectors as computed values via useMemo.
 */

import { useReducer, useMemo } from "react";
import {
  boardReducer,
  createInitialBoardState,
  getCurrentColumn,
  getCurrentCard,
  canMoveUp as selectCanMoveUp,
  canMoveDown as selectCanMoveDown,
  canMoveLeft as selectCanMoveLeft,
  canMoveRight as selectCanMoveRight,
  type BoardState,
  type BoardAction,
  type ColumnState,
  type CardState,
} from "@km/tui";

// Re-export for backwards compatibility
export { boardReducer, createInitialBoardState };
export type { BoardState, BoardAction, ColumnState, CardState };

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

  const currentColumn = useMemo(() => getCurrentColumn(state), [state]);

  const currentCard = useMemo(() => getCurrentCard(state), [state]);

  const canMoveUp = selectCanMoveUp(state);
  const canMoveDown = selectCanMoveDown(state);
  const canMoveLeft = selectCanMoveLeft(state);
  const canMoveRight = selectCanMoveRight(state);

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
