/**
 * Tree Actions
 *
 * Content manipulation actions for the tree layer.
 * These describe intent; the board/app layer handles execution
 * by calling @km/storage and rebuilding the tree.
 *
 * Key design decisions:
 * - Actions are idempotent (set to a value, not toggle)
 * - Toggle logic belongs in commands, which read state and compute target values
 * - Actions use simple names without prefixes (UPDATE_NODE, not T_UPDATE_NODE)
 */

import type { KNode } from "@km/core"

/**
 * Tree content manipulation actions.
 * These describe intent; the effect layer executes via @km/storage.
 *
 * Actions are idempotent - they set to specific values, not toggle.
 * Example: { type: "UPDATE_NODE", updates: { item: { task: { marker: "[x]", status: "done" } } } }
 *          NOT { type: "TOGGLE_TASK_STATUS" }
 */
export type TAction =
  | { type: "ADD_NODE"; parentId: string | null; node: Partial<KNode> }
  | {
      type: "MOVE_NODE"
      nodeId: string
      newParentId: string | null
      newIndex: number
    }
  | { type: "DELETE_NODE"; nodeId: string }
  | { type: "UPDATE_NODE"; nodeId: string; updates: Partial<KNode> }

/** Action type constants for tree actions */
export const TActionTypes = {
  ADD_NODE: "ADD_NODE",
  MOVE_NODE: "MOVE_NODE",
  DELETE_NODE: "DELETE_NODE",
  UPDATE_NODE: "UPDATE_NODE",
} as const

/**
 * Check if an action is a tree action.
 * Used by boardReducer to detect pass-through actions.
 */
export function isTAction(action: { type: string }): action is TAction {
  return action.type in TActionTypes
}
