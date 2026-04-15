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
 *
 * walkOrder caching: the full-subtree DFS is O(N) — on a ~528k-node vault the
 * naïve implementation cost 3-5s per select() call, freezing input for several
 * seconds after startup (km-tui.startup-input-freeze). We cache the walk per
 * (lens, root) pair and invalidate on update(newLens). The store still sees a
 * fresh (validated) walkOrder on every select; we just don't recompute it if
 * nothing has changed since the last call.
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

  // walkOrder cache: keyed by `(lens, root)`. Invalidated whenever update() is
  // called with a fresh lens — createViewLens() returns a new instance on every
  // input change (repoVersion, foldDepths, rootId…), so identity-compare catches
  // every invalidation signal the lens pipeline already produces.
  //
  // `rootKey` uses the sentinel "\0null" because a Map<ID | null, ...> isn't
  // quite precise enough in TypeScript and using the plain null key mingles
  // with a possible "null" string ID. This is purely internal bookkeeping.
  const NULL_ROOT: string = "\0null"
  let cacheLens: TreeLens | null = null
  const cache = new Map<string, readonly ID[]>()

  function walkOrderCached(root: ID | null): readonly ID[] {
    if (!currentLens) return []

    // Invalidate when the lens identity changes. createViewLens returns a new
    // object on every input change, so the check is trivially cheap.
    if (cacheLens !== currentLens) {
      cache.clear()
      cacheLens = currentLens
    }

    const key = root ?? NULL_ROOT
    const cached = cache.get(key as string)
    if (cached !== undefined) return cached

    const result = computeWalkOrder(root)
    cache.set(key as string, result)
    return result
  }

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
      if (newLens !== currentLens) {
        currentLens = newLens
        // Cache is lens-identity-keyed, so an explicit clear isn't required —
        // but clearing now frees memory from the previous lens earlier.
        cache.clear()
        cacheLens = newLens
      }
    },
    setBeforeRead(cb) {
      beforeRead = cb
    },
  }

  const app: SelectionApp = {
    tree: {
      walkOrder(root: ID | null): readonly ID[] {
        beforeRead?.()
        return walkOrderCached(root)
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
