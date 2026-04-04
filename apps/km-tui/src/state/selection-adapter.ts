/**
 * Selection Adapter — Bridges km's ViewTree to @silvery/selection's SelectionApp.
 *
 * createSelection() needs a SelectionApp with tree.{walkOrder, parent, children}.
 * km's visual hierarchy lives in the ViewIndex (Map<string, ViewNode>) which is
 * rebuilt each frame. This adapter provides a live bridge via getter callbacks,
 * so the selection store always reads the freshest tree.
 */

import type { SelectionApp, ID } from "@silvery/selection"
import type { ViewNode } from "@km/board"

// =============================================================================
// Types
// =============================================================================

/** Callbacks that return the current ViewTree state. Updated each layout derivation. */
export interface SelectionTreeSource {
  /** Current ViewIndex: nodeId → ViewNode */
  getViewIndex(): Map<string, ViewNode>
  /** Current ViewTree root */
  getViewTree(): ViewNode
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a SelectionApp adapter from live ViewTree callbacks.
 *
 * The returned object satisfies createSelection()'s SelectionApp interface.
 * walkOrder does a DFS of the current ViewTree, collecting IDs.
 * parent/children look up the ViewIndex.
 */
export function createSelectionAppAdapter(source: SelectionTreeSource): SelectionApp {
  return {
    tree: {
      walkOrder(root: ID | null): readonly ID[] {
        const index = source.getViewIndex()
        const tree = source.getViewTree()

        // Find the subtree root
        const startNode = root ? index.get(root) : tree
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
        const index = source.getViewIndex()
        const vn = index.get(id)
        if (!vn?.parent) return undefined
        // Don't return the board root as a parent (it's not selectable)
        if (vn.parent.role === "board") return undefined
        return vn.parent.id as ID
      },

      children(id: ID): readonly ID[] {
        const index = source.getViewIndex()
        const vn = index.get(id)
        if (!vn) return []
        return vn.children.map((c) => c.id as ID)
      },
    },
  }
}
