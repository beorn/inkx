/**
 * Selection Adapter — Bridges km's ViewTree to @silvery/selection's SelectionApp.
 *
 * createSelection() needs a SelectionApp with tree.{walkOrder, parent, children}.
 * km's visual hierarchy lives in the ViewIndex (Map<string, ViewNode>) which is
 * rebuilt each frame. This adapter provides a live bridge via getter callbacks,
 * so the selection store always reads the freshest tree.
 *
 * Auto-refresh: if a beforeRead callback is installed, the adapter calls it
 * before every tree operation (walkOrder, parent, children). The callback
 * checks repo version and rebuilds the ViewTree if stale. This eliminates
 * the need for manual refreshSelTree() calls at every mutation site.
 */

import type { SelectionApp, ID } from "@silvery/selection"
import type { ViewNode } from "@km/board"

// =============================================================================
// Types
// =============================================================================

/** Mutable source that bridges the latest ViewTree into the selection store. */
export interface SelectionTreeSource {
  /** Update the underlying tree data (called after each layout derivation). */
  update(viewIndex: Map<string, ViewNode>, viewTree: ViewNode): void
  /** Install a callback invoked before each tree read. Use to auto-refresh stale data. */
  setBeforeRead(cb: () => void): void
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a SelectionApp adapter with a mutable tree source.
 *
 * Returns both the SelectionApp (for createSelection()) and the
 * SelectionTreeSource (to call .update() after each layout derivation).
 *
 * walkOrder does a DFS of the current ViewTree, collecting IDs.
 * parent/children look up the ViewIndex.
 *
 * If a beforeRead callback is installed via source.setBeforeRead(),
 * it fires before every tree operation — use it to check freshness
 * and rebuild the ViewTree if the repo has mutated since the last update.
 */
export function createSelectionAdapter(): {
  app: SelectionApp
  source: SelectionTreeSource
} {
  let viewIndex: Map<string, ViewNode> = new Map()
  let viewTree: ViewNode = {
    id: "__root__",
    role: "board",
    node: null,
    parent: null,
    children: [],
    isBody: false,
  }
  let beforeRead: (() => void) | null = null

  const source: SelectionTreeSource = {
    update(newIndex, newTree) {
      viewIndex = newIndex
      viewTree = newTree
    },
    setBeforeRead(cb) {
      beforeRead = cb
    },
  }

  const app: SelectionApp = {
    tree: {
      walkOrder(root: ID | null): readonly ID[] {
        beforeRead?.()

        // Find the subtree root
        const startNode = root ? viewIndex.get(root) : viewTree
        if (!startNode) return []

        // DFS collecting IDs (skip the board root itself — it's not selectable)
        const ids: ID[] = []
        const stack: ViewNode[] = [...startNode.children].reverse()
        while (stack.length > 0) {
          const node = stack.pop()!
          ids.push(node.id as ID)
          // Push children in reverse so first child is popped first
          for (let i = node.children.length - 1; i >= 0; i--) {
            stack.push(node.children[i]!)
          }
        }
        return ids
      },

      parent(id: ID): ID | undefined {
        beforeRead?.()
        const vn = viewIndex.get(id)
        if (!vn?.parent) return undefined
        // Don't return the board root as a parent (it's not selectable)
        if (vn.parent.role === "board") return undefined
        return vn.parent.id as ID
      },

      children(id: ID): readonly ID[] {
        beforeRead?.()
        const vn = viewIndex.get(id)
        if (!vn) return []
        return vn.children.map((c) => c.id as ID)
      },
    },
  }

  return { app, source }
}
