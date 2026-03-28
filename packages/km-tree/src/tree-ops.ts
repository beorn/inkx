/**
 * TreeOps — repo-dependent Position helpers.
 *
 * Pure tree operations that resolve abstract Position values against a tree.
 * Position type + construction helpers (of, first, last, equals) are in @km/core.
 * This file has the repo-dependent operations: toSortOrder, nodeAt, isAtPosition, moveTo.
 */

import type { Position } from "@km/core"

// =============================================================================
// Minimal Interface
// =============================================================================

/** Minimal tree-reading interface for position queries. */
export interface TreeReader {
  getNode(id: string): { id: string; parent_id: string | null; parent_idx: number; name?: string | null } | null
  getChildren(parentId: string | null): { id: string; parent_idx: number }[]
}

/** Tree reader extended with mutation for moveTo. */
export interface TreeMover extends TreeReader {
  moveNode(id: string, parentId: string, sortOrder: number): void
}

// =============================================================================
// TreeOps Namespace
// =============================================================================

/** A node-like shape returned by nodeAt. */
type NodeLike = { id: string; parent_id: string | null; parent_idx: number; name?: string | null }

export const TreeOps = {
  /**
   * Convert an abstract Position to a concrete sort order for repo.moveNode().
   * childIdx 0 -> before the first child, childIdx -1 -> after the last child.
   * A concrete childIdx (>0) is passed through.
   */
  toSortOrder(tree: TreeReader, pos: Position): { parentId: string; sortOrder: number } {
    const children = tree.getChildren(pos.parentId)
    if (children.length === 0) return { parentId: pos.parentId, sortOrder: 0 }
    if (pos.childIdx === 0) {
      // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- length > 0 guarantees element exists
      return { parentId: pos.parentId, sortOrder: children[0]!.parent_idx - 1 }
    }
    if (pos.childIdx === -1) {
      // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- length > 0 guarantees element exists
      return { parentId: pos.parentId, sortOrder: children.at(-1)!.parent_idx + 1 }
    }
    return { parentId: pos.parentId, sortOrder: pos.childIdx }
  },

  /** Get the node currently at a position (or null if the slot is empty). */
  nodeAt(tree: TreeReader, pos: Position): NodeLike | null {
    const children = tree.getChildren(pos.parentId)
    if (children.length === 0) return null
    // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- length > 0 guarantees element exists
    if (pos.childIdx === 0) return (tree.getNode(children[0]!.id) as NodeLike) ?? null
    // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- length > 0 guarantees element exists
    if (pos.childIdx === -1) return (tree.getNode(children.at(-1)!.id) as NodeLike) ?? null
    const match = children.find((c) => c.parent_idx === pos.childIdx)
    return match ? ((tree.getNode(match.id) as NodeLike) ?? null) : null
  },

  /** Check if a node is already at the given position. */
  isAtPosition(tree: TreeReader, nodeId: string, pos: Position): boolean {
    const children = tree.getChildren(pos.parentId)
    if (children.length === 0) return false
    // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- length > 0 guarantees element exists
    if (pos.childIdx === 0) return children[0]!.id === nodeId
    // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- length > 0 guarantees element exists
    if (pos.childIdx === -1) return children.at(-1)!.id === nodeId
    const match = children.find((c) => c.parent_idx === pos.childIdx)
    return match?.id === nodeId
  },

  /**
   * Move a node to a Position. Resolves abstract childIdx (-1, 0) to concrete
   * sort order, then calls tree.moveNode. Returns false if already there.
   */
  moveTo(tree: TreeMover, nodeId: string, pos: Position): boolean {
    if (TreeOps.isAtPosition(tree, nodeId, pos)) return false
    const { parentId, sortOrder } = TreeOps.toSortOrder(tree, pos)
    tree.moveNode(nodeId, parentId, sortOrder)
    return true
  },
} as const
