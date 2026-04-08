/**
 * Reduced Signal Engine — unit tests
 *
 * Tests the core engine: descriptors, batch, counts-not-booleans,
 * ancestor/descendant propagation, cleanup.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { ReducedSignalStore, tree, isReducedDescriptor, type TreeAccess } from "../src/state/reduced-signals.ts"

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
    root: null, col1: "root", col2: "root",
    card1: "col1", card2: "col1", card3: "col2",
    sub1: "card1", sub2: "card1",
  }
  const childrenMap: Record<string, string[]> = {
    root: ["col1", "col2"], col1: ["card1", "card2"], col2: ["card3"],
    card1: ["sub1", "sub2"], card2: [], card3: [], sub1: [], sub2: [],
  }
  return {
    parent: (id) => parentMap[id] ?? null,
    children: (id) => childrenMap[id] ?? [],
  }
}

/** Read a reduced signal value */
function readReduced(store: ReducedSignalStore, nodeId: string, name: string): unknown {
  const sig = store.node(nodeId).reduced.get(name)
  return sig ? sig() : undefined
}

// ─── Descriptor Tests ───────────────────────────────────────────────────────

describe("descriptors", () => {
  it("tree.ancestors().some() creates a branded descriptor", () => {
    const desc = tree.ancestors("cursor").some()
    expect(isReducedDescriptor(desc)).toBe(true)
    expect(desc.direction).toBe("up")
    expect(desc.sourceKey).toBe("cursor")
    expect(desc.reducerType).toBe("some")
  })

  it("tree.descendants().some() creates a branded descriptor", () => {
    const desc = tree.descendants("cursor").some()
    expect(isReducedDescriptor(desc)).toBe(true)
    expect(desc.direction).toBe("down")
  })

  it("tree.descendants().count() creates count descriptor", () => {
    const desc = tree.descendants("selected").count()
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

describe("ReducedSignalStore", () => {
  let store: ReducedSignalStore
  let t: TreeAccess

  beforeEach(() => {
    store = new ReducedSignalStore()
    t = simpleTree()
    store.defineReduced("cursorDescendant", tree.descendants("cursor").some())
    store.defineReduced("selectedAncestor", tree.ancestors("selected").some())
  })

  describe("basic operations", () => {
    it("primary signals default to false", () => {
      expect(store.peekPrimary("card1", "cursor")).toBe(false)
    })

    it("setPrimary updates the primary signal", () => {
      store.setPrimary("card1", "cursor", true)
      expect(store.peekPrimary("card1", "cursor")).toBe(true)
    })

    it("reduced signals initialize to false", () => {
      expect(readReduced(store, "card1", "cursorDescendant")).toBe(false)
    })
  })

  describe("cursorDescendant propagation", () => {
    it("cursor on leaf → ancestors get cursorDescendant", () => {
      store.batch(t, () => store.setPrimary("sub1", "cursor", true))

      expect(readReduced(store, "card1", "cursorDescendant")).toBe(true)
      expect(readReduced(store, "col1", "cursorDescendant")).toBe(true)
      expect(readReduced(store, "root", "cursorDescendant")).toBe(true)
      // self excluded
      expect(readReduced(store, "sub1", "cursorDescendant")).toBe(false)
      // other branches unaffected
      expect(readReduced(store, "col2", "cursorDescendant")).toBe(false)
      expect(readReduced(store, "card3", "cursorDescendant")).toBe(false)
    })

    it("cursor move clears old path, sets new path", () => {
      store.batch(t, () => store.setPrimary("sub1", "cursor", true))
      expect(readReduced(store, "card1", "cursorDescendant")).toBe(true)

      store.batch(t, () => {
        store.setPrimary("sub1", "cursor", false)
        store.setPrimary("card2", "cursor", true)
      })

      expect(readReduced(store, "card1", "cursorDescendant")).toBe(false)
      expect(readReduced(store, "col1", "cursorDescendant")).toBe(true) // card2 still under col1
      expect(readReduced(store, "root", "cursorDescendant")).toBe(true)
    })

    it("cross-column cursor move", () => {
      store.batch(t, () => store.setPrimary("card1", "cursor", true))
      expect(readReduced(store, "col1", "cursorDescendant")).toBe(true)
      expect(readReduced(store, "col2", "cursorDescendant")).toBe(false)

      store.batch(t, () => {
        store.setPrimary("card1", "cursor", false)
        store.setPrimary("card3", "cursor", true)
      })

      expect(readReduced(store, "col1", "cursorDescendant")).toBe(false)
      expect(readReduced(store, "col2", "cursorDescendant")).toBe(true)
    })
  })

  describe("selectedAncestor propagation", () => {
    it("selecting card makes descendants see selectedAncestor", () => {
      store.batch(t, () => store.setPrimary("card1", "selected", true))

      expect(readReduced(store, "sub1", "selectedAncestor")).toBe(true)
      expect(readReduced(store, "sub2", "selectedAncestor")).toBe(true)
      // self excluded
      expect(readReduced(store, "card1", "selectedAncestor")).toBe(false)
      // non-descendants unaffected
      expect(readReduced(store, "card2", "selectedAncestor")).toBe(false)
      expect(readReduced(store, "col1", "selectedAncestor")).toBe(false)
    })

    it("deselecting clears descendants", () => {
      store.batch(t, () => store.setPrimary("card1", "selected", true))
      expect(readReduced(store, "sub1", "selectedAncestor")).toBe(true)

      store.batch(t, () => store.setPrimary("card1", "selected", false))
      expect(readReduced(store, "sub1", "selectedAncestor")).toBe(false)
    })

    it("nested selection: two selected ancestors → count=2", () => {
      store.batch(t, () => {
        store.setPrimary("col1", "selected", true)
        store.setPrimary("card1", "selected", true)
      })

      expect(store.node("sub1").counts.get("selectedAncestor")).toBe(2)
      expect(readReduced(store, "sub1", "selectedAncestor")).toBe(true)

      // Deselect card1 → still has col1
      store.batch(t, () => store.setPrimary("card1", "selected", false))
      expect(store.node("sub1").counts.get("selectedAncestor")).toBe(1)
      expect(readReduced(store, "sub1", "selectedAncestor")).toBe(true)
    })
  })

  describe("counts not booleans", () => {
    it("two cursor descendants: remove one → still true", () => {
      store.batch(t, () => {
        store.setPrimary("sub1", "cursor", true)
        store.setPrimary("sub2", "cursor", true)
      })

      expect(store.node("card1").counts.get("cursorDescendant")).toBe(2)
      expect(readReduced(store, "card1", "cursorDescendant")).toBe(true)

      store.batch(t, () => store.setPrimary("sub1", "cursor", false))

      expect(store.node("card1").counts.get("cursorDescendant")).toBe(1)
      expect(readReduced(store, "card1", "cursorDescendant")).toBe(true)

      store.batch(t, () => store.setPrimary("sub2", "cursor", false))

      expect(store.node("card1").counts.get("cursorDescendant")).toBe(0)
      expect(readReduced(store, "card1", "cursorDescendant")).toBe(false)
    })
  })

  describe("node removal", () => {
    it("removing node with active signal subtracts from ancestors", () => {
      store.batch(t, () => store.setPrimary("sub1", "cursor", true))
      expect(readReduced(store, "card1", "cursorDescendant")).toBe(true)

      store.removeNode("sub1", t)

      expect(readReduced(store, "card1", "cursorDescendant")).toBe(false)
      expect(store.hasNode("sub1")).toBe(false)
    })
  })

  describe("batch atomicity", () => {
    it("cursor move is atomic — no intermediate stale state", () => {
      store.batch(t, () => store.setPrimary("sub1", "cursor", true))

      // Batch both operations together
      store.batch(t, () => {
        store.setPrimary("sub1", "cursor", false)
        store.setPrimary("card3", "cursor", true)

        // During the batch callback, primary signals update immediately
        expect(store.peekPrimary("sub1", "cursor")).toBe(false)
        expect(store.peekPrimary("card3", "cursor")).toBe(true)

        // But reduced signals haven't recomputed yet — still stale
        // (they update AFTER the batch callback returns)
      })

      // After batch: reduced signals are consistent
      expect(readReduced(store, "card1", "cursorDescendant")).toBe(false)
      expect(readReduced(store, "col2", "cursorDescendant")).toBe(true)
    })
  })
})
