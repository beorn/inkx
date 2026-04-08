/**
 * Reduced Signal Engine — unit tests
 *
 * Tests the core engine: declarative descriptors with function accessors,
 * batch, counts-not-booleans, ancestor/descendant propagation, cleanup.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { signal } from "alien-signals"
import { createReactiveTree, tree, isReducedDescriptor, type TreeAccess, type ReactiveTreeStore } from "../src/state/reduced-signals.ts"

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Simple tree:
 *     root
 *     ├── col1
 *     │   ├── card1
 *     │   │   ├── sub1
 *     │   │   └── sub2
 *     │   └── card2
 *     └── col2
 *         └── card3
 */
function simpleTree(): TreeAccess {
  const parentMap: Record<string, string | null> = {
    root: null,
    col1: "root",
    col2: "root",
    card1: "col1",
    card2: "col1",
    card3: "col2",
    sub1: "card1",
    sub2: "card1",
  }
  const childrenMap: Record<string, string[]> = {
    root: ["col1", "col2"],
    col1: ["card1", "card2"],
    col2: ["card3"],
    card1: ["sub1", "sub2"],
    card2: [],
    card3: [],
    sub1: [],
    sub2: [],
  }
  return {
    parent: (id) => parentMap[id] ?? null,
    children: (id) => childrenMap[id] ?? [],
  }
}

/** Standard state definition matching the design doc */
const stateDef = {
  cursor: signal(false),
  selected: signal(false),
  editing: signal(false),
  cursorDescendant: tree.descendants((s: { cursor: unknown }) => s.cursor).some(),
  selectedAncestor: tree.ancestors((s: { selected: unknown }) => s.selected).some(),
  editingDescendant: tree.descendants((s: { editing: unknown }) => s.editing).some(),
}

// ─── Descriptor Tests ───────────────────────────────────────────────────────

describe("descriptors", () => {
  it("tree.ancestors(s => s.selected).some() creates a branded descriptor", () => {
    const desc = tree.ancestors((s: { selected: unknown }) => s.selected).some()
    expect(isReducedDescriptor(desc)).toBe(true)
    expect(desc.direction).toBe("up")
    expect(desc.sourceKey).toBe("selected")
    expect(desc.reducerType).toBe("some")
  })

  it("tree.descendants(s => s.cursor).some() captures 'cursor' key", () => {
    const desc = tree.descendants((s: { cursor: unknown }) => s.cursor).some()
    expect(desc.direction).toBe("down")
    expect(desc.sourceKey).toBe("cursor")
  })

  it("tree.descendants(s => s.editing).count() creates count descriptor", () => {
    const desc = tree.descendants((s: { editing: unknown }) => s.editing).count()
    expect(desc.reducerType).toBe("count")
  })

  it("non-descriptor values return false", () => {
    expect(isReducedDescriptor(null)).toBe(false)
    expect(isReducedDescriptor(42)).toBe(false)
    expect(isReducedDescriptor({})).toBe(false)
  })
})

// ─── Imperative Iterators ───────────────────────────────────────────────────

describe("tree.up", () => {
  it("walks parent chain excluding self", () => {
    expect([...tree.up(simpleTree(), "sub1")]).toEqual(["card1", "col1", "root"])
  })

  it("root has no ancestors", () => {
    expect([...tree.up(simpleTree(), "root")]).toEqual([])
  })
})

describe("tree.down", () => {
  it("DFS walk excluding self", () => {
    expect([...tree.down(simpleTree(), "col1")]).toEqual(["card1", "sub1", "sub2", "card2"])
  })

  it("leaf has no descendants", () => {
    expect([...tree.down(simpleTree(), "sub1")]).toEqual([])
  })

  it("root walks entire tree", () => {
    expect([...tree.down(simpleTree(), "root")]).toHaveLength(7)
  })
})

// ─── Store + Batch ──────────────────────────────────────────────────────────

