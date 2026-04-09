/**
 * reactiveTree — computed-based engine tests.
 *
 * Ports all tests from reduced-signals.test.ts to verify behavioral parity.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { signal } from "alien-signals"
import { reactiveTree, type Traversal, type ReactiveTree } from "../src/state/reactive-graph.ts"

// ─── Test Tree ──────────────────────────────────────────────────────────────

function simpleTree(): Traversal {
  const pa: Record<string, string | null> = {
    root: null,
    col1: "root",
    col2: "root",
    card1: "col1",
    card2: "col1",
    card3: "col2",
    sub1: "card1",
    sub2: "card1",
  }
  const ch: Record<string, string[]> = {
    root: ["col1", "col2"],
    col1: ["card1", "card2"],
    col2: ["card3"],
    card1: ["sub1", "sub2"],
    card2: [],
    card3: [],
    sub1: [],
    sub2: [],
  }
  return { parent: (id) => pa[id] ?? null, children: (id) => ch[id] ?? [] }
}

// ─── Schema ─────────────────────────────────────────────────────────────────

function makeStore(t: Traversal) {
  return reactiveTree(
    (tree) => ({
      cursor: signal(false),
      selected: signal(false),
      editing: signal(false),
      cursorDescendant: tree.descendants((s: { cursor: unknown }) => s.cursor).some(),
      selectedAncestor: tree.ancestors((s: { selected: unknown }) => s.selected).some(),
      editingDescendant: tree.descendants((s: { editing: unknown }) => s.editing).some(),
    }),
    t,
  )
}

function makeSigilStore(t: Traversal) {
  return reactiveTree(
    (tree) => ({
      ownSigils: signal([] as string[]),
      excludedSigils: tree
        .ancestors((s: { ownSigils: unknown }) => s.ownSigils)
        .reduce(
          (acc: string[], v) => {
            const arr = v as string[]
            return arr.length === 0 ? acc : [...acc, ...arr]
          },
          () => [] as string[],
          {
            includeSelf: true,
            equals: (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]),
          },
        ),
    }),
    t,
  )
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("reactiveTree (computed-based)", () => {
  let store: ReturnType<typeof makeStore>
  let t: Traversal

  beforeEach(() => {
    t = simpleTree()
    store = makeStore(t)
  })

  describe("signals", () => {
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
      store.get("sub1").cursor(true)
      expect(store.get("card1").cursorDescendant()).toBe(true)
      expect(store.get("col1").cursorDescendant()).toBe(true)
      expect(store.get("root").cursorDescendant()).toBe(true)
      expect(store.get("sub1").cursorDescendant()).toBe(false) // self excluded
      expect(store.get("col2").cursorDescendant()).toBe(false) // other branch
    })

    it("cursor move clears old, sets new", () => {
      store.get("sub1").cursor(true)
      store.get("sub1").cursor(false)
      store.get("card2").cursor(true)
      expect(store.get("card1").cursorDescendant()).toBe(false)
      expect(store.get("col1").cursorDescendant()).toBe(true) // card2 still under col1
    })

    it("cross-column move", () => {
      store.get("card1").cursor(true)
      store.get("card1").cursor(false)
      store.get("card3").cursor(true)
      expect(store.get("col1").cursorDescendant()).toBe(false)
      expect(store.get("col2").cursorDescendant()).toBe(true)
    })
  })

  describe("selectedAncestor (ancestors → propagate down)", () => {
    it("selecting card → descendants see selectedAncestor", () => {
      store.get("card1").selected(true)
      expect(store.get("sub1").selectedAncestor()).toBe(true)
      expect(store.get("sub2").selectedAncestor()).toBe(true)
      expect(store.get("card1").selectedAncestor()).toBe(false) // self excluded
      expect(store.get("card2").selectedAncestor()).toBe(false) // sibling
    })

    it("deselecting clears descendants", () => {
      store.get("card1").selected(true)
      store.get("card1").selected(false)
      expect(store.get("sub1").selectedAncestor()).toBe(false)
    })
  })

  describe("counts correctness (two sources)", () => {
    it("two cursor descendants: remove one → still true", () => {
      store.get("sub1").cursor(true)
      store.get("sub2").cursor(true)
      expect(store.get("card1").cursorDescendant()).toBe(true)
      store.get("sub1").cursor(false)
      expect(store.get("card1").cursorDescendant()).toBe(true) // sub2 still
      store.get("sub2").cursor(false)
      expect(store.get("card1").cursorDescendant()).toBe(false)
    })
  })

  describe("lifecycle", () => {
    it("clear resets everything", () => {
      store.get("sub1").cursor(true)
      store.clear()
      expect(store.size).toBe(0)
    })

    it("has returns false for unknown nodes", () => {
      expect(store.has("nope")).toBe(false)
    })

    it("get lazy-creates", () => {
      expect(store.has("sub1")).toBe(false)
      store.get("sub1")
      expect(store.has("sub1")).toBe(true)
    })
  })

  describe("edge cases", () => {
    it("setting same value is no-op", () => {
      store.get("sub1").cursor(true)
      store.get("sub1").cursor(true) // no double effect
      expect(store.get("card1").cursorDescendant()).toBe(true)
    })

    it("deselected state — no cursor → all false", () => {
      store.get("sub1").cursor(true)
      store.get("sub1").cursor(false)
      expect(store.get("card1").cursorDescendant()).toBe(false)
      expect(store.get("root").cursorDescendant()).toBe(false)
    })
  })

  describe("editingDescendant", () => {
    it("editing sub-item → card gets editingDescendant", () => {
      store.get("sub1").editing(true)
      expect(store.get("card1").editingDescendant()).toBe(true)
      expect(store.get("sub1").editingDescendant()).toBe(false)
    })

    it("stop editing clears", () => {
      store.get("sub1").editing(true)
      store.get("sub1").editing(false)
      expect(store.get("card1").editingDescendant()).toBe(false)
    })
  })

  describe("rebind", () => {
    it("rebind preserves signal nodes and uses new traversal", () => {
      store.get("sub1").cursor(true)
      expect(store.get("card1").cursorDescendant()).toBe(true)
      const prevSize = store.size
      store.rebind(simpleTree()) // fresh traversal
      // Nodes are preserved (not cleared) so React subscriptions remain valid
      expect(store.size).toBe(prevSize)
      // Signal values survive rebind
      expect(store.get("sub1").cursor()).toBe(true)
    })
  })
})

// ─── .reduce() ──────────────────────────────────────────────────────────────

describe("reactiveTree .reduce()", () => {
  let store: ReturnType<typeof makeSigilStore>

  beforeEach(() => {
    store = makeSigilStore(simpleTree())
  })

  it("accumulates ancestor ownSigils (includeSelf)", () => {
    store.get("root").ownSigils(["@global"])
    store.get("col1").ownSigils(["@next"])
    expect(store.get("root").excludedSigils()).toEqual(["@global"])
    expect(store.get("col1").excludedSigils()).toEqual(["@global", "@next"])
    expect(store.get("card1").excludedSigils()).toEqual(["@global", "@next"])
    expect(store.get("col2").excludedSigils()).toEqual(["@global"])
  })

  it("changing ownSigils updates descendants", () => {
    store.get("root").ownSigils(["@a"])
    expect(store.get("card1").excludedSigils()).toEqual(["@a"])
    store.get("root").ownSigils(["@b"])
    expect(store.get("card1").excludedSigils()).toEqual(["@b"])
  })

  it("empty ownSigils → empty excludedSigils", () => {
    expect(store.get("card1").excludedSigils()).toEqual([])
  })
})

// ─── .count() ───────────────────────────────────────────────────────────────

describe("reactiveTree .count()", () => {
  it("counts descendants with cursor", () => {
    const t = simpleTree()
    const store = reactiveTree(
      (tree) => ({
        cursor: signal(false),
        cursorCount: tree.descendants((s: { cursor: unknown }) => s.cursor).count(),
      }),
      t,
    )

    store.get("sub1").cursor(true)
    store.get("sub2").cursor(true)
    expect(store.get("card1").cursorCount()).toBe(2)
    expect(store.get("col1").cursorCount()).toBe(2)
    store.get("sub1").cursor(false)
    expect(store.get("card1").cursorCount()).toBe(1)
  })
})

// ─── includeSelf ────────────────────────────────────────────────────────────

describe("includeSelf", () => {
  it("some() with includeSelf includes source node", () => {
    const t = simpleTree()
    const store = reactiveTree(
      (tree) => ({
        cursor: signal(false),
        cursorOrDescendant: tree.descendants((s: { cursor: unknown }) => s.cursor).some({ includeSelf: true }),
      }),
      t,
    )

    store.get("card1").cursor(true)
    expect(store.get("card1").cursorOrDescendant()).toBe(true) // self!
    expect(store.get("col1").cursorOrDescendant()).toBe(true) // ancestor
  })
})
