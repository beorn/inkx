/**
 * Reduced Signals — cached tree reductions, incrementally recomputed on change.
 *
 * A reduced signal is a cached pure function over the tree. Like Array.reduce,
 * but over a tree walk. Results are stored as per-node alien-signals for
 * efficient React subscription via useSignal.
 *
 * ## Usage
 *
 * ```ts
 * const store = createReactiveTree({
 *   cursor: signal(false),
 *   selected: signal(false),
 *   editing: signal(false),
 *   cursorDescendant: tree.descendants(s => s.cursor).some(),
 *   selectedAncestor: tree.ancestors(s => s.selected).some(),
 *   editingDescendant: tree.descendants(s => s.editing).some(),
 * })
 *
 * store.batch(treeAccess, () => {
 *   store.node("sub1").cursor(true)
 * })
 * // store.node("card1").cursorDescendant() → true
 * ```
 *
 * Design doc: docs/design/tree-reduce.md
 * Visual spec: docs/design/node-visual-spec.md
 */

import { signal } from "alien-signals"

// alien-signals: signal(v) returns a function. sig() reads, sig(v) writes.
type AlienSignal<T> = {
  (): T
  (value: T): void
}

// ─── Tree Access Interface ──────────────────────────────────────────────────

/** Minimal tree navigation — no dependency on Repo */
export interface TreeAccess {
  parent(nodeId: string): string | null
  children(nodeId: string): readonly string[]
}

// ─── Symbol Brand ───────────────────────────────────────────────────────────

const REDUCED = Symbol.for("km:reduced")

/** Marker type for reduced signal descriptors */
export interface ReducedDescriptor<_T = unknown> {
  readonly [REDUCED]: true
  readonly direction: "up" | "down"
  readonly sourceKey: string
  readonly reducerType: "some" | "count"
}

/** Check if a value is a reduced signal descriptor */
export function isReducedDescriptor(value: unknown): value is ReducedDescriptor {
  return (
    value != null && typeof value === "object" && REDUCED in value && (value as Record<symbol, boolean>)[REDUCED] === true
  )
}

// ─── Accessor Capture ───────────────────────────────────────────────────────

/** Capture the property key accessed by an accessor function using a Proxy.
 * `s => s.cursor` → "cursor" */
function captureKey<T>(accessor: (s: T) => unknown): string {
  const keys: string[] = []
  const proxy = new Proxy(
    {},
    {
      get(_, key) {
        keys.push(String(key))
        return undefined
      },
    },
  )
  accessor(proxy as T)
  if (keys.length !== 1) {
    throw new Error(`Accessor must access exactly one property, got ${keys.length}: ${keys.join(", ")}`)
  }
  return keys[0]!
}

// ─── Descriptor Builders ────────────────────────────────────────────────────

interface DirectionBuilder {
  some(): ReducedDescriptor<boolean>
  count(): ReducedDescriptor<number>
}

function createBuilder(direction: "up" | "down", sourceKey: string): DirectionBuilder {
  return {
    some: () => ({ [REDUCED]: true as const, direction, sourceKey, reducerType: "some" as const }),
    count: () => ({ [REDUCED]: true as const, direction, sourceKey, reducerType: "count" as const }),
  }
}

// ─── Tree Namespace ─────────────────────────────────────────────────────────

export const tree = {
  /** Declarative: "some of my ancestors have X" — used in state definitions.
   * @example tree.ancestors(s => s.selected).some() */
  ancestors: <T>(accessor: (s: T) => unknown): DirectionBuilder => createBuilder("up", captureKey(accessor)),

  /** Declarative: "some of my descendants have X" — used in state definitions.
   * @example tree.descendants(s => s.cursor).some() */
  descendants: <T>(accessor: (s: T) => unknown): DirectionBuilder => createBuilder("down", captureKey(accessor)),

  /** Imperative: walk up parent chain from nodeId (excludes self) */
  *up(treeAccess: TreeAccess, nodeId: string): Iterable<string> {
    let current = treeAccess.parent(nodeId)
    while (current !== null) {
      yield current
      current = treeAccess.parent(current)
    }
  },

  /** Imperative: DFS pre-order walk from nodeId (excludes self) */
  *down(treeAccess: TreeAccess, nodeId: string): Iterable<string> {
    const children = treeAccess.children(nodeId)
    const stack: string[] = []
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]!)
    }
    while (stack.length > 0) {
      const id = stack.pop()!
      yield id
      const ch = treeAccess.children(id)
      for (let i = ch.length - 1; i >= 0; i--) {
        stack.push(ch[i]!)
      }
    }
  },
}

