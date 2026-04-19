/**
 * Microbenchmark for `descendants(...).some()` / `.count()` on large subtrees.
 *
 * Background: on km-tui.reactive-desc-walk-inversion, cursor navigation blocks
 * the event loop because every column's `cursorDescendant` computed invalidates
 * on cursor change and each walks its subtree via `traversal.children(...)`.
 * This bench measures `children()` call count per cursorDescendant read — the
 * proxy metric for SQL/cache pressure in the real app.
 *
 * Baseline expectation (before the walk inversion fix):
 *   - 1 column × 100K descendants: ~100K children() calls per cursor move
 *
 * Post-fix expectation:
 *   - Same: <100 children() calls (O(depth), not O(subtree))
 */

import { bench, describe } from "vitest"
import { signal } from "alien-signals"
import { reactiveTree, type Traversal } from "../src/index.ts"

function buildLinearTree(size: number): {
  traversal: Traversal
  leafId: string
  rootId: string
  childCallCount: { n: number }
} {
  // Build a mostly-linear tree: root → col → [card0, card1, ..., cardN-1]
  // Each card is a leaf. Total nodes ≈ size + 2.
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
  const childCallCount = { n: 0 }
  const traversal: Traversal = {
    parent: (id) => parent[id] ?? null,
    children: (id) => {
      childCallCount.n++
      return children[id] ?? []
    },
  }
  return { traversal, leafId: "card0", rootId: "root", childCallCount }
}

function buildStore(traversal: Traversal) {
  return reactiveTree(
    (tree) => ({
      cursor: signal(false),
      cursorDescendant: tree.descendants((s: { cursor: unknown }) => s.cursor).some(),
    }),
    traversal,
  )
}

describe("reactive-graph: descendants().some() perf", () => {
  bench(
    "100K linear — cursorDescendant read on empty column (worst case: full subtree walk)",
    () => {
      const { traversal } = buildLinearTree(100_000)
      const store = buildStore(traversal)
      // Read cursorDescendant at col level — no cursor anywhere, so full walk before short-circuit
      store.get("col").cursorDescendant()
    },
    { iterations: 3 },
  )

  bench(
    "100K linear — cursor move between two leaves (simulates keystroke)",
    () => {
      const { traversal, childCallCount } = buildLinearTree(100_000)
      const store = buildStore(traversal)
      // First: plant cursor on card50000
      store.get("card50000").cursor(true)
      store.get("col").cursorDescendant() // reads once
      // Simulate: cursor moves to card99999 (end of column)
      childCallCount.n = 0
      store.get("card50000").cursor(false)
      store.get("card99999").cursor(true)
      // Reader: another column would re-read here. Force re-evaluation.
      store.get("col").cursorDescendant()
    },
    { iterations: 3 },
  )

  bench(
    "1K linear — control run for scale comparison",
    () => {
      const { traversal } = buildLinearTree(1_000)
      const store = buildStore(traversal)
      store.get("col").cursorDescendant()
    },
    { iterations: 10 },
  )
})

describe("reactive-graph: children() call count accounting", () => {
  bench(
    "ACCOUNTING: children() calls per cursorDescendant read on 100K-descendant column",
    () => {
      const { traversal, childCallCount } = buildLinearTree(100_000)
      const store = buildStore(traversal)
      childCallCount.n = 0
      store.get("col").cursorDescendant()
      // Benchmark result text will show ops/sec; children count is side-observed.
      // Print once per run via console for visibility.
      if (process?.env?.BENCH_VERBOSE) {
        process.stderr.write(`children() calls: ${childCallCount.n}\n`)
      }
    },
    { iterations: 1 },
  )
})
