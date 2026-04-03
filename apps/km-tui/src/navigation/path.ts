/**
 * Path — SlateJS-aligned structural coordinate system.
 *
 * A Path is a number[] describing a node's position in the tree
 * by sibling indices at each level:
 *   []        = root level
 *   [2]       = 3rd child of root
 *   [2, 5]    = 6th child of that node
 *   [2, 5, 0] = 1st child of that node
 */

import type { KNode } from "@km/core"
import type { Repo } from "@km/storage"
import { indexOfChild } from "./sibling-index.ts"

// =============================================================================
// Path type and pure arithmetic helpers
// =============================================================================

export type Path = number[]

/** Pure arithmetic helpers — no repo dependency. */
export const Path = {
  /** Parent path: [2, 5, 0] -> [2, 5]. Empty for root. */
  parent(path: Path): Path {
    return path.slice(0, -1)
  },

  /** Next sibling: [2, 5] -> [2, 6] */
  next(path: Path): Path {
    if (path.length === 0) return path
    const last = path.at(-1) ?? 0
    return [...path.slice(0, -1), last + 1]
  },

  /** Previous sibling: [2, 5] -> [2, 4] */
  previous(path: Path): Path {
    if (path.length === 0) return path
    const last = path.at(-1) ?? 0
    return [...path.slice(0, -1), last - 1]
  },

  /** All ancestor paths (prefixes), from root down. */
  ancestors(path: Path): Path[] {
    const result: Path[] = []
    for (let i = 1; i <= path.length; i++) {
      result.push(path.slice(0, i))
    }
    return result
  },

  /** Lexicographic comparison: -1 if a < b, 0 if equal, 1 if a > b. */
  compare(a: Path, b: Path): -1 | 0 | 1 {
    const len = Math.min(a.length, b.length)
    for (let i = 0; i < len; i++) {
      const ai = a[i] ?? 0
      const bi = b[i] ?? 0
      if (ai < bi) return -1
      if (ai > bi) return 1
    }
    if (a.length < b.length) return -1
    if (a.length > b.length) return 1
    return 0
  },

  /** True if `a` is a strict ancestor (prefix) of `b`. */
  isAncestor(a: Path, b: Path): boolean {
    if (a.length >= b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  },

  /** Depth (same as path.length). */
  depth(path: Path): number {
    return path.length
  },

  /** True if a and b represent the same position. */
  equals(a: Path, b: Path): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  },
}

// =============================================================================
// NodePath — repo-aware resolution
// =============================================================================

export const NodePath = {
  /**
   * Derive the path of a node by walking up from nodeId to rootId.
   * Returns null if nodeId is not a descendant of rootId.
   */
  pathOf(repo: Repo, rootId: string | null, nodeId: string): Path | null {
    const indices: number[] = []
    let currentId: string | null = nodeId

    while (currentId !== rootId) {
      const node: import("@km/core").KNode | null = currentId ? repo.getNode(currentId) : null
      if (!node) return null

      const parentId: string | null = node.parent_id
      const siblings = repo.getChildren(parentId)
      if (!currentId) return null // Unreachable: getNode(currentId) succeeded above
      const index = indexOfChild(siblings, currentId)
      if (index === -1) return null

      indices.push(index)
      currentId = parentId
    }

    indices.reverse()
    return indices
  },

  /**
   * Resolve a path to a node by walking down from rootId.
   * Returns null if the path is invalid.
   */
  nodeAt(repo: Repo, rootId: string | null, path: Path): KNode | null {
    let parentId = rootId
    let node: KNode | null = null

    for (const index of path) {
      const children = repo.getChildren(parentId)
      if (index < 0 || index >= children.length) return null
      node = children[index] ?? null
      if (!node) return null
      parentId = node.id
    }

    return node
  },

  /**
   * Get the siblings at the same level as the given path.
   * For an empty path, returns children of rootId.
   */
  siblings(repo: Repo, rootId: string | null, path: Path): KNode[] {
    if (path.length === 0) {
      return repo.getChildren(rootId)
    }

    const parentPath = Path.parent(path)
    const parentNode = parentPath.length === 0 ? null : NodePath.nodeAt(repo, rootId, parentPath)

    const parentId = parentPath.length === 0 ? rootId : (parentNode?.id ?? null)
    return repo.getChildren(parentId)
  },
}
