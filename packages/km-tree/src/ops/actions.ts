/**
 * Tree Ops
 *
 * Content manipulation ops for the tree layer.
 * These describe intent; the board/app layer handles execution
 * by calling @km/storage and rebuilding the tree.
 *
 * Key design decisions:
 * - Ops are idempotent (set to a value, not toggle)
 * - Toggle logic belongs in commands, which read state and compute target values
 * - Ops use simple names without prefixes (UPDATE_NODE, not T_UPDATE_NODE)
 */

import type { KNode } from "@km/core"

/**
 * Tree content manipulation ops.
 * These describe intent; the effect layer executes via @km/storage.
 *
 * Ops are idempotent - they set to specific values, not toggle.
 * Example: { type: "UPDATE_NODE", updates: { item: { task: { marker: "[x]", status: "done" } } } }
 *          NOT { type: "TOGGLE_TASK_STATUS" }
 */
export type TOp =
  | { type: "ADD_NODE"; parentId: string | null; node: Partial<KNode> }
  | {
      type: "MOVE_NODE"
      nodeId: string
      newParentId: string | null
      newIndex: number
    }
  | { type: "DELETE_NODE"; nodeId: string }
  | { type: "UPDATE_NODE"; nodeId: string; updates: Partial<KNode> }

/** Op type constants for tree ops */
export const TOpTypes = {
  ADD_NODE: "ADD_NODE",
  MOVE_NODE: "MOVE_NODE",
  DELETE_NODE: "DELETE_NODE",
  UPDATE_NODE: "UPDATE_NODE",
} as const

/**
 * Check if an op is a tree op.
 * Used by boardReducer to detect pass-through ops.
 */
export function isTOp(action: { type: string }): action is TOp {
  return action.type in TOpTypes
}
