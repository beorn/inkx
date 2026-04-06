/**
 * Selection Adapter — Bridges km's ViewTree lens to @silvery/selection's SelectionApp.
 *
 * createSelection() needs a SelectionApp with tree.{walkOrder, parent, children}.
 * The adapter wraps a TreeLens (from createVisibleLens) and provides a live bridge
 * via getter callbacks, so the selection store always reads the freshest tree.
 *
 * Auto-refresh: if a beforeRead callback is installed, the adapter calls it
 * before every tree operation (walkOrder, parent, children). The callback
 * checks repo version and triggers lens refresh if stale.
 */

import type { SelectionApp, ID } from "@silvery/selection"
import type { TreeLens } from "@km/board"

// =============================================================================
// Types
// =============================================================================

/** Mutable source that bridges the latest lens into the selection store. */
export interface SelectionTreeSource {
  /** Update the underlying lens (called after each layout derivation). */
  update(lens: TreeLens): void
  /** Install a callback invoked before each tree read. Use to auto-refresh stale data. */
  setBeforeRead(cb: () => void): void
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a SelectionApp adapter with a mutable TreeLens source.
 *
 * walkOrder delegates to lens.walkOrder (already includes the root).
 * parent/children delegate to lens.parent/lens.children.
 *
 * If a beforeRead callback is installed via source.setBeforeRead(),
 * it fires before every tree operation — use it to check freshness
 * and refresh the lens if the repo has mutated since the last update.
 */
export function createSelectionAdapter(): {
  app: SelectionApp
  source: SelectionTreeSource
} {
  let currentLens: TreeLens | null = null
  let beforeRead: (() => void) | null = null

  const source: SelectionTreeSource = {
    update(newLens) {
      currentLens = newLens
    },
    setBeforeRead(cb) {
      beforeRead = cb
    },
  }

  const app: SelectionApp = {
    tree: {
      walkOrder(root: ID | null): readonly ID[] {
        beforeRead?.()
        if (!currentLens) return []

        if (root === null) {
          // Full tree walk — lens.walkOrder already includes the root
          return currentLens.walkOrder as readonly ID[]
        }

        // Subtree walk from a specific root
        if (!currentLens.get(root)) return []
        const ids: ID[] = [root]
        const stack = [...currentLens.children(root)].reverse()
        while (stack.length > 0) {
          const id = stack.pop()!
          ids.push(id as ID)
          const children = currentLens.children(id)
          for (let i = children.length - 1; i >= 0; i--) {
            stack.push(children[i]!)
          }
        }
        return ids
      },

      parent(id: ID): ID | undefined {
        beforeRead?.()
        if (!currentLens) return undefined
        const p = currentLens.parent(id)
        return p == null ? undefined : (p as ID)
      },

      children(id: ID): readonly ID[] {
        beforeRead?.()
        if (!currentLens) return []
        return currentLens.children(id) as readonly ID[]
      },
    },
  }

  return { app, source }
}
