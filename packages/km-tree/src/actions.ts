/**
 * Tree Actions
 *
 * Content manipulation actions for the tree layer.
 * These describe intent; the board/app layer handles execution
 * by calling @km/storage and rebuilding the tree.
 */

import type { DBNode } from "@km/core";

/**
 * Tree content manipulation actions.
 * These describe intent; the board layer executes via @km/storage.
 */
export type TAction =
  | { type: "T_ADD_NODE"; parentId: string | null; node: Partial<DBNode> }
  | {
      type: "T_MOVE_NODE";
      nodeId: string;
      newParentId: string | null;
      newIndex: number;
    }
  | { type: "T_DELETE_NODE"; nodeId: string }
  | { type: "T_UPDATE_NODE"; nodeId: string; updates: Partial<DBNode> };

/**
 * Check if an action is a tree action.
 * Used by boardReducer to detect pass-through actions.
 */
export function isTAction(action: { type: string }): action is TAction {
  return action.type.startsWith("T_");
}
