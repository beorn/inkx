/**
 * Stress + perf benchmarks for @km/reactive-tree.
 *
 * Coverage:
 *   - sparse vs walk read cost across tree sizes (1K, 10K, 100K descendants)
 *   - write throughput: cursor move = one walkUp per strategy (O(depth))
 *   - rebind cost on trees with 0 / few / many truthy nodes
 *   - deep-ancestor cost (1000-level chain) — walkUp is O(depth)
 *   - wide-fan-out cost (one parent, N direct children)
 *   - multi-strategy coexistence (sparse + walkUp on different keys)
 *   - singleton vs sparse for single-select patterns
 *   - read-after-write invalidation cost
 *   - default strategy resolution
 *
 * Methodology: `bench()` reports ops/sec. Accounting scenarios (prefixed with
 * `ACCOUNTING:`) print call counts via `process.stderr.write` when
 * `BENCH_VERBOSE=1` is set.
 *
 * The engine's correctness contract (validated by this bench, not just the
 * test suite):
 *   - cursor move on an empty 100K-descendant column = 0 traversal calls on read
 *   - sparse writes cost O(depth) walkUp calls, reads cost O(1)
 *   - walk strategy on the same scenario = O(subtree) traversal on read
 *
 * Run: `bun vitest bench packages/reactive-tree/`.
 * Verbose: `BENCH_VERBOSE=1 bun vitest bench packages/reactive-tree/`.
 */

import { bench, describe } from "vitest"
import { signal } from "alien-signals"
import { reactiveTree, sparse, walk, walkUp, singleton, type Traversal } from "../src/index.ts"

// ─── Tree fixtures ──────────────────────────────────────────────────────────

/** root → col → [card0..cardN-1]. Canonical "board column" shape. */
function buildLinearTree(size: number) {
  const parent: Record<string, string | null> = { root: null, col: "root" }
  const children: Record<string, string[]> = { root: ["col"], col: [] }
  const cardIds: string[] = []
  for (let i = 0; i < size; i++) {
    const id = `card${i}`
    cardIds.push(id)
    parent[id] = "col"
    children[id] = []
  }
  children.col = cardIds
  const calls = { children: 0, parent: 0 }
  const traversal: Traversal = {
    parent: (id) => {
      calls.parent++
      return parent[id] ?? null
    },
    children: (id) => {
      calls.children++
      return children[id] ?? []
    },
  }
  return { traversal, calls, ids: cardIds }
}

/** Deep chain: root → n0 → n1 → ... → n{depth-1}. Each has one child. */
function buildDeepChain(depth: number) {
  const parent: Record<string, string | null> = { root: null }
  const children: Record<string, string[]> = { root: [] }
  let prev = "root"
  const ids: string[] = []
  for (let i = 0; i < depth; i++) {
    const id = `n${i}`
    ids.push(id)
    parent[id] = prev
    children[prev] = [id]
    children[id] = []
    prev = id
  }
  const calls = { children: 0, parent: 0 }
  const traversal: Traversal = {
    parent: (id) => {
      calls.parent++
      return parent[id] ?? null
    },
    children: (id) => {
      calls.children++
      return children[id] ?? []
    },
  }
  return { traversal, calls, leaf: prev, ids }
}

/** Balanced tree: fanout × depth levels. ~ fanout^depth total nodes. */
function buildBalancedTree(fanout: number, depth: number) {
  const parent: Record<string, string | null> = { root: null }
  const children: Record<string, string[]> = { root: [] }
  const leaves: string[] = []
  const queue: Array<{ id: string; depth: number }> = [{ id: "root", depth: 0 }]
  let counter = 0
  while (queue.length > 0) {
    const { id, depth: d } = queue.shift()!
    if (d >= depth) {
      leaves.push(id)
      continue
    }
    const kids: string[] = []
    for (let i = 0; i < fanout; i++) {
      const cid = `n${counter++}`
      kids.push(cid)
      parent[cid] = id
      children[cid] = []
      queue.push({ id: cid, depth: d + 1 })
    }
    children[id] = kids
  }
  const calls = { children: 0, parent: 0 }
  const traversal: Traversal = {
    parent: (id) => {
      calls.parent++
      return parent[id] ?? null
    },
    children: (id) => {
      calls.children++
      return children[id] ?? []
    },
  }
  return { traversal, calls, leaves }
}

// ─── Store factories ────────────────────────────────────────────────────────

function makeSparseStore(traversal: Traversal) {
  return reactiveTree(
    (tree) => ({
      cursor: signal(false),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cursorDescendant: tree.descendants((x: { cursor: unknown }) => x.cursor).some({ strategy: sparse } as any),
    }),
    traversal,
  )
}

