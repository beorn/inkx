/**
 * ViewModel Transformers
 *
 * Re-exports from shared package plus domain-specific transformers.
 */

import type { Node, TaskStatus } from "@km/core";
import { getNodeDisplayName } from "@km/shared";
import type { CardState, ColumnState } from "@km/tui";

// Re-export shared transformers
export {
  toCardViewModel,
  toColumnViewModel,
  toBoardViewModel,
} from "@km/tui";

// Re-export domain types
export type { Node, TaskStatus };

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
