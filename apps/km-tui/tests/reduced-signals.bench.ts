/**
 * Pure reduced signals engine benchmark — no React, no rendering.
 *
 * Measures raw signal propagation cost on large trees.
 */

import { bench, describe } from "vitest"
import { createReactiveTree, tree, primary, type TreeAccess } from "../src/state/reduced-signals.ts"

// ─── Tree Generators ────────────────────────────────────────────────────────

/** Build a flat tree: root → N children */
function flatTree(n: number): { tree: TreeAccess; ids: string[] } {
  const ids = ["root"]
  const childrenMap: Record<string, string[]> = { root: [] }
  const parentMap: Record<string, string | null> = { root: null }
  for (let i = 0; i < n; i++) {
    const id = `n${i}`
    ids.push(id)
    childrenMap[id] = []
    parentMap[id] = "root"
    childrenMap["root"]!.push(id)
  }
  return {
    tree: { parent: (id) => parentMap[id] ?? null, children: (id) => childrenMap[id] ?? [] },
    ids,
  }
}

/** Build a deep chain: root → c0 → c1 → ... → cN */
function deepTree(depth: number): { tree: TreeAccess; ids: string[] } {
  const ids = ["root"]
  const childrenMap: Record<string, string[]> = { root: [] }
  const parentMap: Record<string, string | null> = { root: null }
  let prev = "root"
  for (let i = 0; i < depth; i++) {
    const id = `c${i}`
    ids.push(id)
    childrenMap[id] = []
    parentMap[id] = prev
    childrenMap[prev]!.push(id)
    prev = id
  }
  return {
    tree: { parent: (id) => parentMap[id] ?? null, children: (id) => childrenMap[id] ?? [] },
    ids,
  }
}

/** Build a balanced tree: branching factor B, depth D */
function balancedTree(branching: number, depth: number): { tree: TreeAccess; ids: string[] } {
  const ids = ["root"]
  const childrenMap: Record<string, string[]> = { root: [] }
  const parentMap: Record<string, string | null> = { root: null }
  let counter = 0

  function build(parentId: string, d: number) {
    if (d >= depth) return
    for (let i = 0; i < branching; i++) {
      const id = `n${counter++}`
      ids.push(id)
      childrenMap[id] = []
      parentMap[id] = parentId
      if (!childrenMap[parentId]) childrenMap[parentId] = []
      childrenMap[parentId]!.push(id)
      build(id, d + 1)
    }
  }
  build("root", 0)

  return {
    tree: { parent: (id) => parentMap[id] ?? null, children: (id) => childrenMap[id] ?? [] },
    ids,
  }
}

// ─── State Definition ───────────────────────────────────────────────────────

function arrayConcat(acc: string[], value: unknown): string[] {
  const arr = value as string[]
  return arr.length === 0 ? acc : [...acc, ...arr]
}
function arrayEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

const boolDef = {
  cursor: primary(false),
  selected: primary(false),
  cursorDescendant: tree.descendants((s: { cursor: unknown }) => s.cursor).some(),
  selectedAncestor: tree.ancestors((s: { selected: unknown }) => s.selected).some(),
}

const sigilDef = {
  ownSigils: primary(() => [] as string[]),
  cursor: primary(false),
  cursorDescendant: tree.descendants((s: { cursor: unknown }) => s.cursor).some(),
  excludedSigils: tree
    .ancestors((s: { ownSigils: unknown }) => s.ownSigils)
    .reduce(arrayConcat, () => [] as string[], { includeSelf: true, equals: arrayEq }),
}

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe("cursor move — flat tree", () => {
  for (const n of [100, 1000, 5000, 10000]) {
    bench(`${n} siblings — move cursor`, () => {
      const { tree: t, ids } = flatTree(n)
      const store = createReactiveTree(boolDef)
      // Initial cursor
      store.batch(t, () => store.get(ids[1]!).cursor(true))
      // Move cursor 50 times
      for (let i = 2; i < Math.min(52, ids.length); i++) {
        store.batch(t, () => {
          store.get(ids[i - 1]!).cursor(false)
          store.get(ids[i]!).cursor(true)
        })
      }
    })
  }
})

describe("cursor move — deep chain", () => {
  for (const d of [10, 50, 100, 500]) {
    bench(`depth ${d} — move cursor leaf to leaf`, () => {
      const { tree: t, ids } = deepTree(d)
      const store = createReactiveTree(boolDef)
      const leaf = ids[ids.length - 1]!
      const parent = ids[ids.length - 2]!
      // Alternate cursor between last two nodes
      for (let i = 0; i < 50; i++) {
        store.batch(t, () => {
          store.get(i % 2 === 0 ? parent : leaf).cursor(false)
          store.get(i % 2 === 0 ? leaf : parent).cursor(true)
        })
      }
    })
  }
})

describe("selection — balanced tree", () => {
  for (const [b, d] of [[3, 5], [5, 4], [10, 3]] as const) {
    const { tree: t, ids } = balancedTree(b, d)
    bench(`${ids.length} nodes (${b}×${d}) — select/deselect root`, () => {
      const store = createReactiveTree(boolDef)
      for (let i = 0; i < 20; i++) {
        store.batch(t, () => store.get("root").selected(i % 2 === 0))
      }
    })
  }
})

describe("excludedSigils — .reduce() on deep chain", () => {
  for (const d of [10, 50, 100]) {
    bench(`depth ${d} — set root sigils, read leaf`, () => {
      const { tree: t, ids } = deepTree(d)
      const store = createReactiveTree(sigilDef)
      const leaf = ids[ids.length - 1]!
      for (let i = 0; i < 20; i++) {
        store.batch(t, () => store.get("root").ownSigils([`@sig${i}`]))
        store.get(leaf).excludedSigils() // force read
      }
    })
  }
})

describe("node creation — lazy init cost", () => {
  for (const n of [100, 1000, 5000]) {
    bench(`create ${n} nodes`, () => {
      const { tree: t, ids } = flatTree(n)
      const store = createReactiveTree(boolDef)
      for (const id of ids) {
        store.get(id) // lazy create
      }
    })
  }
})
