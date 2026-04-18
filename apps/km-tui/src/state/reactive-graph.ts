/**
 * reactiveTree — per-node signals + tree-scoped computeds.
 *
 * Signals for writable state, computeds for derived aggregates.
 * The engine is alien-signals computed() — no custom machinery.
 *
 * ```ts
 * const store = reactiveTree((tree) => ({
 *   cursor:            signal(false),
 *   cursorDescendant:  tree.descendants(s => s.cursor).some(),
 *   selectedAncestor:  tree.ancestors(s => s.selected).some(),
 *   excludedSigils:    tree.ancestors(s => s.ownSigils).reduce(concat, () => []),
 * }), { parent, children })
 *
 * store.get("sub1").cursor(true)
 * store.get("card1").cursorDescendant()  // true (cached computed)
 * ```
 */

import { signal, computed } from "alien-signals"

// ─── Types ──────────────────────────────────────────────────────────────────

type Sig<T> = { (): T; (value: T): void }

/** Any object with parent + children. Duck typed. */
export interface Traversal {
  parent(id: string): string | null
  children(id: string): readonly string[]
}

// ─── Descriptor (DSL output) ────────────────────────────────────────────────

const DESC = Symbol.for("km:tree-computed")

interface Descriptor {
  [DESC]: true
  dir: "up" | "down"
  key: string
  type: "some" | "count" | "reduce"
  reducer?: (acc: unknown, value: unknown) => unknown
  initial?: unknown | (() => unknown)
  equals?: (a: unknown, b: unknown) => boolean
  includeSelf?: boolean
}

function isDescriptor(v: unknown): v is Descriptor {
  return v != null && typeof v === "object" && DESC in v
}

// ─── Key capture ────────────────────────────────────────────────────────────

function captureKey<T>(accessor: (s: T) => unknown): string {
  const keys: string[] = []
  const proxy = new Proxy(
    {},
    {
      get(_, k) {
        keys.push(String(k))
        return undefined
      },
    },
  )
  accessor(proxy as T)
  if (keys.length !== 1) throw new Error(`Accessor must access exactly one property, got: ${keys.join(", ")}`)
  return keys[0]!
}

// ─── Tree DSL builder ───────────────────────────────────────────────────────

interface DirectionBuilder {
  some(opts?: { includeSelf?: boolean }): Descriptor
  count(opts?: { includeSelf?: boolean }): Descriptor
  reduce<V>(
    reducer: (acc: V, value: unknown) => V,
    initial: V | (() => V),
    opts?: { includeSelf?: boolean; equals?: (a: V, b: V) => boolean },
  ): Descriptor
}

function dirBuilder(dir: "up" | "down", key: string): DirectionBuilder {
  return {
    some: (opts) => ({ [DESC]: true as const, dir, key, type: "some", includeSelf: opts?.includeSelf }),
    count: (opts) => ({ [DESC]: true as const, dir, key, type: "count", includeSelf: opts?.includeSelf }),
    reduce: (reducer, initial, opts) => ({
      [DESC]: true as const,
      dir,
      key,
      type: "reduce",
      reducer: reducer as (acc: unknown, value: unknown) => unknown,
      initial,
      equals: opts?.equals as ((a: unknown, b: unknown) => boolean) | undefined,
      includeSelf: opts?.includeSelf,
    }),
  }
}

export interface TreeDSL {
  descendants<T>(accessor: (s: T) => unknown): DirectionBuilder
  ancestors<T>(accessor: (s: T) => unknown): DirectionBuilder
}

// ─── Walk helpers ───────────────────────────────────────────────────────────

function* walkDown(t: Traversal, id: string): Iterable<string> {
  const stack = [...t.children(id)].reverse()
  while (stack.length > 0) {
    const cid = stack.pop()!
    yield cid
    const ch = t.children(cid)
    for (let i = ch.length - 1; i >= 0; i--) stack.push(ch[i]!)
  }
}

function* walkUp(t: Traversal, id: string): Iterable<string> {
  let cur = t.parent(id)
  while (cur !== null) {
    yield cur
    cur = t.parent(cur)
  }
}

// ─── Store ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SchemaDef = Record<string, Sig<any> | Descriptor>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SignalKeys<T extends SchemaDef> = { [K in keyof T]: T[K] extends Descriptor ? never : K }[keyof T]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ComputedKeys<T extends SchemaDef> = { [K in keyof T]: T[K] extends Descriptor ? K : never }[keyof T]

export type NodeAccessor<T extends SchemaDef> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in SignalKeys<T>]: T[K] extends Sig<infer V> ? Sig<V> : any
} & {
  readonly [K in ComputedKeys<T>]: () => unknown
}

export interface ReactiveTree<T extends SchemaDef> {
  get(id: string): NodeAccessor<T>
  has(id: string): boolean
  clear(): void
  readonly size: number
  rebind(traversal: Traversal): void
}

