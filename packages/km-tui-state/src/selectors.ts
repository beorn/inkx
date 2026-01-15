/**
 * Board State Selectors
 *
 * Pure functions to derive values from BoardState.
 * No side effects, no React imports - pure TypeScript.
 */

import type { BoardState, ColumnState, CardState } from "./types.ts";

/**
 * Get the currently selected column
 */
export function getCurrentColumn(state: BoardState): ColumnState | null {
  return state.columns[state.colIndex] ?? null;
}

/**
 * Get the currently selected card
 */
export function getCurrentCard(state: BoardState): CardState | null {
  const column = getCurrentColumn(state);
  return column?.cards[state.cardIndex] ?? null;
}

/**
 * Check if cursor can move up
 */
export function canMoveUp(state: BoardState): boolean {
  return state.cardIndex > 0;
}

/**
 * Check if cursor can move down
 */
export function canMoveDown(state: BoardState): boolean {
  const column = getCurrentColumn(state);
  return column ? state.cardIndex < column.cards.length - 1 : false;
}

/**
 * Check if cursor can move left
 */
export function canMoveLeft(state: BoardState): boolean {
  return state.colIndex > 0;
}

/**
 * Check if cursor can move right
 */
export function canMoveRight(state: BoardState): boolean {
  return state.colIndex < state.columns.length - 1;
}

/**
 * Check if a card is folded
 */
export function isCardFolded(state: BoardState, cardId: string): boolean {
  return state.foldedCards.has(cardId);
}

/**
 * Check if a column is collapsed
 */
export function isColumnCollapsed(
  state: BoardState,
  colIndex: number,
): boolean {
  return state.collapsedColumns.has(colIndex);
}

/**
 * Get total card count across all columns
 */
export function getTotalCardCount(state: BoardState): number {
  return state.columns.reduce((sum, col) => sum + col.cards.length, 0);
}

/**
 * Check if column is over WIP limit
 */
export function isColumnOverWipLimit(column: ColumnState): boolean {
  return column.wipLimit !== undefined && column.cards.length > column.wipLimit;
}
