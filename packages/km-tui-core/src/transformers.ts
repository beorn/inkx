/**
 * ViewModel Transformers
 *
 * Transform state data into ViewModels for rendering.
 * Pure functions - no side effects, no React, no domain imports.
 */

import type {
  BoardState,
  ColumnState,
  CardState,
  ViewMode,
  CardViewModel,
  ColumnViewModel,
  BoardViewModel,
} from "./types.ts";

/**
 * Transform a CardState into a CardViewModel
 */
export function toCardViewModel(
  card: CardState,
  isFolded: boolean,
): CardViewModel {
  return {
    id: card.nodeId,
    title: card.title,
    childCount: card.childCount,
    isTask: card.isTask,
    taskStatus: card.taskStatus,
    color: card.color,
    icon: card.icon,
    isFolded,
    // Rich task display fields
    priority: card.priority,
    dueDate: card.dueDate,
    hasBacklinks: card.hasBacklinks,
    refsCount: card.refsCount,
    content: card.content,
  };
}

/**
 * Transform a ColumnState into a ColumnViewModel
 */
export function toColumnViewModel(
  column: ColumnState,
  foldedCards: Set<string>,
  isCollapsed: boolean,
): ColumnViewModel {
  return {
    id: column.nodeId,
    title: column.title,
    count: column.cards.length,
    wipLimit: column.wipLimit,
    isOverLimit:
      column.wipLimit !== undefined && column.cards.length > column.wipLimit,
    isCollapsed,
    cards: column.cards.map((card) =>
      toCardViewModel(card, foldedCards.has(card.nodeId)),
    ),
  };
}

/**
 * Filter cards by search query (case-insensitive title match)
 */
function filterCardsByQuery(
  cards: CardViewModel[],
  query: string,
): CardViewModel[] {
  if (!query) {
    return cards;
  }
  const lowerQuery = query.toLowerCase();
  return cards.filter((card) => card.title.toLowerCase().includes(lowerQuery));
}

/**
 * Transform full BoardState into BoardViewModel
 */
export function toBoardViewModel(
  state: BoardState,
  viewMode: ViewMode,
): BoardViewModel {
  // Transform columns to view models
  const columns = state.columns.map((col, i) =>
    toColumnViewModel(col, state.foldedCards, state.collapsedColumns.has(i)),
  );

  // Apply search filter if query is present
  const filteredColumns = state.searchQuery
    ? columns.map((col) => ({
        ...col,
        cards: filterCardsByQuery(col.cards, state.searchQuery),
        count: filterCardsByQuery(col.cards, state.searchQuery).length,
      }))
    : columns;

  return {
    rootPath: state.rootPath,
    columns: filteredColumns,
    selectedCol: state.colIndex,
    selectedCard: state.cardIndex,
    selectedCards: state.selectedCards,
    viewMode,
    searchQuery: state.searchQuery,
    searchMode: state.searchMode,
    helpMode: state.helpMode,
  };
}