// ─── Reactive Tree Store ────────────────────────────────────────────────────

/** State definition: maps field names to either primary signals or reduced descriptors */
type StateDef = Record<string, AlienSignal<boolean> | ReducedDescriptor>

/** Extract primary signal keys from a state definition */
type PrimaryKeys<T extends StateDef> = {
  [K in keyof T]: T[K] extends AlienSignal<boolean> ? K : never
}[keyof T]

/** Extract reduced signal keys from a state definition */
type ReducedKeys<T extends StateDef> = {
  [K in keyof T]: T[K] extends ReducedDescriptor ? K : never
}[keyof T]

/** Per-node accessor: primaries are writable signals, reduceds are read-only */
export type NodeAccessor<T extends StateDef> = {
  [K in PrimaryKeys<T>]: AlienSignal<boolean>
} & {
  readonly [K in ReducedKeys<T>]: () => T[K] extends ReducedDescriptor<infer V> ? V : never
}

interface ReducedDef {
  name: string
  descriptor: ReducedDescriptor
}

/** Internal per-node storage */
interface NodeStore {
  primary: Map<string, AlienSignal<boolean>>
  reduced: Map<string, AlienSignal<unknown>>
  counts: Map<string, number>
}

/** Map-like API: get/has/delete/size/clear, plus batch for atomic writes */
export interface ReactiveTreeStore<T extends StateDef> {
  /** Get typed per-node accessor (lazy creation) */
  get(nodeId: string): NodeAccessor<T>
  /** Check if a node exists in the store */
  has(nodeId: string): boolean
  /** Remove a node and subtract its contributions from ancestor/descendant counts */
  delete(nodeId: string, treeAccess?: TreeAccess): void
  /** Number of tracked nodes */
  readonly size: number
  /** Clear all nodes (topology change) */
  clear(): void
  /** Batch multiple signal writes — recomputes reduced signals once at the end */
  batch(treeAccess: TreeAccess, fn: () => void): void
}

/**
 * Create a reactive tree store from a state definition.
 *
 * The definition maps field names to either primary signals (writable) or
 * reduced descriptors (cached tree reductions, read-only per node).
 *
 * @example
 * ```ts
 * const store = createReactiveTree({
 *   cursor: signal(false),
 *   selected: signal(false),
 *   cursorDescendant: tree.descendants(s => s.cursor).some(),
 *   selectedAncestor: tree.ancestors(s => s.selected).some(),
 * })
 * ```
 */
