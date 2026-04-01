/**
 * Tree — repo-dependent tree queries and mutations.
 *
 * SlateJS-style namespace. One import for everything that needs a tree reader:
 * queries (parent, children, nodeAt), mutations (moveTo), calculations (toSortOrder).
 *
 * Pure data types (Position, KNode) are in @km/core — no repo needed.
 * This namespace is the repo-dependent counterpart.
 */

import type { Position } from "@km/core"
import { midpoint } from "./sort-utils.ts"

/** Minimal tree-reading interface. */
export interface TreeReader {
  getNode(id: string): { id: string; parent_id: string | null; parent_idx: number; name?: string | null } | null
  getChildren(parentId: string | null): { id: string; parent_idx: number }[]
}

/** Tree reader extended with mutation for moveTo. */
export interface TreeMover extends TreeReader {
  moveNode(id: string, parentId: string, sortOrder: number): void
}

/** Node shape returned by Tree methods. */
type NodeLike = { id: string; parent_id: string | null; parent_idx: number; name?: string | null }
type ChildLike = { id: string; parent_idx: number }

/** Resolve abstract childIdx (0=first, -1=last) to a concrete child in the array. */
function childAt(children: ChildLike[], childIdx: number): ChildLike | undefined {
  if (children.length === 0) return undefined
  if (childIdx === 0) return children[0]
  if (childIdx === -1) return children[children.length - 1]
  return children.find((c) => c.parent_idx === childIdx)
}

export const Tree = {
  // =========================================================================
  // Queries — read the tree
  // =========================================================================

  /** Get the parent of a node (null for root or not found). */
  parent(tree: TreeReader, nodeId: string): NodeLike | null {
    const node = tree.getNode(nodeId)
    if (!node?.parent_id) return null
    return tree.getNode(node.parent_id) as NodeLike | null
  },

  /** Get children of a node, sorted by parent_idx. */
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

  /** Get siblings of a node (including itself), sorted by parent_idx. */
  siblings(tree: TreeReader, nodeId: string): NodeLike[] {
    const node = tree.getNode(nodeId)
    if (!node?.parent_id) return []
    return tree.getChildren(node.parent_id) as NodeLike[]
  },

  /** Get the node at a position (or null if empty). */
  nodeAt(tree: TreeReader, pos: Position): NodeLike | null {
    const child = childAt(tree.getChildren(pos.parentId), pos.childIdx)
    return child ? ((tree.getNode(child.id) as NodeLike) ?? null) : null
  },

  /** Check if a node is at the given position. */
  isAtPosition(tree: TreeReader, nodeId: string, pos: Position): boolean {
    return childAt(tree.getChildren(pos.parentId), pos.childIdx)?.id === nodeId
  },

  // =========================================================================
  // Calculations — derive values from tree state
  // =========================================================================

  /** Convert abstract Position to concrete sort order for repo.moveNode(). */
  toSortOrder(tree: TreeReader, pos: Position): { parentId: string; sortOrder: number } {
    // Concrete childIdx (not 0 or -1) passes through directly as sort order
    if (pos.childIdx !== 0 && pos.childIdx !== -1) return { parentId: pos.parentId, sortOrder: pos.childIdx }
    const child = childAt(tree.getChildren(pos.parentId), pos.childIdx)
    if (!child) return { parentId: pos.parentId, sortOrder: 0 }
    return {
      parentId: pos.parentId,
      sortOrder: pos.childIdx === 0 ? child.parent_idx - 1 : child.parent_idx + 1,
    }
  },

  /** Sort order midpoint between two sibling indices. For inserting between neighbors. */
  sortOrderBetween(tree: TreeReader, parentId: string, index: number, direction: "before" | "after"): number {
    const children = tree.getChildren(parentId)
    const order = (i: number) => children[i]?.parent_idx ?? i
    if (direction === "before") {
      return index === 0 ? order(0) - 1 : midpoint(order(index - 1), order(index))
    }
    return index >= children.length - 1 ? order(children.length - 1) + 1 : midpoint(order(index), order(index + 1))
  },

  // =========================================================================
  // Mutations — modify the tree
  // =========================================================================

  /** Move a node to a Position. Returns false if already there. */
  moveTo(tree: TreeMover, nodeId: string, pos: Position): boolean {
    if (Tree.isAtPosition(tree, nodeId, pos)) return false
    const { parentId, sortOrder } = Tree.toSortOrder(tree, pos)
    tree.moveNode(nodeId, parentId, sortOrder)
    return true
  },
} as const
