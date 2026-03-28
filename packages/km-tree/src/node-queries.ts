/**
 * NodeQuery — pure tree-reading queries.
 *
 * Stateless queries that navigate a tree via the TreeReader interface.
 * No mutations, no side effects. For position-based helpers (toSortOrder,
 * nodeAt, moveTo), see TreeOps.
 */

import type { TreeReader } from "./tree-ops.ts"

/** Node shape returned by NodeQuery methods. */
type NodeLike = { id: string; parent_id: string | null; parent_idx: number }

export const NodeQuery = {
  /** Get the parent of a node (null for root nodes or if parent not found). */
  parent(tree: TreeReader, nodeId: string): NodeLike | null {
    const node = tree.getNode(nodeId)
    if (!node?.parent_id) return null
    return tree.getNode(node.parent_id) as NodeLike | null
  },

  /** Get the children of a node, sorted by parent_idx. */
  children(tree: TreeReader, parentId: string): NodeLike[] {
    return tree.getChildren(parentId) as NodeLike[]
  },

  /** Get ancestors from node up to root (nearest ancestor first). */
  ancestors(tree: TreeReader, nodeId: string): NodeLike[] {
    const result: NodeLike[] = []
    let current = tree.getNode(nodeId)
    while (current?.parent_id) {
      const parent = tree.getNode(current.parent_id)
      if (!parent) break
      result.push(parent as NodeLike)
      current = parent
    }
    return result
  },

  /** Get siblings of a node (including itself), sorted by parent_idx. Returns [] for root nodes. */
  siblings(tree: TreeReader, nodeId: string): NodeLike[] {
    const node = tree.getNode(nodeId)
    if (!node?.parent_id) return []
    return tree.getChildren(node.parent_id) as NodeLike[]
  },
} as const