export function reactiveTree<T extends SchemaDef>(
  factory: (tree: TreeDSL) => T,
  initialTraversal: Traversal,
): ReactiveTree<T> {
  // Build schema via DSL
  const dsl: TreeDSL = {
    descendants: (accessor) => dirBuilder("down", captureKey(accessor)),
    ancestors: (accessor) => dirBuilder("up", captureKey(accessor)),
  }
  const schema = factory(dsl)

  // Separate signals from descriptors
  const signalDefs: Array<{ name: string; init: unknown }> = []
  const computedDefs: Array<{ name: string; desc: Descriptor }> = []
  for (const [name, value] of Object.entries(schema)) {
    if (isDescriptor(value)) computedDefs.push({ name, desc: value })
    else signalDefs.push({ name, init: (value as Sig<unknown>)() })
  }

  let traversal = initialTraversal
  const nodes = new Map<string, NodeAccessor<T>>()

  // Shared version signal — every tree-walking computed reads it to establish
  // a dependency. rebind() bumps it to atomically invalidate all cached
  // computeds, forcing them to re-evaluate against the new traversal.
  const treeVersion = signal(0)

  // ─── Sparse ancestor index for `descendants().some()/.count()` ─────────────
  //
  // Keeps each descendants + some/count descriptor O(depth) per signal write
  // instead of O(subtree) per read. For every signal key that appears in a
  // `descendants(...).some()` or `.count()` descriptor, we maintain:
  //
  //   truthyNodes    = Set of nodeIds where signal[key]() is truthy
  //   countByAncestor = Map<ancestorId, number_of_truthy_descendants>
  //   version        = signal bumped on any index change (drives read invalidation)
  //
  // Writes to indexed signals walk UP from the written node once (O(depth))
  // and adjust countByAncestor entries. Reads of the inverted computed return
  // `countByAncestor.get(nodeId) ?? 0` — O(1).
  //
  // This inverts the ~100K children() calls per cursor move on large vaults
  // (km-tui.reactive-desc-walk-inversion). `reduce` descriptors and the
  // ancestors direction keep their existing walk-based implementation —
  // `reduce` needs the actual values, not just membership, and walkUp is
  // already cheap (max O(depth)).
  interface SparseIndex {
    truthyNodes: Set<string>
    countByAncestor: Map<string, number>
    version: Sig<number>
  }
  const sparseIndices = new Map<string, SparseIndex>()
  for (const { desc } of computedDefs) {
    if (desc.dir === "down" && (desc.type === "some" || desc.type === "count") && !sparseIndices.has(desc.key)) {
      sparseIndices.set(desc.key, { truthyNodes: new Set(), countByAncestor: new Map(), version: signal(0) })
    }
  }

  function indexIncrement(idx: SparseIndex, nodeId: string): void {
    for (const anc of walkUp(traversal, nodeId)) {
      idx.countByAncestor.set(anc, (idx.countByAncestor.get(anc) ?? 0) + 1)
    }
  }
  function indexDecrement(idx: SparseIndex, nodeId: string): void {
    for (const anc of walkUp(traversal, nodeId)) {
      const n = (idx.countByAncestor.get(anc) ?? 0) - 1
      if (n <= 0) idx.countByAncestor.delete(anc)
      else idx.countByAncestor.set(anc, n)
    }
  }
  function indexSet(key: string, nodeId: string, truthy: boolean): void {
    const idx = sparseIndices.get(key)
    if (!idx) return
    if (truthy) {
      if (idx.truthyNodes.has(nodeId)) return
      idx.truthyNodes.add(nodeId)
      indexIncrement(idx, nodeId)
    } else {
      if (!idx.truthyNodes.has(nodeId)) return
      idx.truthyNodes.delete(nodeId)
      indexDecrement(idx, nodeId)
    }
    idx.version(idx.version() + 1)
  }
  function rebuildSparseIndices(): void {
    // Traversal may have changed — ancestor chains are different. Rebuild the
    // countByAncestor maps for every indexed key against the new traversal.
    for (const idx of sparseIndices.values()) {
      idx.countByAncestor.clear()
      for (const nid of idx.truthyNodes) indexIncrement(idx, nid)
      idx.version(idx.version() + 1)
    }
  }

  function get(id: string): NodeAccessor<T> {
    let node = nodes.get(id)
    if (node) return node

    const accessor: Record<string, unknown> = {}

    // Signals — fresh per node, cloned initial value. Signals whose key appears
    // in a sparse-indexed descriptor are wrapped so writes update the index.
    for (const { name, init } of signalDefs) {
      const cloned = Array.isArray(init) ? [...init] : typeof init === "object" && init !== null ? { ...init } : init
      const sig = signal(cloned) as Sig<unknown>
      if (sparseIndices.has(name)) {
        const nodeId = id
        function indexedSig(value?: unknown) {
          // Read path: no args → return current value
          // eslint-disable-next-line prefer-rest-params
          if (arguments.length === 0) return sig()
          const oldTruthy = !!sig()
          sig(value)
          const newTruthy = !!value
          if (oldTruthy !== newTruthy) indexSet(name, nodeId, newTruthy)
          return undefined
        }
        // Bootstrap: if initial value is truthy, seed the index for this node
        if (!!cloned) indexSet(name, id, true)
        accessor[name] = indexedSig
      } else {
        accessor[name] = sig
      }
    }

    // Computeds — derived from tree walks
    for (const { name, desc } of computedDefs) {
      const nodeId = id // capture for closure
      const idx = sparseIndices.get(desc.key)
      if (desc.type === "some" && desc.dir === "down" && idx) {
        // Sparse-inverted: O(1) per read instead of O(subtree)
        accessor[name] = computed(() => {
          treeVersion() // rebind invalidation
          idx.version() // index mutation invalidation
          if (desc.includeSelf) {
            const selfSig = (get(nodeId) as Record<string, Sig<unknown>>)[desc.key]
            if (selfSig?.()) return true
          }
          return (idx.countByAncestor.get(nodeId) ?? 0) > 0
        })
      } else if (desc.type === "count" && desc.dir === "down" && idx) {
        accessor[name] = computed(() => {
          treeVersion()
          idx.version()
          let n = idx.countByAncestor.get(nodeId) ?? 0
          if (desc.includeSelf) {
            const selfSig = (get(nodeId) as Record<string, Sig<unknown>>)[desc.key]
            if (selfSig?.()) n++
          }
          return n
        })
      } else if (desc.type === "some") {
        // ancestors direction — walkUp is cheap (max O(depth))
        accessor[name] = computed(() => {
          treeVersion()
          if (desc.includeSelf && (get(nodeId) as Record<string, Sig<unknown>>)[desc.key]?.()) return true
          for (const vid of walkUp(traversal, nodeId)) {
            if ((get(vid) as Record<string, Sig<unknown>>)[desc.key]?.()) return true
          }
          return false
        })
      } else if (desc.type === "count") {
        accessor[name] = computed(() => {
          treeVersion()
          let n = 0
          if (desc.includeSelf && (get(nodeId) as Record<string, Sig<unknown>>)[desc.key]?.()) n++
          for (const vid of walkUp(traversal, nodeId)) {
            if ((get(vid) as Record<string, Sig<unknown>>)[desc.key]?.()) n++
          }
          return n
        })
      } else {
        // reduce — needs actual values, not just membership. Keep walk-based.
        accessor[name] = computed(() => {
          treeVersion()
          const reducer = desc.reducer!
          let acc = typeof desc.initial === "function" ? (desc.initial as () => unknown)() : desc.initial

          if (desc.dir === "up") {
            // Root-to-self order for ancestors
            const ancestors: string[] = []
            if (desc.includeSelf) ancestors.push(nodeId)
            for (const vid of walkUp(traversal, nodeId)) ancestors.push(vid)
            ancestors.reverse()
            for (const vid of ancestors) {
              const sig = (get(vid) as Record<string, Sig<unknown>>)[desc.key]
              if (sig) acc = reducer(acc, sig())
            }
          } else {
            if (desc.includeSelf) {
              const sig = (get(nodeId) as Record<string, Sig<unknown>>)[desc.key]
              if (sig) acc = reducer(acc, sig())
            }
            for (const vid of walkDown(traversal, nodeId)) {
              const sig = (get(vid) as Record<string, Sig<unknown>>)[desc.key]
              if (sig) acc = reducer(acc, sig())
            }
          }
          return acc
        })
      }
    }

    node = accessor as NodeAccessor<T>
    nodes.set(id, node)
    return node
  }

  return {
    get,
    has: (id) => nodes.has(id),
    clear: () => {
      nodes.clear()
      for (const idx of sparseIndices.values()) {
        idx.truthyNodes.clear()
        idx.countByAncestor.clear()
        idx.version(idx.version() + 1)
      }
    },
    get size() {
      return nodes.size
    },
    rebind(t: Traversal) {
      traversal = t
      // Rebuild sparse indices first — parent chains are different under the
      // new traversal, so countByAncestor entries would be wrong otherwise.
      rebuildSparseIndices()
      // Bump the shared version signal to invalidate every cached tree-walking
      // computed. Without this, computeds that walked with the old traversal
      // would keep returning their stale cached values until one of their
      // per-node signal dependencies changed.
      //
      // We intentionally do NOT clear `nodes` here. Clearing would destroy
      // signal instances that React components are subscribed to via useSignal,
      // causing stale subscriptions (components would never see subsequent writes).
      treeVersion(treeVersion() + 1)
    },
  }
}
