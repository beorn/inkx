/**
 * Selection Adapter tests — walkOrder caching + TreeLens bridge.
 *
 * Regression guard for km-tui.startup-input-freeze: on a ~528k-node vault,
 * every j/k keypress used to trigger a full O(N) DFS walk via
 * `@silvery/selection`'s store.select() → `app.tree.walkOrder()`. The walk
 * itself was uncached, so repeated selects (one per keypress) repeatedly
 * paid the full cost, blocking the main thread for 3-5 seconds per press
 * after startup. The fix caches walkOrder at the adapter level, keyed by
 * (lens identity, root) and invalidated whenever `update(newLens)` receives
 * a different lens reference.
 *
 * These tests mock a TreeLens so we can count walk invocations directly.
 */

import { describe, expect, it } from "vitest"
import { createSelectionAdapter } from "../src/state/selection-adapter.ts"
import { createSelection } from "@silvery/selection"
import type { ID } from "@silvery/selection"
import type { TreeLens, ViewRole } from "@km/board"
import type { KNode } from "@km/core"

// =============================================================================
// Test helpers — minimal TreeLens that counts walk calls
// =============================================================================

interface CountingLens {
  lens: TreeLens
  childrenCalls: () => number
  walkOrderCalls: () => number
}

/**
 * Build a tiny TreeLens with three cards in one column under a root. Counts
 * every call to children() and walkOrder — the two hottest paths walkOrder
 * traverses when computing the DFS from a non-null root.
 */
function createCountingLens(): CountingLens {
  // Tree shape:
  //   root
  //     col1
  //       cardA
  //       cardB
  //       cardC
  const childMap = new Map<string, readonly string[]>([
    ["root", ["col1"]],
    ["col1", ["cardA", "cardB", "cardC"]],
    ["cardA", []],
    ["cardB", []],
    ["cardC", []],
  ])
  const parentMap = new Map<string, string | null>([
    ["root", null],
    ["col1", "root"],
    ["cardA", "col1"],
    ["cardB", "col1"],
    ["cardC", "col1"],
  ])
  const makeNode = (id: string): KNode => ({ id, parent_id: parentMap.get(id) ?? null }) as KNode

  let childrenCount = 0
  let walkOrderCount = 0

  const lens: TreeLens = {
    rootId: "root",
    get: (id: string) => (childMap.has(id) ? makeNode(id) : undefined),
    children: (id: string) => {
      childrenCount++
      return childMap.get(id) ?? []
    },
    parent: (id: string) => parentMap.get(id) ?? null,
    role: (id: string): ViewRole | undefined => {
      if (id === "root") return "board"
      if (id === "col1") return "column"
      return "card"
    },
    isBody: () => false,
    resolvedEmbed: () => undefined,
    rules: () => undefined,
    nextInWalk: () => null,
    prevInWalk: () => null,
    get walkOrder() {
      walkOrderCount++
      return ["root", "col1", "cardA", "cardB", "cardC"]
    },
  }

  return {
    lens,
    childrenCalls: () => childrenCount,
    walkOrderCalls: () => walkOrderCount,
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("createSelectionAdapter — walkOrder cache (km-tui.startup-input-freeze)", () => {
  it("caches walkOrder across repeated calls with the same lens", () => {
    const { lens, childrenCalls } = createCountingLens()
    const { app, source } = createSelectionAdapter()
    source.update(lens)

    // First call — children() is invoked to compute the DFS
    const first = app.tree.walkOrder("root" as ID)
    const after1 = childrenCalls()
    expect(after1).toBeGreaterThan(0)

    // Second call with the same lens — cache hit, no extra children() calls
    const second = app.tree.walkOrder("root" as ID)
    expect(childrenCalls()).toBe(after1)
    expect(second).toEqual(first)

    // Third, tenth, hundredth — still cached
    for (let i = 0; i < 100; i++) app.tree.walkOrder("root" as ID)
    expect(childrenCalls()).toBe(after1)
  })

  it("invalidates the cache when update() receives a fresh lens", () => {
    const l1 = createCountingLens()
    const l2 = createCountingLens()
    const { app, source } = createSelectionAdapter()

    source.update(l1.lens)
    app.tree.walkOrder("root" as ID)
    const afterFirst = l1.childrenCalls()
    expect(afterFirst).toBeGreaterThan(0)

    // Lens swap — new lens means the cache must invalidate
    source.update(l2.lens)
    app.tree.walkOrder("root" as ID)
    expect(l2.childrenCalls()).toBeGreaterThan(0)
    // l1 was not touched by the second call
    expect(l1.childrenCalls()).toBe(afterFirst)
  })

  it("does NOT recompute when update() receives the identical lens ref", () => {
    const { lens, childrenCalls } = createCountingLens()
    const { app, source } = createSelectionAdapter()

    source.update(lens)
    app.tree.walkOrder("root" as ID)
    const before = childrenCalls()

    // Same reference — should keep the cache warm
    source.update(lens)
    app.tree.walkOrder("root" as ID)
    expect(childrenCalls()).toBe(before)
  })

  it("rapid cursor-navigation selects do NOT re-walk the tree", () => {
    // This is the km-tui.startup-input-freeze scenario in miniature:
    // a user pressing j 50 times before the lens ever changes. Each select()
    // in @silvery/selection calls app.tree.walkOrder(root) — the adapter
    // must hit cache so the total walk cost stays O(N), not O(N × keypresses).
    const { lens, childrenCalls } = createCountingLens()
    const { app, source } = createSelectionAdapter()
    source.update(lens)

    const sel = createSelection(app, { initialRoot: "root" as ID })

    // Warm the cache with one navigation
    sel.node.select(["cardA" as ID])
    const afterFirst = childrenCalls()
    expect(afterFirst).toBeGreaterThan(0)

    // 50 more single-ID selects against the same (unchanged) lens — cache hits
    const targets = ["cardB", "cardC", "cardA"] as ID[]
    for (let i = 0; i < 50; i++) {
      sel.node.select([targets[i % targets.length]!])
    }

    // Zero additional children() calls — walkOrder was served from cache.
    expect(childrenCalls()).toBe(afterFirst)
    expect(sel.node.cursor()).not.toBeNull()
  })

  it("caches separately for root=null vs root=<id>", () => {
    const { lens, walkOrderCalls, childrenCalls } = createCountingLens()
    const { app, source } = createSelectionAdapter()
    source.update(lens)

    // root=null takes the full-walkOrder branch
    app.tree.walkOrder(null)
    expect(walkOrderCalls()).toBe(1)

    // A second root=null call is cached
    app.tree.walkOrder(null)
    expect(walkOrderCalls()).toBe(1)

    // root="root" takes the subtree-walk branch (children)
    app.tree.walkOrder("root" as ID)
    const childrenAfter = childrenCalls()
    expect(childrenAfter).toBeGreaterThan(0)

    // A second root="root" call is cached (no additional children calls)
    app.tree.walkOrder("root" as ID)
    expect(childrenCalls()).toBe(childrenAfter)

    // Both entries are still live — null is still cached too
    app.tree.walkOrder(null)
    expect(walkOrderCalls()).toBe(1)
  })
})
