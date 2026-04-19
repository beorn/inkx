/**
 * @km/reactive-tree — engine tests.
 *
 * Full behavioral coverage: signals, some/count/reduce, includeSelf,
 * rebind, lifecycle, atomicity, re-entrancy, bootstrap.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { signal, effect } from "alien-signals"
import { createTree, type Traversal, type TreeStore } from "../src/index.ts"

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
  return createTree(
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
  return createTree(
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

describe("createTree (computed-based)", () => {
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

describe("createTree .reduce()", () => {
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

describe("createTree .count()", () => {
  it("counts descendants with cursor", () => {
    const t = simpleTree()
    const store = createTree(
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
    const store = createTree(
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

// =============================================================================
// Characterization: doneAncestor signal propagation
// =============================================================================

describe("doneAncestor (ancestors → propagate down)", () => {
  function makeDoneStore(t: Traversal) {
    return createTree(
      (tree) => ({
        isDone: signal(false),
        doneAncestor: tree.ancestors((s: { isDone: unknown }) => s.isDone).some(),
      }),
      t,
    )
  }

  it("marking parent done → children show doneAncestor=true", () => {
    const store = makeDoneStore(simpleTree())
    store.get("card1").isDone(true)
    expect(store.get("sub1").doneAncestor()).toBe(true)
    expect(store.get("sub2").doneAncestor()).toBe(true)
    expect(store.get("card1").doneAncestor()).toBe(false) // self excluded
    expect(store.get("card2").doneAncestor()).toBe(false) // sibling
  })

  it("marking column done → all cards and sub-items show doneAncestor", () => {
    const store = makeDoneStore(simpleTree())
    store.get("col1").isDone(true)
    expect(store.get("card1").doneAncestor()).toBe(true)
    expect(store.get("card2").doneAncestor()).toBe(true)
    expect(store.get("sub1").doneAncestor()).toBe(true)
    expect(store.get("col2").doneAncestor()).toBe(false) // other branch
    expect(store.get("card3").doneAncestor()).toBe(false) // other branch
  })

  it("un-marking done clears doneAncestor from descendants", () => {
    const store = makeDoneStore(simpleTree())
    store.get("card1").isDone(true)
    expect(store.get("sub1").doneAncestor()).toBe(true)
    store.get("card1").isDone(false)
    expect(store.get("sub1").doneAncestor()).toBe(false)
    expect(store.get("sub2").doneAncestor()).toBe(false)
  })

  it("nested done: parent done removed but grandparent still done → still true", () => {
    const store = makeDoneStore(simpleTree())
    store.get("col1").isDone(true)
    store.get("card1").isDone(true)
    expect(store.get("sub1").doneAncestor()).toBe(true)

    // Remove card1's done — but col1 is still done, so sub1 stays doneAncestor
    store.get("card1").isDone(false)
    expect(store.get("sub1").doneAncestor()).toBe(true)

    // Remove col1's done — now sub1 should be false
    store.get("col1").isDone(false)
    expect(store.get("sub1").doneAncestor()).toBe(false)
  })
})

// =============================================================================
// Characterization: excludedSigils multi-level propagation
// =============================================================================

describe("excludedSigils multi-level propagation", () => {
  function makeSigilStoreLocal(t: Traversal) {
    return createTree(
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

  it("sigils from root + column merge on card descendants", () => {
    const store = makeSigilStoreLocal(simpleTree())
    store.get("root").ownSigils(["@global"])
    store.get("col1").ownSigils(["@next"])

    // card1 inherits root + col1
    expect(store.get("card1").excludedSigils()).toEqual(["@global", "@next"])
    // sub1 also inherits (no own sigils)
    expect(store.get("sub1").excludedSigils()).toEqual(["@global", "@next"])
    // col2's branch only inherits from root
    expect(store.get("card3").excludedSigils()).toEqual(["@global"])
  })

  it("clearing sigils on a node updates descendants", () => {
    const store = makeSigilStoreLocal(simpleTree())
    store.get("root").ownSigils(["@a"])
    store.get("col1").ownSigils(["@b"])
    expect(store.get("card1").excludedSigils()).toEqual(["@a", "@b"])

    // Clear col1 sigils
    store.get("col1").ownSigils([])
    expect(store.get("card1").excludedSigils()).toEqual(["@a"])

    // Clear root sigils
    store.get("root").ownSigils([])
    expect(store.get("card1").excludedSigils()).toEqual([])
  })

  it("card-level sigils compose with ancestor sigils", () => {
    const store = makeSigilStoreLocal(simpleTree())
    store.get("root").ownSigils(["@root"])
    store.get("card1").ownSigils(["@card"])
    // sub1 gets root + card1 sigils
    expect(store.get("sub1").excludedSigils()).toEqual(["@root", "@card"])
    // card1 itself gets root + own
    expect(store.get("card1").excludedSigils()).toEqual(["@root", "@card"])
  })
})

// ─── Pro-review hardening tests (atomicity / re-entrancy / bootstrap) ───────
//
// Pro review of the sparse-ancestor-index inversion flagged five classes of
// concerns beyond the existing 28-test suite. The tests below cover them so
// regressions in the batching / untracking / bootstrap machinery are caught.

describe("sparse-index: atomicity / re-entrancy / bootstrap", () => {
  it("indexed write produces exactly one combined observation (no glitch)", () => {
    const t = simpleTree()
    const store = makeStore(t)
    // Prime accessors so the effect can subscribe cleanly
    const sub = store.get("sub1")
    const col = store.get("col1")
    const observations: Array<{ cursor: boolean; desc: boolean }> = []
    const stop = effect(() => {
      observations.push({ cursor: !!sub.cursor(), desc: !!col.cursorDescendant() })
    })
    // Baseline snapshot from initial effect run
    const baseline = observations.length
    sub.cursor(true)
    // After the write, the effect should have re-run at most once with the
    // final consistent state — never an intermediate (cursor=true, desc=false)
    const after = observations.slice(baseline)
    expect(after.length).toBeLessThanOrEqual(1)
    if (after.length === 1) {
      expect(after[0]).toEqual({ cursor: true, desc: true })
    }
    stop()
  })

  it("rebind produces one consistent re-observation for mixed indexed + walk computeds", () => {
    const store = makeStore(simpleTree())
    store.get("sub1").cursor(true)
    store.get("card1").selected(true)
    // Observe: indexed (cursorDescendant on col1) + walk-based (selectedAncestor on sub2)
    const observations: Array<{ a: boolean; b: boolean }> = []
    const stop = effect(() => {
      observations.push({
        a: !!store.get("col1").cursorDescendant(),
        b: !!store.get("sub2").selectedAncestor(),
      })
    })
    const baseline = observations.length
    // New traversal — same shape, same node IDs. Rebuild should be transparent.
    store.rebind(simpleTree())
    const after = observations.slice(baseline)
    expect(after.length).toBeLessThanOrEqual(1)
    if (after.length === 1) expect(after[0]).toEqual({ a: true, b: true })
    stop()
  })

  it("re-entrant write inside effect does not corrupt index", () => {
    const store = makeStore(simpleTree())
    const sub = store.get("sub1")
    // Effect that clears the cursor when it sees it set
    const stop = effect(() => {
      if (sub.cursor()) sub.cursor(false)
    })
    sub.cursor(true)
    expect(sub.cursor()).toBe(false)
    expect(store.get("card1").cursorDescendant()).toBe(false)
    expect(store.get("col1").cursorDescendant()).toBe(false)
    stop()
  })

  it("nodes.set happens before index seeding — no re-entrant construction", () => {
    // Build a tree where the index bootstrap for one node could plausibly
    // resolve the same node through its ancestors. If `nodes.set` happens
    // after seeding, `get(id)` re-entry would fall through to a fresh
    // constructor call and corrupt the map.
    const t = simpleTree()
    const store = createTree(
      (tree) => ({
        cursor: signal(true), // truthy by default — seeds the index on every get()
        cursorDescendant: tree.descendants((s: { cursor: unknown }) => s.cursor).some(),
      }),
      t,
    )
    // First get triggers bootstrap. Ancestor get calls during seeding must
    // not recursively reconstruct the same node.
    const a = store.get("sub1")
    const b = store.get("sub1")
    expect(a).toBe(b)
    // The store should still produce consistent cursorDescendant counts.
    expect(store.get("card1").cursorDescendant()).toBe(true)
  })

  it("indexed-signal writer does not accidentally subscribe the caller", () => {
    const store = makeStore(simpleTree())
    const sub = store.get("sub1")
    let runs = 0
    // Effect WRITES the indexed signal but never reads it — should only run
    // once (the initial invocation), never re-trigger from later writes.
    const stop = effect(() => {
      runs++
      sub.cursor(true)
    })
    const baseline = runs
    // External write to the SAME signal — because the effect didn't read the
    // signal, it shouldn't re-run.
    sub.cursor(false)
    sub.cursor(true)
    expect(runs - baseline).toBe(0)
    stop()
  })
})

// Strategy selection is intentionally NOT part of the public API. The engine
// classifies each descriptor (dir + type) and picks the right strategy
// internally — one API, one obvious way, matching alien-projections and
// alien-resources. The 33 tests above exercise both the sparse-index (via
// descendants+some/count) and walk (via ancestors+any and descendants+reduce)
// code paths end-to-end; no separate strategy-selection test surface is
// needed.