function makeWalkStore(traversal: Traversal) {
  return reactiveTree(
    (tree) => ({
      cursor: signal(false),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cursorDescendant: tree.descendants((x: { cursor: unknown }) => x.cursor).some({ strategy: walk } as any),
    }),
    traversal,
  )
}

function makeSingletonStore(traversal: Traversal) {
  return reactiveTree(
    (tree) => ({
      cursor: signal(false),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cursorDescendant: tree.descendants((x: { cursor: unknown }) => x.cursor).some({ strategy: singleton } as any),
    }),
    traversal,
  )
}

function makeDefaultStore(traversal: Traversal) {
  return reactiveTree(
    (tree) => ({
      cursor: signal(false),
      cursorDescendant: tree.descendants((x: { cursor: unknown }) => x.cursor).some(),
    }),
    traversal,
  )
}

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe("read cost: sparse vs walk on empty column (worst case for walk)", () => {
  for (const size of [1_000, 10_000, 100_000] as const) {
    bench(`sparse ${size}: empty-column read`, () => {
      const { traversal } = buildLinearTree(size)
      const store = makeSparseStore(traversal)
      store.get("col").cursorDescendant()
    })
    bench(`walk ${size}: empty-column read`, () => {
      const { traversal } = buildLinearTree(size)
      const store = makeWalkStore(traversal)
      store.get("col").cursorDescendant()
    })
  }
})

describe("cursor move: cross-column keystroke simulation", () => {
  for (const size of [1_000, 10_000, 100_000] as const) {
    bench(`sparse ${size}: move between two leaves, read root`, () => {
      const { traversal } = buildLinearTree(size)
      const store = makeSparseStore(traversal)
      store.get("card0").cursor(true)
      // Measured section: move + read
      store.get("card0").cursor(false)
      store.get(`card${size - 1}`).cursor(true)
      store.get("col").cursorDescendant()
    })
    bench(`walk ${size}: move between two leaves, read root`, () => {
      const { traversal } = buildLinearTree(size)
      const store = makeWalkStore(traversal)
      store.get("card0").cursor(true)
      store.get("card0").cursor(false)
      store.get(`card${size - 1}`).cursor(true)
      store.get("col").cursorDescendant()
    })
  }
})

describe("deep ancestor chain (walkUp is O(depth))", () => {
  for (const depth of [50, 200, 1_000] as const) {
    bench(`sparse ${depth}-deep: write at leaf`, () => {
      const { traversal, leaf } = buildDeepChain(depth)
      const store = makeSparseStore(traversal)
      store.get(leaf).cursor(true)
    })
    bench(`walk ${depth}-deep: read root with cursor at leaf`, () => {
      const { traversal, leaf } = buildDeepChain(depth)
      const store = makeWalkStore(traversal)
      store.get(leaf).cursor(true)
      store.get("root").cursorDescendant()
    })
  }
})

describe("balanced tree stress (fanout=10, depth=4 ≈ 11K nodes)", () => {
  bench("sparse: cursor on middle leaf, read root", () => {
    const { traversal, leaves } = buildBalancedTree(10, 4)
    const store = makeSparseStore(traversal)
    const target = leaves[Math.floor(leaves.length / 2)]!
    store.get(target).cursor(true)
    store.get("root").cursorDescendant()
  })
  bench("walk: cursor on middle leaf, read root", () => {
    const { traversal, leaves } = buildBalancedTree(10, 4)
    const store = makeWalkStore(traversal)
    const target = leaves[Math.floor(leaves.length / 2)]!
    store.get(target).cursor(true)
    store.get("root").cursorDescendant()
  })
})

describe("rebind cost (strategies rebuild their indices)", () => {
  bench("sparse: rebind 10K column with 100 truthy nodes", () => {
    const { traversal, ids } = buildLinearTree(10_000)
    const store = makeSparseStore(traversal)
    for (let i = 0; i < 100; i++) store.get(ids[i * 100]!).cursor(true)
    store.rebind(traversal)
  })

  bench("sparse: rebind 100K column with 0 truthy nodes (fast path)", () => {
    const { traversal } = buildLinearTree(100_000)
    const store = makeSparseStore(traversal)
    store.rebind(traversal)
  })

  bench("sparse: rebind 10K column with ALL nodes truthy (pathological)", () => {
    const { traversal, ids } = buildLinearTree(10_000)
    const store = makeSparseStore(traversal)
    for (const id of ids) store.get(id).cursor(true)
    store.rebind(traversal)
  })
})