export function createReactiveTree<T extends StateDef>(def: T): ReactiveTreeStore<T> {
  // Separate primary signals from reduced descriptors
  const primaryKeys: string[] = []
  const reducedDefs: ReducedDef[] = []

  for (const [key, value] of Object.entries(def)) {
    if (isReducedDescriptor(value)) {
      reducedDefs.push({ name: key, descriptor: value })
    } else {
      primaryKeys.push(key)
    }
  }

  // Internal state
  const nodes = new Map<string, NodeStore>()
  let inBatch = false
  let pendingChanges: Array<{ key: string; nodeId: string; oldValue: boolean; newValue: boolean }> = []

  // ── Node creation ──

  function getOrCreateNode(nodeId: string): NodeStore {
    let ns = nodes.get(nodeId)
    if (!ns) {
      ns = { primary: new Map(), reduced: new Map(), counts: new Map() }
      for (const pk of primaryKeys) {
        ns.primary.set(pk, signal(false) as AlienSignal<boolean>)
      }
      for (const rd of reducedDefs) {
        const initial = rd.descriptor.reducerType === "count" ? 0 : false
        ns.reduced.set(rd.name, signal(initial) as AlienSignal<unknown>)
        ns.counts.set(rd.name, 0)
      }
      nodes.set(nodeId, ns)
    }
    return ns
  }

  // ── Typed node accessor ──

  function createNodeAccessor(nodeId: string): NodeAccessor<T> {
    const ns = getOrCreateNode(nodeId)
    const accessor: Record<string, unknown> = {}

    // Primary signals: writable, trigger propagation
    for (const key of primaryKeys) {
      const sig = ns.primary.get(key)!
      // Wrap to intercept writes for batching
      accessor[key] = Object.assign(
        function primaryAccessor(value?: boolean) {
          if (arguments.length === 0) return sig()
          const oldValue = sig()
          if (oldValue === value) return
          sig(value!)
          if (inBatch) {
            pendingChanges.push({ key, nodeId, oldValue, newValue: value! })
          } else {
            recompute([{ key, nodeId, oldValue, newValue: value! }])
          }
        } as AlienSignal<boolean>,
        { toString: () => `[signal:${key}]` },
      )
    }

    // Reduced signals: read-only
    for (const rd of reducedDefs) {
      const sig = ns.reduced.get(rd.name)!
      accessor[rd.name] = () => sig()
    }

    return accessor as NodeAccessor<T>
  }

  // ── Recomputation ──

  function recompute(
    changes: Array<{ key: string; nodeId: string; oldValue: boolean; newValue: boolean }>,
    treeAccess?: TreeAccess,
  ): void {
    if (!treeAccess) return

    for (const change of changes) {
      const delta = (change.newValue ? 1 : 0) - (change.oldValue ? 1 : 0)
      if (delta === 0) continue

      for (const rd of reducedDefs) {
        if (rd.descriptor.sourceKey !== change.key) continue

        if (rd.descriptor.direction === "down") {
          for (const ancestorId of tree.up(treeAccess, change.nodeId)) {
            updateCount(ancestorId, rd.name, delta, rd.descriptor)
          }
        } else {
          for (const descendantId of tree.down(treeAccess, change.nodeId)) {
            updateCount(descendantId, rd.name, delta, rd.descriptor)
          }
        }
      }
    }
  }

  function updateCount(nodeId: string, name: string, delta: number, descriptor: ReducedDescriptor): void {
    const ns = getOrCreateNode(nodeId)
    const oldCount = ns.counts.get(name) ?? 0
    const newCount = oldCount + delta
    if (newCount < 0) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[reduced-signals] negative count for ${name} on ${nodeId}: ${oldCount} + ${delta}`)
      }
      ns.counts.set(name, 0)
    } else {
      ns.counts.set(name, newCount)
    }
    const effectiveCount = Math.max(0, newCount)

    const sig = ns.reduced.get(name)
    if (!sig) return

    const newValue = descriptor.reducerType === "count" ? effectiveCount : effectiveCount > 0
    if (sig() !== newValue) {
      ;(sig as AlienSignal<unknown>)(newValue)
    }
  }

  // ── Public API ──

  return {
    get(nodeId: string): NodeAccessor<T> {
      return createNodeAccessor(nodeId)
    },

    has(nodeId: string): boolean {
      return nodes.has(nodeId)
    },

    delete(nodeId: string, treeAccess?: TreeAccess): void {
      const ns = nodes.get(nodeId)
      if (!ns) return

      if (treeAccess) {
        const changes: Array<{ key: string; nodeId: string; oldValue: boolean; newValue: boolean }> = []
        for (const [key, sig] of ns.primary) {
          if (sig()) {
            changes.push({ key, nodeId, oldValue: true, newValue: false })
          }
        }
        if (changes.length > 0) {
          recompute(changes, treeAccess)
        }
      }

      nodes.delete(nodeId)
    },

    get size() {
      return nodes.size
    },

    clear() {
      nodes.clear()
    },

    batch(treeAccess: TreeAccess, fn: () => void): void {
      inBatch = true
      pendingChanges = []
      try {
        fn()
      } finally {
        inBatch = false
        if (pendingChanges.length > 0) {
          recompute(pendingChanges, treeAccess)
        }
        pendingChanges = []
      }
    },
  }
}
