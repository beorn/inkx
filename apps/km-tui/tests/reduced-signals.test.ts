/**
 * Reduced Signal Engine — unit tests
 *
 * Tests: primary descriptors, function-accessor API, batch, counts-not-booleans,
 * walk coalescing, .reduce() combinator, includeSelf, ancestor/descendant propagation.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { createReactiveTree, tree, primary, isReducedDescriptor, type TreeAccess, type ReactiveTreeStore } from "../src/state/reduced-signals.ts"

// ─── Test Tree ──────────────────────────────────────────────────────────────

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

// ─── State Definitions ──────────────────────────────────────────────────────

const booleanDef = {
  cursor: primary(false),
  selected: primary(false),
  editing: primary(false),
  cursorDescendant: tree.descendants((s: { cursor: unknown }) => s.cursor).some(),
  selectedAncestor: tree.ancestors((s: { selected: unknown }) => s.selected).some(),
  editingDescendant: tree.descendants((s: { editing: unknown }) => s.editing).some(),
}

function arrayConcat(acc: string[], value: unknown): string[] {
  const arr = value as string[]
  return arr.length === 0 ? acc : [...acc, ...arr]
}

function arrayShallowEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

const sigilDef = {
  ownSigils: primary(() => [] as string[]),
  excludedSigils: tree.ancestors((s: { ownSigils: unknown }) => s.ownSigils).reduce(
    arrayConcat, () => [] as string[], { includeSelf: true, equals: arrayShallowEqual },
  ),
}

// ─── Descriptors ────────────────────────────────────────────────────────────

describe("descriptors", () => {
  it("tree.ancestors(s => s.selected).some() creates branded descriptor", () => {
    const desc = tree.ancestors((s: { selected: unknown }) => s.selected).some()
    expect(isReducedDescriptor(desc)).toBe(true)
    expect(desc.direction).toBe("up")
    expect(desc.sourceKey).toBe("selected")
  })

  it("tree.descendants(s => s.cursor).count() creates count descriptor", () => {
    const desc = tree.descendants((s: { cursor: unknown }) => s.cursor).count()
    expect(desc.reducerType).toBe("count")
  })

  it(".reduce() creates reduce descriptor with reducer and equality", () => {
    const desc = tree.ancestors((s: { x: unknown }) => s.x).reduce(
      (acc: number[], v) => [...acc, v as number], () => [] as number[], { equals: arrayShallowEqual as never },
    )
    expect(desc.reducerType).toBe("reduce")
    expect(desc.reducer).toBeDefined()
    expect(desc.equals).toBeDefined()
  })

  it("includeSelf defaults to false", () => {
    const desc = tree.descendants((s: { x: unknown }) => s.x).some()
    expect(desc.includeSelf).toBe(false)
  })

  it("includeSelf can be set to true", () => {
    const desc = tree.descendants((s: { x: unknown }) => s.x).some({ includeSelf: true })
    expect(desc.includeSelf).toBe(true)
  })
})

// ─── Iterators ──────────────────────────────────────────────────────────────

describe("tree.up/down", () => {
  it("up walks parent chain excluding self", () => {
    expect([...tree.up(simpleTree(), "sub1")]).toEqual(["card1", "col1", "root"])
  })

  it("down walks DFS pre-order excluding self", () => {
    expect([...tree.down(simpleTree(), "col1")]).toEqual(["card1", "sub1", "sub2", "card2"])
  })
})

// ─── Boolean Signals ────────────────────────────────────────────────────────

describe("createReactiveTree (boolean)", () => {
  let store: ReactiveTreeStore<typeof booleanDef>
  let t: TreeAccess

  beforeEach(() => {
    store = createReactiveTree(booleanDef)
    t = simpleTree()
  })

  describe("primary signals", () => {
    it("default to false", () => {
      expect(store.get("card1").cursor()).toBe(false)
    })

    it("are writable", () => {
      store.get("card1").cursor(true)
      expect(store.get("card1").cursor()).toBe(true)
    })
  })

  describe("cursorDescendant (descendants → propagate up)", () => {
    it("cursor on leaf → ancestors get cursorDescendant", () => {
      store.batch(t, () => store.get("sub1").cursor(true))
      expect(store.get("card1").cursorDescendant()).toBe(true)
      expect(store.get("col1").cursorDescendant()).toBe(true)
      expect(store.get("root").cursorDescendant()).toBe(true)
      expect(store.get("sub1").cursorDescendant()).toBe(false) // self excluded
      expect(store.get("col2").cursorDescendant()).toBe(false) // other branch
    })

    it("cursor move clears old, sets new", () => {
      store.batch(t, () => store.get("sub1").cursor(true))
      store.batch(t, () => { store.get("sub1").cursor(false); store.get("card2").cursor(true) })
      expect(store.get("card1").cursorDescendant()).toBe(false)
      expect(store.get("col1").cursorDescendant()).toBe(true) // card2 still under col1
    })

    it("cross-column move", () => {
      store.batch(t, () => store.get("card1").cursor(true))
      store.batch(t, () => { store.get("card1").cursor(false); store.get("card3").cursor(true) })
      expect(store.get("col1").cursorDescendant()).toBe(false)
      expect(store.get("col2").cursorDescendant()).toBe(true)
    })
  })

  describe("selectedAncestor (ancestors → propagate down)", () => {
    it("selecting card → descendants see selectedAncestor", () => {
      store.batch(t, () => store.get("card1").selected(true))
      expect(store.get("sub1").selectedAncestor()).toBe(true)
      expect(store.get("sub2").selectedAncestor()).toBe(true)
      expect(store.get("card1").selectedAncestor()).toBe(false) // self excluded
      expect(store.get("card2").selectedAncestor()).toBe(false) // sibling
    })

    it("deselecting clears descendants", () => {
      store.batch(t, () => store.get("card1").selected(true))
      store.batch(t, () => store.get("card1").selected(false))
      expect(store.get("sub1").selectedAncestor()).toBe(false)
    })
  })

  describe("counts not booleans", () => {
    it("two cursor descendants: remove one → still true", () => {
      store.batch(t, () => { store.get("sub1").cursor(true); store.get("sub2").cursor(true) })
      expect(store.get("card1").cursorDescendant()).toBe(true)
      store.batch(t, () => store.get("sub1").cursor(false))
      expect(store.get("card1").cursorDescendant()).toBe(true)
      store.batch(t, () => store.get("sub2").cursor(false))
      expect(store.get("card1").cursorDescendant()).toBe(false)
    })
  })

  describe("node lifecycle", () => {
    it("delete subtracts contributions", () => {
      store.batch(t, () => store.get("sub1").cursor(true))
      expect(store.get("card1").cursorDescendant()).toBe(true)
      store.delete("sub1", t)
      expect(store.get("card1").cursorDescendant()).toBe(false)
      expect(store.has("sub1")).toBe(false)
    })

    it("clear resets everything", () => {
      store.batch(t, () => store.get("sub1").cursor(true))
      store.clear()
      expect(store.size).toBe(0)
    })
  })

  describe("batch atomicity", () => {
    it("reduced signals consistent after batch", () => {
      store.batch(t, () => store.get("sub1").cursor(true))
      store.batch(t, () => { store.get("sub1").cursor(false); store.get("card3").cursor(true) })
      expect(store.get("card1").cursorDescendant()).toBe(false)
      expect(store.get("col2").cursorDescendant()).toBe(true)
    })
  })

  describe("edge cases", () => {
    it("setting same value is no-op", () => {
      store.batch(t, () => store.get("sub1").cursor(true))
      store.batch(t, () => store.get("sub1").cursor(true))
      expect(store.get("card1").cursorDescendant()).toBe(true)
    })

    it("delete non-existent is safe", () => {
      store.delete("nope", t)
    })

    it("empty batch is safe", () => {
      store.batch(t, () => {})
    })
  })

  describe("editingDescendant", () => {
    it("editing sub-item → card gets editingDescendant", () => {
      store.batch(t, () => store.get("sub1").editing(true))
      expect(store.get("card1").editingDescendant()).toBe(true)
      expect(store.get("sub1").editingDescendant()).toBe(false)
    })

    it("stop editing clears", () => {
      store.batch(t, () => store.get("sub1").editing(true))
      store.batch(t, () => store.get("sub1").editing(false))
      expect(store.get("card1").editingDescendant()).toBe(false)
    })
  })
})

// ─── .reduce() Combinator ───────────────────────────────────────────────────

describe("createReactiveTree (.reduce)", () => {
  let store: ReactiveTreeStore<typeof sigilDef>
  let t: TreeAccess

  beforeEach(() => {
    store = createReactiveTree(sigilDef)
    t = simpleTree()
  })

  it("excludedSigils accumulates ancestor ownSigils (includeSelf)", () => {
    store.batch(t, () => {
      store.get("root").ownSigils(["@global"])
      store.get("col1").ownSigils(["@next"])
    })

    // root: own = [@global], excluded = [@global] (includeSelf)
    expect(store.get("root").excludedSigils()).toEqual(["@global"])

    // col1: ancestors = [root], own = [@next], excluded = [@global, @next]
    expect(store.get("col1").excludedSigils()).toEqual(["@global", "@next"])

    // card1: ancestors = [root, col1], excluded = [@global, @next]
    expect(store.get("card1").excludedSigils()).toEqual(["@global", "@next"])

    // col2: no own sigils, just inherits root
    expect(store.get("col2").excludedSigils()).toEqual(["@global"])
  })

  it("changing ownSigils updates descendants", () => {
    store.batch(t, () => store.get("root").ownSigils(["@a"]))
    expect(store.get("card1").excludedSigils()).toEqual(["@a"])

    store.batch(t, () => store.get("root").ownSigils(["@b"]))
    expect(store.get("card1").excludedSigils()).toEqual(["@b"])
  })

  it("custom equality prevents spurious writes", () => {
    store.batch(t, () => store.get("root").ownSigils(["@a"]))
    const first = store.get("card1").excludedSigils()
    // Same content, should be equal
    store.batch(t, () => store.get("root").ownSigils(["@a"]))
    const second = store.get("card1").excludedSigils()
    expect(first).toEqual(second)
  })

  it("empty ownSigils produces empty excludedSigils", () => {
    expect(store.get("card1").excludedSigils()).toEqual([])
  })
})

// ─── includeSelf ────────────────────────────────────────────────────────────

describe("includeSelf", () => {
  it("some() with includeSelf includes the source node itself", () => {
    const def = {
      cursor: primary(false),
      cursorOrDescendant: tree.descendants((s: { cursor: unknown }) => s.cursor).some({ includeSelf: true }),
    }
    const store = createReactiveTree(def)
    const t = simpleTree()

    store.batch(t, () => store.get("card1").cursor(true))
    expect(store.get("card1").cursorOrDescendant()).toBe(true) // self included!
    expect(store.get("col1").cursorOrDescendant()).toBe(true) // ancestor
  })
})
