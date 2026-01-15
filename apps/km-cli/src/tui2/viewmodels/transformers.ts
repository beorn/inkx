/**
 * ViewModel Transformers
 *
 * Transform domain data (Node, CardState) into ViewModels for rendering.
 * This is the bridge between the domain layer and the presentation layer.
 */

import type { Node, TaskStatus } from "@km/core";
import { getNodeDisplayName } from "@km/shared";
import type {
  CardViewModel,
  ColumnViewModel,
  BoardViewModel,
  BoardState,
  ColumnState,
  CardState,
  ViewMode,
} from "../types.ts";

// Re-export domain types
export type { Node, TaskStatus };

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
  const currentCol = state.columns[state.colIndex];
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

/**
 * Create CardState from domain Node
 * This is called during state initialization from the store.
 */
export function nodeToCardState(node: Node, children: Node[]): CardState {
  return {
    nodeId: node.id,
    title: getNodeDisplayName(node),
    childCount: children.length,
    isTask: !!node.task,
    taskStatus: node.task?.status as TaskStatus | undefined,
    // color and icon would be computed from node metadata
    color: undefined,
    icon: undefined,
  };
}

/**
 * Create ColumnState from domain Node
 */
export function nodeToColumnState(
  node: Node,
  cards: CardState[],
  wipLimit?: number,
): ColumnState {
  return {
    nodeId: node.id,
    title: getNodeDisplayName(node),
    cards,
    wipLimit,
  };
}
