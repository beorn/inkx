/**
 * Cycle-protected tree-walk helpers over `ViewTreeProjection`-shaped trees.
 *
 * The lens-projected `tree.children(id)` can return ancestor ids when the
 * vault contains embed cycles (file A embeds file B, file B embeds file A).
 * Pure recursive DFS without a visited set hangs the JS event loop on the
 * next zoom-out / cursor-restore that re-walks the affected subtree
 * (Ctrl-C dead, the symptom of @km/tui/zoom-out-crash).
 *
 * These helpers ONLY depend on `children(id) → readonly string[]`, so they
 * accept any compatible shape — keeps tests free of the full
 * `@km/board` dependency.
 */

export interface TreeChildrenSource {
  children(id: string): readonly string[]
}

/**
 * Find the path of node ids from a descendant of `rootId` down to `targetId`,
 * exclusive of `rootId` itself. Returns `[]` when `rootId === targetId`,
 * `null` when `targetId` is unreachable from `rootId` (or null).
 *
 * Cycle-safe: each (root, target) call visits any given id at most once.
 */
export function findDescendantPath(
  tree: TreeChildrenSource,
  rootId: string,
  targetId: string | null,
): string[] | null {
  if (!targetId) return null
  if (rootId === targetId) return []
  const visited = new Set<string>([rootId])
  return walk(tree, rootId, targetId, visited)
}

function walk(
  tree: TreeChildrenSource,
  currentId: string,
  targetId: string,
  visited: Set<string>,
): string[] | null {
  for (const childId of tree.children(currentId)) {
    if (visited.has(childId)) continue
    visited.add(childId)
    if (childId === targetId) return [childId]
    const childPath = walk(tree, childId, targetId, visited)
    if (childPath) return [childId, ...childPath]
  }
  return null
}

/**
 * Collect `rootId` plus every reachable descendant in depth-first pre-order.
 * Cycle-safe: each id appears at most once even when the projection produces
 * cyclic `children()`.
 */
export function collectTreeDescendants(tree: TreeChildrenSource, rootId: string): string[] {
  const out: string[] = []
  const visited = new Set<string>()
  collect(tree, rootId, out, visited)
  return out
}

function collect(
  tree: TreeChildrenSource,
  id: string,
  out: string[],
  visited: Set<string>,
): void {
  if (visited.has(id)) return
  visited.add(id)
  out.push(id)
  for (const childId of tree.children(id)) {
    collect(tree, childId, out, visited)
  }
}