describe("createReactiveTree", () => {
  let store: ReactiveTreeStore<typeof stateDef>
  let t: TreeAccess

  beforeEach(() => {
    store = createReactiveTree(stateDef)
    t = simpleTree()
  })

  describe("typed node accessor", () => {
    it("primary signals default to false", () => {
      expect(store.get("card1").cursor()).toBe(false)
    })

    it("primary signals are writable via accessor", () => {
      store.get("card1").cursor(true)
      expect(store.get("card1").cursor()).toBe(true)
    })

    it("reduced signals are readable", () => {
      expect(store.get("card1").cursorDescendant()).toBe(false)
    })
  })

  describe("cursorDescendant propagation", () => {
    it("cursor on leaf → ancestors get cursorDescendant", () => {
      store.batch(t, () => store.get("sub1").cursor(true))

      expect(store.get("card1").cursorDescendant()).toBe(true)
      expect(store.get("col1").cursorDescendant()).toBe(true)
      expect(store.get("root").cursorDescendant()).toBe(true)
      // self excluded
      expect(store.get("sub1").cursorDescendant()).toBe(false)
      // other branches unaffected
      expect(store.get("col2").cursorDescendant()).toBe(false)
    })

    it("cursor move clears old path, sets new path", () => {
      store.batch(t, () => store.get("sub1").cursor(true))

      store.batch(t, () => {
        store.get("sub1").cursor(false)
        store.get("card2").cursor(true)
      })

      expect(store.get("card1").cursorDescendant()).toBe(false)
      expect(store.get("col1").cursorDescendant()).toBe(true) // card2 still under col1
    })

    it("cross-column cursor move", () => {
      store.batch(t, () => store.get("card1").cursor(true))
      expect(store.get("col1").cursorDescendant()).toBe(true)

      store.batch(t, () => {
        store.get("card1").cursor(false)
        store.get("card3").cursor(true)
      })

      expect(store.get("col1").cursorDescendant()).toBe(false)
      expect(store.get("col2").cursorDescendant()).toBe(true)
    })
  })

  describe("selectedAncestor propagation", () => {
    it("selecting card makes descendants see selectedAncestor", () => {
      store.batch(t, () => store.get("card1").selected(true))

      expect(store.get("sub1").selectedAncestor()).toBe(true)
      expect(store.get("sub2").selectedAncestor()).toBe(true)
      // self excluded
      expect(store.get("card1").selectedAncestor()).toBe(false)
      // non-descendants unaffected
      expect(store.get("card2").selectedAncestor()).toBe(false)
    })

    it("deselecting clears descendants", () => {
      store.batch(t, () => store.get("card1").selected(true))
      store.batch(t, () => store.get("card1").selected(false))
      expect(store.get("sub1").selectedAncestor()).toBe(false)
    })
  })

  describe("counts not booleans", () => {
    it("two cursor descendants: remove one → still true", () => {
      store.batch(t, () => {
        store.get("sub1").cursor(true)
        store.get("sub2").cursor(true)
      })

      expect(store.get("card1").cursorDescendant()).toBe(true)

      store.batch(t, () => store.get("sub1").cursor(false))
      expect(store.get("card1").cursorDescendant()).toBe(true) // sub2 still

      store.batch(t, () => store.get("sub2").cursor(false))
      expect(store.get("card1").cursorDescendant()).toBe(false)
    })
  })

  describe("node removal", () => {
    it("removing node with active signal subtracts from ancestors", () => {
      store.batch(t, () => store.get("sub1").cursor(true))
      expect(store.get("card1").cursorDescendant()).toBe(true)

      store.delete("sub1", t)

      expect(store.get("card1").cursorDescendant()).toBe(false)
      expect(store.has("sub1")).toBe(false)
    })
  })

  describe("batch atomicity", () => {
    it("cursor move is atomic — reduced signals consistent after batch", () => {
      store.batch(t, () => store.get("sub1").cursor(true))

      store.batch(t, () => {
        store.get("sub1").cursor(false)
        store.get("card3").cursor(true)
      })

      expect(store.get("card1").cursorDescendant()).toBe(false)
      expect(store.get("col2").cursorDescendant()).toBe(true)
    })
  })

  describe("edge cases", () => {
    it("deselected state: no cursor → all cursorDescendant false", () => {
      store.batch(t, () => store.get("sub1").cursor(true))
      store.batch(t, () => store.get("sub1").cursor(false))

      expect(store.get("card1").cursorDescendant()).toBe(false)
      expect(store.get("root").cursorDescendant()).toBe(false)
    })

    it("setting same value twice is a no-op", () => {
      store.batch(t, () => store.get("sub1").cursor(true))
      store.batch(t, () => store.get("sub1").cursor(true))
      // No double-counting — still exactly 1
      expect(store.get("card1").cursorDescendant()).toBe(true)
    })

    it("removing non-existent node is safe", () => {
      store.delete("does-not-exist", t)
    })

    it("batch with no changes is safe", () => {
      store.batch(t, () => {})
    })

    it("clear resets all state", () => {
      store.batch(t, () => store.get("sub1").cursor(true))
      store.clear()
      expect(store.size).toBe(0)
      expect(store.has("sub1")).toBe(false)
    })
  })

  describe("editingDescendant", () => {
    it("editing sub-item propagates editingDescendant to card", () => {
      store.batch(t, () => store.get("sub1").editing(true))

      expect(store.get("card1").editingDescendant()).toBe(true)
      expect(store.get("col1").editingDescendant()).toBe(true)
      expect(store.get("sub1").editingDescendant()).toBe(false) // self excluded
    })

    it("stop editing clears editingDescendant", () => {
      store.batch(t, () => store.get("sub1").editing(true))
      store.batch(t, () => store.get("sub1").editing(false))

      expect(store.get("card1").editingDescendant()).toBe(false)
    })
  })
})
