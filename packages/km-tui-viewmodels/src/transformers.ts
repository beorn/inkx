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
} from "@km/tui-state";
import type {
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
 * Transform full BoardState into BoardViewModel
 */
export function toBoardViewModel(
  state: BoardState,
  viewMode: ViewMode,
): BoardViewModel {
  return {
    rootPath: state.rootPath,
    columns: state.columns.map((col, i) =>
      toColumnViewModel(col, state.foldedCards, state.collapsedColumns.has(i)),
    ),
    selectedCol: state.colIndex,
    selectedCard: state.cardIndex,
    viewMode,
    searchQuery: state.searchQuery,
    searchMode: state.searchMode,
    helpMode: state.helpMode,
  };
}