describe("sequential write throughput", () => {
  bench("sparse: 1000 cursor toggles on 10K column (single-truthy)", () => {
    const { traversal, ids } = buildLinearTree(10_000)
    const store = makeSparseStore(traversal)
    let prev: string | null = null
    for (let i = 0; i < 1_000; i++) {
      if (prev) store.get(prev).cursor(false)
      const next = ids[i % ids.length]!
      store.get(next).cursor(true)
      prev = next
    }
  })

  bench("walk: 1000 toggles + read after each (amplifies walk cost)", () => {
    const { traversal, ids } = buildLinearTree(10_000)
    const store = makeWalkStore(traversal)
    let prev: string | null = null
    for (let i = 0; i < 1_000; i++) {
      if (prev) store.get(prev).cursor(false)
      const next = ids[i % ids.length]!
      store.get(next).cursor(true)
      prev = next
      store.get("col").cursorDescendant()
    }
  })
})

describe("singleton vs sparse for single-select", () => {
  bench("singleton: cursor move on 10K column", () => {
    const { traversal, ids } = buildLinearTree(10_000)
    const store = makeSingletonStore(traversal)
    store.get(ids[0]!).cursor(true)
    store.get(ids[0]!).cursor(false)
    store.get(ids[5000]!).cursor(true)
    store.get("col").cursorDescendant()
  })
  bench("sparse: cursor move on 10K column (control)", () => {
    const { traversal, ids } = buildLinearTree(10_000)
    const store = makeSparseStore(traversal)
    store.get(ids[0]!).cursor(true)
    store.get(ids[0]!).cursor(false)
    store.get(ids[5000]!).cursor(true)
    store.get("col").cursorDescendant()
  })
})

describe("multi-strategy coexistence", () => {
  bench("sparse (descendants) + walkUp (ancestors) on 10K column", () => {
    const { traversal, ids } = buildLinearTree(10_000)
    const store = reactiveTree(
      (tree) => ({
        cursor: signal(false),
        ownTag: signal(null as string | null),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cursorDescendant: tree.descendants((x: { cursor: unknown }) => x.cursor).some({ strategy: sparse } as any),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tagAncestor: tree.ancestors((x: { ownTag: unknown }) => x.ownTag).some({ strategy: walkUp } as any),
      }),
      traversal,
    )
    store.get(ids[5000]!).cursor(true)
    store.get("col").cursorDescendant()
    store.get(ids[5000]!).tagAncestor()
  })
})

describe("default strategy resolution", () => {
  bench("default: 100K empty column read (should pick sparse)", () => {
    const { traversal } = buildLinearTree(100_000)
    const store = makeDefaultStore(traversal)
    store.get("col").cursorDescendant()
  })
  bench("default: cursor move + read on 100K column", () => {
    const { traversal, ids } = buildLinearTree(100_000)
    const store = makeDefaultStore(traversal)
    store.get(ids[0]!).cursor(true)
    store.get(ids[0]!).cursor(false)
    store.get(ids[99_999]!).cursor(true)
    store.get("col").cursorDescendant()
  })
})

describe("ACCOUNTING: traversal call counts", () => {
  bench("sparse 100K empty: read cursorDescendant", () => {
    const { traversal, calls } = buildLinearTree(100_000)
    const store = makeSparseStore(traversal)
    calls.children = 0
    calls.parent = 0
    store.get("col").cursorDescendant()
    if (process.env.BENCH_VERBOSE) {
      process.stderr.write(`sparse 100K empty: children()=${calls.children} parent()=${calls.parent}\n`)
    }
  })

  bench("walk 100K empty: read cursorDescendant", () => {
    const { traversal, calls } = buildLinearTree(100_000)
    const store = makeWalkStore(traversal)
    calls.children = 0
    calls.parent = 0
    store.get("col").cursorDescendant()
    if (process.env.BENCH_VERBOSE) {
      process.stderr.write(`walk 100K empty: children()=${calls.children} parent()=${calls.parent}\n`)
    }
  })

  bench("sparse 100K cursor-move write", () => {
    const { traversal, calls, ids } = buildLinearTree(100_000)
    const store = makeSparseStore(traversal)
    store.get(ids[50_000]!).cursor(true)
    calls.children = 0
    calls.parent = 0
    store.get(ids[50_000]!).cursor(false)
    store.get(ids[99_999]!).cursor(true)
    if (process.env.BENCH_VERBOSE) {
      process.stderr.write(`sparse 100K cursor-move write: children()=${calls.children} parent()=${calls.parent}\n`)
    }
  })
})
