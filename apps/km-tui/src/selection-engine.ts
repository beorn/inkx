/**
 * SelectionEngine — Pure tree-based selection operations.
 *
 * Extracted from reactive.ts (expandWithDescendants) and inspired by
 * Decker's areaselect.ts (removeNesting). All operations work on node IDs
 * via a minimal TreeReader-compatible repo interface.
 */

import type { TreeReader } from "@km/tree"

// =============================================================================
// Interface
// =============================================================================

export interface SelectionEngine {
  /** Expand IDs to include all descendants. */
  expandWithDescendants(ids: ReadonlySet<string>): Set<string>

  /** Remove child IDs when an ancestor is already in the set. */
  removeNesting(ids: ReadonlySet<string>): Set<string>

  /** All node IDs between anchor and focus in visual (depth-first) tree-walk order. */
  getRange(anchor: string, focus: string): string[]

  /** Siblings of a node (children of the same parent, including the node itself). */
  getSiblings(nodeId: string): { id: string; parent_idx: number }[]
}

// =============================================================================
// Factory
// =============================================================================

export function createSelectionEngine(repo: TreeReader): SelectionEngine {
  return {
    expandWithDescendants(ids) {
      if (ids.size === 0) return new Set()
      const expanded = new Set<string>(ids)
      for (const id of ids) {
        collectDescendants(repo, id, expanded)
      }
      return expanded
    },

    removeNesting(ids) {
      if (ids.size <= 1) return new Set(ids)
      const arr = Array.from(ids)
      const removed = new Set<number>()

      for (let i = 0; i < arr.length; i++) {
        if (removed.has(i)) continue
        for (let j = i + 1; j < arr.length; j++) {
          if (removed.has(j)) continue
          if (isAncestor(repo, arr[i]!, arr[j]!)) {
            removed.add(j)
          } else if (isAncestor(repo, arr[j]!, arr[i]!)) {
            removed.add(i)
            break // i is removed, no need to check further
          }
        }
      }

      const result = new Set<string>()
      for (let i = 0; i < arr.length; i++) {
        if (!removed.has(i)) result.add(arr[i]!)
      }
      return result
    },

    getRange(anchor, focus) {
      if (anchor === focus) return [anchor]

      // Find the common root to walk from. Walk up from both nodes to find
      // the highest ancestor that contains both, then DFS from there.
      const root = findCommonAncestor(repo, anchor, focus)
      if (!root) return [anchor] // disconnected trees

      // DFS from root, collect order
      const order: string[] = []
      dfs(repo, root, order)

      const anchorIdx = order.indexOf(anchor)
      const focusIdx = order.indexOf(focus)
      if (anchorIdx === -1 || focusIdx === -1) return [anchor]

      const lo = Math.min(anchorIdx, focusIdx)
      const hi = Math.max(anchorIdx, focusIdx)
      return order.slice(lo, hi + 1)
    },

    getSiblings(nodeId) {
      const node = repo.getNode(nodeId)
      if (!node?.parent_id) return []
      return repo.getChildren(node.parent_id)
    },
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Recursively collect all descendants of a node into the target set. */
function collectDescendants(repo: TreeReader, nodeId: string, target: Set<string>): void {
  const children = repo.getChildren(nodeId)
  for (const child of children) {
    target.add(child.id)
    collectDescendants(repo, child.id, target)
  }
}

/** Check if `ancestor` is a proper ancestor of `descendant`. */
function isAncestor(repo: TreeReader, ancestorId: string, descendantId: string): boolean {
  let current = repo.getNode(descendantId)
  while (current?.parent_id) {
    if (current.parent_id === ancestorId) return true
    current = repo.getNode(current.parent_id)
  }
  return false
}

/** Find the lowest common ancestor of two nodes. */
function findCommonAncestor(repo: TreeReader, a: string, b: string): string | null {
  // Collect ancestors of a (including a itself)
  const ancestorsA = new Set<string>()
  let cur: ReturnType<TreeReader["getNode"]> = repo.getNode(a)
  while (cur) {
    ancestorsA.add(cur.id)
    if (!cur.parent_id) break
    cur = repo.getNode(cur.parent_id)
  }

  // Walk up from b to find the first ancestor in a's chain
  cur = repo.getNode(b)
  while (cur) {
    if (ancestorsA.has(cur.id)) return cur.id
    if (!cur.parent_id) break
    cur = repo.getNode(cur.parent_id)
  }

  return null
}

/** Depth-first walk, collecting node IDs in order. */
function dfs(repo: TreeReader, nodeId: string, out: string[]): void {
  out.push(nodeId)
  const children = repo.getChildren(nodeId)
  for (const child of children) {
    dfs(repo, child.id, out)
  }
}
