/**
 * Tree Traversal — configurable DFS walk and spatial queries.
 *
 * walkTree: generator yielding nodes in DFS pre-order with depth tracking.
 * getVisibleBlocks: flat list of visible nodes in document order for a column.
 */

import type { KNode } from "@km/core"
import type { TreeMutator } from "./block-ops.ts"

/** Yielded by walkTree for each visited node. */
export interface WalkEntry {
  node: KNode
  depth: number
  parentId: string | null
}

export interface WalkOptions {
  /** Return false to skip this node AND its entire subtree. */
  filter?: (node: KNode) => boolean
  /** Maximum depth to traverse (0 = root only, undefined = unlimited). */
  maxDepth?: number
}

/**
 * DFS pre-order traversal of a tree starting from rootId.
 *
 * Root node is depth 0. When `filter` returns false for a node,
 * that node and all its descendants are skipped entirely.
 */
export function* walkTree(tree: TreeMutator, rootId: string, opts?: WalkOptions): Generator<WalkEntry> {
  const root = tree.getNode(rootId)
  if (!root) return

  const { filter, maxDepth } = opts ?? {}

  if (filter && !filter(root)) return

  // Iterative DFS with explicit stack (avoids call-stack overflow on deep trees)
  const stack: Array<{ node: KNode; depth: number; parentId: string | null }> = [
    { node: root, depth: 0, parentId: root.parent_id },
  ]

  while (stack.length > 0) {
    // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- length check above
    const entry = stack.pop()!
    yield entry

    // Don't expand children if we've reached maxDepth
    if (maxDepth !== undefined && entry.depth >= maxDepth) continue

    // Push children in reverse order so leftmost child is processed first
    const children = tree.getChildren(entry.node.id)
    for (let i = children.length - 1; i >= 0; i--) {
      // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- loop bounds
      const child = children[i]!
      if (filter && !filter(child)) continue
      stack.push({ node: child, depth: entry.depth + 1, parentId: entry.node.id })
    }
  }
}

/**
 * Get all visible blocks in a column for spatial navigation.
 *
 * Returns nodes in document order (DFS pre-order), filtering out
 * nodes where `isVisible` returns false. When a node is not visible,
 * its descendants are also skipped.
 */
export function getVisibleBlocks(
  tree: TreeMutator,
  columnId: string,
  opts?: { isVisible?: (nodeId: string) => boolean },
): KNode[] {
  const isVisible = opts?.isVisible
  const filter = isVisible ? (node: KNode) => isVisible(node.id) : undefined
  const result: KNode[] = []
  for (const entry of walkTree(tree, columnId, { filter })) {
    result.push(entry.node)
  }
  return result
}
