/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/**
 * Selection Adapter — Bridges km's ViewTree lens to @silvery/selection's SelectionApp.
 *
 * createSelection() needs a SelectionApp with tree.{walkOrder, parent, children,
 * contains}. The adapter wraps a TreeLens (from createVisibleLens) and provides
 * a live bridge via getter callbacks, so the selection store always reads the
 * freshest tree.
 *
 * Auto-refresh: if a beforeRead callback is installed, the adapter calls it
 * before every tree operation (walkOrder, parent, children, contains). The
 * callback checks repo version and triggers lens refresh if stale.
 *
 * Hot path: `contains(id)` is called on every select() — it must be O(1).
 * The adapter delegates to `lens.get(id) !== undefined`, which km's view
 * lens resolves through the repo's in-memory node cache. This replaces the
 * old O(visible) `walkOrder` filter that blocked the main thread for 3+
 * seconds per keystroke on 500k-node vaults. See
 * km-silvery.selection-contains and km-tui.startup-input-freeze for the
 * plateau story.
 *
 * walkOrder is still exposed for range operations (extend/reconcile) that
 * genuinely need tree-walk order — those fire once per user action, not
 * per render.
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
 * contains delegates to `lens.get(id) !== undefined` — O(1) existence check.
 * walkOrder delegates to lens.walkOrder (full subtree, used only by range ops).
 * parent/children delegate to lens.parent/lens.children.
 *
 * If a beforeRead callback is installed via source.setBeforeRead(), it fires
 * before every tree operation — use it to check freshness and refresh the
 * lens if the repo has mutated since the last update.
 */
export function createSelectionAdapter(): {
  app: SelectionApp
  source: SelectionTreeSource
} {
  let currentLens: TreeLens | null = null
  let beforeRead: (() => void) | null = null

  function computeWalkOrder(root: ID | null): readonly ID[] {
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
  }

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
        return computeWalkOrder(root)
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

      contains(id: ID): boolean {
        beforeRead?.()
        if (!currentLens) return false
        return currentLens.get(id) !== undefined
      },
    },
  }

  return { app, source }
}
