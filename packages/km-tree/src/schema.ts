/**
 * Schema — structural rules for the km node model.
 *
 * Pure predicate functions that encode what the data model allows.
 * Used by validators, outliner ops, and tests to enforce invariants.
 */

import type { TreeMutator } from "./ops/block-ops.ts"

/** Can this node have children? Only items can. */
export function canHaveChildren(node: { item?: unknown }): boolean {
  return node.item != null
}

/** Can parent accept child? Items can have any children. Blocks cannot. */
export function canParent(parent: { item?: unknown }, _child: { item?: unknown }): boolean {
  return canHaveChildren(parent)
}

/** Can this node become a block (lose item trait)? Only if it has no children. */
export function canBecomeBlock(tree: TreeMutator, nodeId: string): boolean {
  return tree.getChildren(nodeId).length === 0
}
