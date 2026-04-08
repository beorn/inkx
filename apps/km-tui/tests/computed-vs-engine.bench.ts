/**
 * Head-to-head: computed-based reactive graph vs count-based engine.
 *
 * Same API, same semantics. Which is faster?
 */

import { bench, describe } from "vitest"
import { signal, computed, startBatch, endBatch } from "alien-signals"
import { createReactiveTree, tree } from "../src/state/reduced-signals.ts"

// ─── Shared tree ────────────────────────────────────────────────────────────

interface Traversal {
  parent(id: string): string | null
  children(id: string): readonly string[]
}

function flatTree(n: number): { t: Traversal; ids: string[] } {
  const ids = ["root"]
  const ch: Record<string, string[]> = { root: [] }
  const pa: Record<string, string | null> = { root: null }
  for (let i = 0; i < n; i++) {
    const id = `n${i}`
    ids.push(id)
    ch[id] = []
    pa[id] = "root"
    ch["root"]!.push(id)
  }
  return { t: { parent: (id) => pa[id] ?? null, children: (id) => ch[id] ?? [] }, ids }
}

function deepTree(depth: number): { t: Traversal; ids: string[] } {
  const ids = ["root"]
  const ch: Record<string, string[]> = { root: [] }
  const pa: Record<string, string | null> = { root: null }
  let prev = "root"
  for (let i = 0; i < depth; i++) {
    const id = `c${i}`
    ids.push(id)
    ch[id] = []
    pa[id] = prev
    ch[prev]!.push(id)
    prev = id
  }
  return { t: { parent: (id) => pa[id] ?? null, children: (id) => ch[id] ?? [] }, ids }
}

// ─── Computed-based implementation ──────────────────────────────────────────

type AlienSignal<T> = { (): T; (value: T): void }

function createComputedGraph(traversal: Traversal) {
  const nodes = new Map<string, { cursor: AlienSignal<boolean>; cursorDescendant: () => boolean }>()

  function getNode(id: string) {
    let n = nodes.get(id)
    if (!n) {
      const cursor = signal(false) as AlienSignal<boolean>
      const cursorDescendant = computed(() => {
        // Walk up from this node — do any ancestors have cursor?
        // Wait, cursorDescendant = "any DESCENDANT has cursor"
        // So walk DOWN (children) and check cursor
        const stack = [...traversal.children(id)]
        while (stack.length > 0) {
          const cid = stack.pop()!
          // Read the cursor signal — creates dependency
          if (getNode(cid).cursor()) return true
          for (const child of traversal.children(cid)) stack.push(child)
        }
        return false
      })
      n = { cursor, cursorDescendant }
      nodes.set(id, n)
    }
    return n
  }

  return {
    get: getNode,
    batch(fn: () => void) {
      startBatch()
      fn()
      endBatch()
    },
  }
}

// ─── Engine-based (our current implementation) ──────────────────────────────

const engineSchema = {
  cursor: signal(false),
  cursorDescendant: tree.descendants((s: { cursor: unknown }) => s.cursor).some(),
}

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe("cursor move — flat 100 siblings", () => {
  const { t, ids } = flatTree(100)

  bench("computed", () => {
    const g = createComputedGraph(t)
    g.batch(() => g.get(ids[1]!).cursor(true))
    for (let i = 2; i < 52; i++) {
      g.batch(() => {
        g.get(ids[i - 1]!).cursor(false)
        g.get(ids[i]!).cursor(true)
      })
    }
    // Read to ensure computed evaluates
    g.get("root").cursorDescendant()
  })

  bench("engine", () => {
    const store = createReactiveTree(engineSchema)
    store.batch(t, () => store.get(ids[1]!).cursor(true))
    for (let i = 2; i < 52; i++) {
      store.batch(t, () => {
        store.get(ids[i - 1]!).cursor(false)
        store.get(ids[i]!).cursor(true)
      })
    }
    store.get("root").cursorDescendant()
  })
})

describe("cursor move — flat 1000 siblings", () => {
  const { t, ids } = flatTree(1000)

  bench("computed", () => {
    const g = createComputedGraph(t)
    g.batch(() => g.get(ids[1]!).cursor(true))
    for (let i = 2; i < 52; i++) {
      g.batch(() => {
        g.get(ids[i - 1]!).cursor(false)
        g.get(ids[i]!).cursor(true)
      })
    }
    g.get("root").cursorDescendant()
  })

  bench("engine", () => {
    const store = createReactiveTree(engineSchema)
    store.batch(t, () => store.get(ids[1]!).cursor(true))
    for (let i = 2; i < 52; i++) {
      store.batch(t, () => {
        store.get(ids[i - 1]!).cursor(false)
        store.get(ids[i]!).cursor(true)
      })
    }
    store.get("root").cursorDescendant()
  })
})

describe("cursor move — deep chain 50", () => {
  const { t, ids } = deepTree(50)

  bench("computed", () => {
    const g = createComputedGraph(t)
    const leaf = ids[ids.length - 1]!
    const parent = ids[ids.length - 2]!
    g.batch(() => g.get(leaf).cursor(true))
    for (let i = 0; i < 50; i++) {
      g.batch(() => {
        g.get(i % 2 === 0 ? leaf : parent).cursor(false)
        g.get(i % 2 === 0 ? parent : leaf).cursor(true)
      })
    }
    g.get("root").cursorDescendant()
  })

  bench("engine", () => {
    const store = createReactiveTree(engineSchema)
    const leaf = ids[ids.length - 1]!
    const parent = ids[ids.length - 2]!
    store.batch(t, () => store.get(leaf).cursor(true))
    for (let i = 0; i < 50; i++) {
      store.batch(t, () => {
        store.get(i % 2 === 0 ? leaf : parent).cursor(false)
        store.get(i % 2 === 0 ? parent : leaf).cursor(true)
      })
    }
    store.get("root").cursorDescendant()
  })
})

describe("read-heavy — 50 reads per write, flat 100", () => {
  const { t, ids } = flatTree(100)

  bench("computed", () => {
    const g = createComputedGraph(t)
    g.batch(() => g.get(ids[1]!).cursor(true))
    // 50 reads of root.cursorDescendant
    for (let i = 0; i < 50; i++) g.get("root").cursorDescendant()
    // 1 write
    g.batch(() => { g.get(ids[1]!).cursor(false); g.get(ids[2]!).cursor(true) })
    // 50 more reads
    for (let i = 0; i < 50; i++) g.get("root").cursorDescendant()
  })

  bench("engine", () => {
    const store = createReactiveTree(engineSchema)
    store.batch(t, () => store.get(ids[1]!).cursor(true))
    for (let i = 0; i < 50; i++) store.get("root").cursorDescendant()
    store.batch(t, () => { store.get(ids[1]!).cursor(false); store.get(ids[2]!).cursor(true) })
    for (let i = 0; i < 50; i++) store.get("root").cursorDescendant()
  })
})
