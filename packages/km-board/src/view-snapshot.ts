/**
 * ViewSnapshot — Immutable derived view of the board tree.
 *
 * Single computed artifact from (repo, rootId, foldDepths). Replaces the
 * scattered derivation of columns, walkOrder, viewIndex, nodeIndex that
 * previously happened in 14 separate call sites.
 *
 * All accessors are lazy + cached: built on first access, stable until
 * the snapshot is replaced (immutable after construction).
 *
 * Usage with alien-signals:
 * ```ts
 * const view = computed(() => createViewSnapshot(repo, rootId(), foldDepths()))
 * // In React:
 * const snap = useSignal(view)
 * const cols = snap.columns      // lazy, cached
 * const wo = snap.walkOrder      // lazy, cached
 * const vn = snap.get("node-id") // O(1) lookup
 * ```
 */

import type { ViewNode, ViewTreeRepo, ViewNodeColumnCache } from "./view-tree.ts"
import { buildViewTree, buildViewIndex, ViewTree, classifyCursorFromViewIndex } from "./view-tree.ts"

// =============================================================================
// Types
// =============================================================================

/** Cursor ancestry — which column/card contains the cursor. */
export interface CursorAncestors {
  cursorCardNodeId: string | null
  cursorColumnNodeId: string | null
  cursorDepth: "board" | "column" | "card"
}

/** Immutable snapshot of the board's visual structure. */
export interface ViewSnapshot {
  /** The ViewNode tree root. */
  readonly tree: ViewNode
  /** O(1) node lookup by ID. */
  readonly index: ReadonlyMap<string, ViewNode>
  /** Column ViewNodes (tree.children). Stable reference. */
  readonly columns: readonly ViewNode[]
  /** DFS walk order of all selectable node IDs (lazy, cached). */
  readonly walkOrder: readonly string[]
  /** Classify cursor: find its card/column ancestor and depth. */
  classify(nodeId: string | null): CursorAncestors
  /** Get a node by ID (shorthand for index.get). */
  get(id: string): ViewNode | undefined
  /** Next node in DFS walk order (O(1) tree traversal, no array). */
  nextInWalk(id: string): string | null
  /** Previous node in DFS walk order (O(1) tree traversal, no array). */
  prevInWalk(id: string): string | null
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create an immutable ViewSnapshot from the repo + nav state.
 *
 * The snapshot is frozen after construction — all lazy fields are computed
 * on first access and cached. Safe to pass to React (stable references).
 *
 * @param repo — ViewTreeRepo (getNode, getChildren, getNodesBatch)
 * @param rootId — current zoom root (null for repo root)
 * @param foldDepths — fold state per node (0 = folded, absent = inherit)
 * @param cache — optional per-column ViewNode cache for incremental rebuild
 * @param hiddenNodeIds — nodes to exclude from the tree
 */
export function createViewSnapshot(
  repo: ViewTreeRepo,
  rootId: string | null,
  foldDepths: Map<string, number>,
  cache?: ViewNodeColumnCache,
  hiddenNodeIds?: Set<string>,
): ViewSnapshot {
  const tree = buildViewTree(repo, rootId, foldDepths, cache, hiddenNodeIds)
  const index = buildViewIndex(tree)

  // Lazy + cached accessors
  let _walkOrder: readonly string[] | null = null
  const columns = tree.children as readonly ViewNode[]

  return {
    tree,
    index,
    columns,

    get walkOrder(): readonly string[] {
      if (_walkOrder === null) {
        const ids: string[] = []
        for (const node of ViewTree.nodes(tree)) {
          if (node.role !== "board") ids.push(node.id)
        }
        _walkOrder = ids
      }
      return _walkOrder
    },

    classify(nodeId: string | null): CursorAncestors {
      return classifyCursorFromViewIndex(index, nodeId)
    },

    get(id: string): ViewNode | undefined {
      return index.get(id)
    },

    nextInWalk(id: string): string | null {
      const node = index.get(id)
      if (!node) return null
      // DFS next: first child, or next sibling, or ancestor's next sibling
      if (node.children.length > 0) return node.children[0]!.id
      let current: ViewNode | null = node
      while (current) {
        if (!current.parent || current.parent.role === "board") {
          // At top level — check siblings
          const siblings = current.parent?.children ?? tree.children
          const idx = siblings.indexOf(current)
          if (idx >= 0 && idx < siblings.length - 1) return siblings[idx + 1]!.id
          return null // last top-level node
        }
        const siblings = current.parent.children
        const idx = siblings.indexOf(current)
        if (idx >= 0 && idx < siblings.length - 1) return siblings[idx + 1]!.id
        current = current.parent // backtrack up
      }
      return null
    },

    prevInWalk(id: string): string | null {
      const node = index.get(id)
      if (!node) return null
      // DFS prev: previous sibling's deepest descendant, or parent
      const parent = node.parent
      if (!parent) return null
      const siblings = parent.children
      const idx = siblings.indexOf(node)
      if (idx > 0) {
        // Previous sibling's deepest last descendant
        let prev = siblings[idx - 1]!
        while (prev.children.length > 0) prev = prev.children[prev.children.length - 1]!
        return prev.id
      }
      // No previous sibling — parent (unless parent is board root)
      if (parent.role === "board") return null
      return parent.id
    },
  }
}
