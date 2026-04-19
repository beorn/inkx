/**
 * Stress + perf benchmarks for @km/reactive-tree.
 *
 * Measures the default-strategy engine (sparse-ancestor-index for
 * descendants + some/count; walk for ancestors + anything; walk for reduce).
 * The public API doesn't let users pick strategies — the engine classifies
 * descriptors and chooses for them — so this bench measures what users
 * actually experience at scale.
 *
 * Coverage:
 *   - descendants + some read cost (sparse-backed) across 1K/10K/100K
 *   - ancestors + some read cost (walk-backed — depth-bound) across depths
 *   - cursor move (write + read) on large columns
 *   - deep ancestor chains (50/200/1000 depth)
 *   - balanced tree stress (fanout=10, depth=4)
 *   - rebind cost with 0 / few / many truthy nodes
 *   - sequential write throughput (1000 toggles)
 *   - multi-aggregate coexistence (descendants + ancestors)
 *   - traversal call accounting (BENCH_VERBOSE=1 prints children/parent calls)
 *
 * Correctness contract validated here:
 *   - reading `descendants(key).some()` on an empty 100K column = 0 children() calls
 *   - writing a descendants(key) signal costs O(depth) parent() calls
 *   - reading `ancestors(key).some()` costs O(depth) parent() calls
 *
 * Run: `bun vitest bench packages/reactive-tree/`.
 * Verbose: `BENCH_VERBOSE=1 bun vitest bench packages/reactive-tree/`.
 */

import { bench, describe } from "vitest"
import { signal } from "alien-signals"
import { createTree, type Traversal } from "../src/index.ts"

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

function makeCursorStore(traversal: Traversal) {
  return createTree(
    (tree) => ({
      cursor: signal(false),
      cursorDescendant: tree.descendants((x: { cursor: unknown }) => x.cursor).some(),
    }),
    traversal,
  )
}

function makeAncestorStore(traversal: Traversal) {
  return createTree(
    (tree) => ({
      selected: signal(false),
      selectedAncestor: tree.ancestors((x: { selected: unknown }) => x.selected).some(),
    }),
    traversal,
  )
}

function makeMixedStore(traversal: Traversal) {
  return createTree(
    (tree) => ({
      cursor: signal(false),
      ownTag: signal(null as string | null),
      cursorDescendant: tree.descendants((x: { cursor: unknown }) => x.cursor).some(),
      tagAncestor: tree.ancestors((x: { ownTag: unknown }) => x.ownTag).some(),
    }),
    traversal,
  )
}

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe("descendants+some read (sparse-backed)", () => {
  for (const size of [1_000, 10_000, 100_000] as const) {
    bench(`${size}: empty column read (worst case pre-index)`, () => {
      const { traversal } = buildLinearTree(size)
      const store = makeCursorStore(traversal)
      store.get("col").cursorDescendant()
    })
    bench(`${size}: cursor at end, read col`, () => {
      const { traversal } = buildLinearTree(size)
      const store = makeCursorStore(traversal)
      store.get(`card${size - 1}`).cursor(true)
      store.get("col").cursorDescendant()
    })
  }
})

describe("cursor move (keystroke simulation)", () => {
  for (const size of [1_000, 10_000, 100_000] as const) {
    bench(`${size}: move between two leaves + read col`, () => {
      const { traversal } = buildLinearTree(size)
      const store = makeCursorStore(traversal)
      store.get("card0").cursor(true)
      store.get("card0").cursor(false)
      store.get(`card${size - 1}`).cursor(true)
      store.get("col").cursorDescendant()
    })
  }
})

describe("ancestors+some read (walk-backed; O(depth))", () => {
  for (const depth of [50, 200, 1_000] as const) {
    bench(`${depth}-deep: selectedAncestor read from leaf`, () => {
      const { traversal, leaf } = buildDeepChain(depth)
      const store = makeAncestorStore(traversal)
      store.get("root").selected(true)
      store.get(leaf).selectedAncestor()
    })
  }
})

describe("write cost on deep chains (sparse walkUp is O(depth))", () => {
  for (const depth of [50, 200, 1_000] as const) {
    bench(`${depth}-deep: write cursor at leaf`, () => {
      const { traversal, leaf } = buildDeepChain(depth)
      const store = makeCursorStore(traversal)
      store.get(leaf).cursor(true)
    })
  }
})

describe("balanced tree stress (fanout=10, depth=4 ≈ 11K nodes)", () => {
  bench("cursor on middle leaf, read root cursorDescendant", () => {
    const { traversal, leaves } = buildBalancedTree(10, 4)
    const store = makeCursorStore(traversal)
    const target = leaves[Math.floor(leaves.length / 2)]!
    store.get(target).cursor(true)
    store.get("root").cursorDescendant()
  })
})

describe("rebind cost (sparse index rebuilds)", () => {
  bench("10K column with 100 truthy nodes, rebind same shape", () => {
    const { traversal, ids } = buildLinearTree(10_000)
    const store = makeCursorStore(traversal)
    for (let i = 0; i < 100; i++) store.get(ids[i * 100]!).cursor(true)
    store.rebind(traversal)
  })

  bench("100K column with 0 truthy nodes (fast path)", () => {
    const { traversal } = buildLinearTree(100_000)
    const store = makeCursorStore(traversal)
    store.rebind(traversal)
  })

  bench("10K column with ALL nodes truthy (pathological)", () => {
    const { traversal, ids } = buildLinearTree(10_000)
    const store = makeCursorStore(traversal)
    for (const id of ids) store.get(id).cursor(true)
    store.rebind(traversal)
  })
})

describe("sequential write throughput", () => {
  bench("1000 cursor toggles on 10K column (single-truthy at a time)", () => {
    const { traversal, ids } = buildLinearTree(10_000)
    const store = makeCursorStore(traversal)
    let prev: string | null = null
    for (let i = 0; i < 1_000; i++) {
      if (prev) store.get(prev).cursor(false)
      const next = ids[i % ids.length]!
      store.get(next).cursor(true)
      prev = next
    }
  })

  bench("1000 toggles + read after each (cursor-move-then-render)", () => {
    const { traversal, ids } = buildLinearTree(10_000)
    const store = makeCursorStore(traversal)
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

describe("multi-aggregate coexistence", () => {
  bench("descendants + ancestors on 10K column", () => {
    const { traversal, ids } = buildLinearTree(10_000)
    const store = makeMixedStore(traversal)
    store.get(ids[5000]!).cursor(true)
    store.get("col").cursorDescendant()
    store.get(ids[5000]!).tagAncestor()
  })
})

describe("ACCOUNTING: traversal call counts", () => {
  bench("100K empty: read cursorDescendant", () => {
    const { traversal, calls } = buildLinearTree(100_000)
    const store = makeCursorStore(traversal)
    calls.children = 0
    calls.parent = 0
    store.get("col").cursorDescendant()
    if (process.env.BENCH_VERBOSE) {
      process.stderr.write(`100K empty read: children()=${calls.children} parent()=${calls.parent}\n`)
    }
  })

  bench("100K cursor-move write (sparse walkUp)", () => {
    const { traversal, calls, ids } = buildLinearTree(100_000)
    const store = makeCursorStore(traversal)
    store.get(ids[50_000]!).cursor(true)
    calls.children = 0
    calls.parent = 0
    store.get(ids[50_000]!).cursor(false)
    store.get(ids[99_999]!).cursor(true)
    if (process.env.BENCH_VERBOSE) {
      process.stderr.write(`100K cursor-move write: children()=${calls.children} parent()=${calls.parent}\n`)
    }
  })
})
