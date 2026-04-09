/**
 * captureTree — Snapshot the current repo tree state as an immutable SelectionTree.
 *
 * Used with sel.transform(op, prevTree, nextTree) to repair selection atomically
 * across tree mutations (SlateJS pattern). Call once BEFORE the mutation to snapshot
 * the pre-state, again AFTER the mutation to snapshot the post-state, and pass both
 * to sel.transform.
 *
 * The snapshot walks from the given root and captures walkOrder, has, contains.
 * The returned SelectionTree is immutable and reflects the repo state at call time,
 * decoupled from any subsequent mutations.
 *
 * Performance: O(n) where n is the subtree size. Precomputes walkOrder + parent map,
 * so has() is O(1) and contains() is O(depth). For very large trees consider caching
 * if called repeatedly within a single operation.
 */

import type { Repo } from "@km/storage"
import type { ID, SelectionTree } from "@silvery/selection"

/**
 * Snapshot the current repo tree state rooted at `root` as an immutable SelectionTree.
 *
 * @param repo   Storage repo to read from
 * @param root   Root node ID to scope the walk (null = repo root)
 */
export function captureTree(repo: Repo, root: ID | null): SelectionTree {
  const walk: ID[] = []
  const parentOf = new Map<ID, ID | null>()

  // DFS walk from root — matches the tree-walk order used by selection reconciliation.
  const visit = (id: string, parent: string | null): void => {
    walk.push(id as ID)
    parentOf.set(id as ID, (parent as ID | null) ?? null)
    for (const child of repo.getChildren(id)) {
      visit(child.id, id)
    }
  }

  if (root !== null) {
    visit(root as string, null)
  } else {
    // null root → walk from top-level children
    for (const child of repo.getChildren(null)) {
      visit(child.id, null)
    }
  }

  const walkSet = new Set(walk)

  return {
    walkOrder: (_scopeRoot: ID | null): readonly ID[] => walk,
    has: (id: ID): boolean => walkSet.has(id),
    contains: (ancestor: ID, descendant: ID): boolean => {
      if (ancestor === descendant) return true
      let cur: ID | null = parentOf.get(descendant) ?? null
      while (cur !== null) {
        if (cur === ancestor) return true
        cur = parentOf.get(cur) ?? null
      }
      return false
    },
  }
}
