/**
 * Undo Operation Types
 *
 * Defines the operation types that can be recorded and reversed
 * by the undo/redo system. Operations use stable nodeIds (not paths)
 * and carry precomputed inverses for O(1) undo.
 *
 * Operation types:
 * - add_node: A node was added → inverse removes it
 * - remove_node: A node was removed → inverse re-adds it
 * - move_node: A node was moved → inverse moves it back
 * - update_node: A node was updated → inverse restores old values
 */

import type { KNode } from "@km/core"

// =============================================================================
// Operation Union
// =============================================================================

export type TreeOp = AddNodeOp | RemoveNodeOp | MoveNodeOp | UpdateNodeOp

export interface AddNodeOp {
  type: "add_node"
  nodeId: string
  parentId: string | null
  parentIdx: number
  snapshot: Partial<KNode>
}

export interface RemoveNodeOp {
  type: "remove_node"
  nodeId: string
  parentId: string | null
  parentIdx: number
  /** Full snapshot of the node at time of removal, for reinsertion */
  snapshot: KNode
  /** Snapshots of all descendants (children, grandchildren, etc.) for recursive restore */
  descendants: KNode[]
}

export interface MoveNodeOp {
  type: "move_node"
  nodeId: string
  fromParentId: string | null
  fromIdx: number
  toParentId: string | null
  toIdx: number
}

export interface UpdateNodeOp {
  type: "update_node"
  nodeId: string
  before: Partial<KNode>
  after: Partial<KNode>
}

// =============================================================================
// History Entry
// =============================================================================

/**
 * A single undo/redo entry. Contains the forward operations and their
 * precomputed inverses. Applying `inverseOperations` in reverse order
 * undoes the change; applying `operations` in forward order redoes it.
 */
export interface HistoryEntry {
  /** Forward operations (applied in order for redo) */
  treeops: TreeOp[]
  /** Precomputed inverse operations (applied in reverse order for undo) */
  inverseTreeOps: TreeOp[]
  /** Cursor position before the operation (restored on undo) */
  cursorBefore?: string | null
  /** Cursor position after the operation (restored on redo) */
  cursorAfter?: string | null
  /** Human-readable label for debugging/display */
  label?: string
}

// =============================================================================
// Inverse Computation
// =============================================================================

/**
 * Compute the inverse of a single operation.
 *
 * - add_node → remove_node (with the same snapshot)
 * - remove_node → add_node (with the saved snapshot)
 * - move_node → move_node (from/to swapped)
 * - update_node → update_node (before/after swapped)
 */
export function invertTreeOp(op: TreeOp): TreeOp {
  switch (op.type) {
    case "add_node":
      return {
        type: "remove_node",
        nodeId: op.nodeId,
        parentId: op.parentId,
        parentIdx: op.parentIdx,
        snapshot: op.snapshot as KNode,
        descendants: [],
      }
    case "remove_node":
      return {
        type: "add_node",
        nodeId: op.nodeId,
        parentId: op.parentId,
        parentIdx: op.parentIdx,
        snapshot: op.snapshot,
      }
    case "move_node":
      return {
        type: "move_node",
        nodeId: op.nodeId,
        fromParentId: op.toParentId,
        fromIdx: op.toIdx,
        toParentId: op.fromParentId,
        toIdx: op.fromIdx,
      }
    case "update_node":
      return {
        type: "update_node",
        nodeId: op.nodeId,
        before: op.after,
        after: op.before,
      }
  }
}

/**
 * Compute inverse operations for a list of operations.
 * The inverse list is in reverse order so that applying it
 * in forward order undoes the original operations correctly.
 */
export function invertTreeOps(ops: TreeOp[]): TreeOp[] {
  return ops.map(invertTreeOp).reverse()
}
