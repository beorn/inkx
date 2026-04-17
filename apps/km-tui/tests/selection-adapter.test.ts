/**
 * Selection Adapter tests — O(1) contains() + TreeLens bridge.
 *
 * km-silvery.selection-contains retired the walkOrder cache: store.select()
 * now validates IDs via `app.tree.contains(id)` (O(1) repo lookup) instead of
 * filtering against a tree walk. On 500k-node vaults this was the difference
 * between a 3-second input freeze per keystroke and no freeze at all
 * (km-tui.startup-input-freeze).
 *
 * These tests mock a TreeLens so we can prove:
 *   - contains() delegates to lens.get() and never walks the tree
 *   - 50 rapid selects don't walk the tree at all
 *   - selectableAncestor uses contains() instead of building a walkOrder Set
 *   - walkOrder is still available for range ops that genuinely need order
 */

import { describe, expect, it } from "vitest"
import { createSelectionAdapter } from "../src/state/selection-adapter.ts"
import { createSelection } from "@silvery/selection"
import type { ID } from "@silvery/selection"
import type { TreeLens, ViewType } from "@km/board"
import type { KNode } from "@km/core"

// =============================================================================
// Test helpers — minimal TreeLens that counts walk calls
// =============================================================================

interface CountingLens {
  lens: TreeLens
  childrenCalls: () => number
  walkOrderCalls: () => number
  getCalls: () => number
}

/**
 * Build a tiny TreeLens with three cards in one column under a root. Counts
 * every call to children(), walkOrder, and get() — enough to distinguish
 * "validated a single id" (get) from "walked the tree" (children/walkOrder).
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
  let getCount = 0

  const lens: TreeLens = {
    rootId: "root",
    get: (id: string) => {
      getCount++
      return childMap.has(id) ? makeNode(id) : undefined
    },
    children: (id: string) => {
      childrenCount++
      return childMap.get(id) ?? []
    },
    parent: (id: string) => parentMap.get(id) ?? null,
    role: (id: string): ViewType | undefined => {
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
    getCalls: () => getCount,
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("createSelectionAdapter — tree.contains() is O(1)", () => {
  it("contains() delegates to lens.get() and never walks the tree", () => {
    const { lens, childrenCalls, walkOrderCalls, getCalls } = createCountingLens()
    const { app, source } = createSelectionAdapter()
    source.update(lens)

    // A real id — returns true
    expect(app.tree.contains("cardA" as ID)).toBe(true)
    // A stale id — returns false
    expect(app.tree.contains("ghost" as ID)).toBe(false)

    // Exactly two get() calls, no tree walk
    expect(getCalls()).toBe(2)
    expect(childrenCalls()).toBe(0)
    expect(walkOrderCalls()).toBe(0)
  })

  it("rapid cursor-navigation selects do NOT walk the tree", () => {
    // km-tui.startup-input-freeze regression guard. Each store.select() in
    // @silvery/selection used to call app.tree.walkOrder(root) — at 528k
    // nodes that was 3 seconds PER keystroke. With contains()-based
    // validation, 50 selects should produce zero walks.
    const { lens, childrenCalls, walkOrderCalls, getCalls } = createCountingLens()
    const { app, source } = createSelectionAdapter()
    source.update(lens)

    const sel = createSelection(app, { initialRoot: "root" as ID })

    // Warm the cache with one navigation
    sel.node.select(["cardA" as ID])
    expect(sel.node.cursor()).toBe("cardA")

    // 50 more single-ID selects against the same lens
    const targets = ["cardB", "cardC", "cardA"] as ID[]
    for (let i = 0; i < 50; i++) {
      sel.node.select([targets[i % targets.length]!])
    }

    // Zero walks — everything went through contains()
    expect(childrenCalls()).toBe(0)
    expect(walkOrderCalls()).toBe(0)
    // get() was called ~once per select (51 total)
    expect(getCalls()).toBeGreaterThanOrEqual(51)
    expect(sel.node.cursor()).not.toBeNull()
  })

  it("selects with stale IDs filter them out and leave state clean", () => {
    // The old walkOrder filter silently dropped stale IDs. contains() must
    // preserve that semantic so callers can pass a mix without crashing.
    const { lens } = createCountingLens()
    const { app, source } = createSelectionAdapter()
    source.update(lens)

    const sel = createSelection(app, { initialRoot: "root" as ID })

    sel.node.select(["ghost" as ID, "cardB" as ID, "phantom" as ID])
    expect(sel.node.cursor()).toBe("cardB")
    expect([...sel.node.ids()]).toEqual(["cardB"])
  })

  it("updates lens reference in place (no caching)", () => {
    const l1 = createCountingLens()
    const l2 = createCountingLens()
    const { app, source } = createSelectionAdapter()

    source.update(l1.lens)
    expect(app.tree.contains("cardA" as ID)).toBe(true)
    expect(l1.getCalls()).toBe(1)
    expect(l2.getCalls()).toBe(0)

    // Swap lens — reads go to the new one
    source.update(l2.lens)
    expect(app.tree.contains("cardA" as ID)).toBe(true)
    expect(l2.getCalls()).toBe(1)
    expect(l1.getCalls()).toBe(1) // untouched by the second call
  })

  it("walkOrder is still exposed for range ops", () => {
    // extend()/reconcile() need walk order. contains() can't replace them.
    // This test proves the bridge is still wired so those ops keep working.
    const { lens, walkOrderCalls, childrenCalls } = createCountingLens()
    const { app, source } = createSelectionAdapter()
    source.update(lens)

    const order = app.tree.walkOrder(null)
    expect(order).toEqual(["root", "col1", "cardA", "cardB", "cardC"])
    expect(walkOrderCalls()).toBe(1)

    // Subtree walk from a specific root uses children(), not walkOrder
    const sub = app.tree.walkOrder("col1" as ID)
    expect(sub).toEqual(["col1", "cardA", "cardB", "cardC"])
    expect(childrenCalls()).toBeGreaterThan(0)
  })

  it("contains() returns false when no lens is installed", () => {
    const { app } = createSelectionAdapter()
    expect(app.tree.contains("anything" as ID)).toBe(false)
  })

  it("fires beforeRead hook on contains()", () => {
    const { lens } = createCountingLens()
    const { app, source } = createSelectionAdapter()
    source.update(lens)

    let callCount = 0
    source.setBeforeRead(() => {
      callCount++
    })

    app.tree.contains("cardA" as ID)
    expect(callCount).toBe(1)
    app.tree.contains("cardB" as ID)
    expect(callCount).toBe(2)
  })
})
