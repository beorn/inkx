/**
 * Scroll Helpers for ListView
 *
 * Shared utilities for ListView scroll behavior across views.
 */

/**
 * Calculate the scrollTo index for a ListView in a column.
 *
 * Only scrolls when the column is selected AND the selected card index is valid.
 * When the column is not selected, returns undefined to freeze scroll state.
 *
 * @param isSelected - Whether this column is the currently selected column
 * @param selectedCardIndex - The index of the selected card in the column
 * @param cardCount - Total number of cards in the column
 * @returns The card index to scroll to, or undefined to freeze
 */
export function getScrollToIndex(
  isSelected: boolean,
  selectedCardIndex: number,
  cardCount: number,
): number | undefined {
  if (!isSelected) return undefined
  if (selectedCardIndex < 0) return undefined
  if (selectedCardIndex >= cardCount) return undefined
  return selectedCardIndex
}
