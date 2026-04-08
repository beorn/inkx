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
 *   cursor:    primary(false),
 *   selected:  primary(false),
 *   ownSigils: primary(() => [] as string[]),
 *   cursorDescendant:  tree.descendants(s => s.cursor).some(),
 *   selectedAncestor:  tree.ancestors(s => s.selected).some(),
 *   excludedSigils:    tree.ancestors(s => s.ownSigils).reduce(concat, () => [], {
 *                        includeSelf: true, equals: arrayShallowEqual,
 *                      }),
 * })
 *
 * store.batch(treeAccess, () => {
 *   store.get("sub1").cursor(true)
 * })
 * // store.get("card1").cursorDescendant() → true
 * ```
 *
 * Design doc: docs/design/tree-reduce.md
 */

import { signal } from "alien-signals"

// alien-signals call convention: sig() reads, sig(value) writes.
type AlienSignal<T> = { (): T; (value: T): void }

// ─── Tree Access ────────────────────────────────────────────────────────────

/** Minimal tree navigation — no dependency on Repo */
export interface TreeAccess {
  parent(nodeId: string): string | null
  children(nodeId: string): readonly string[]
}

// ─── Symbol Brand ───────────────────────────────────────────────────────────

const REDUCED = Symbol.for("km:reduced")
const PRIMARY = Symbol.for("km:primary")

// ─── Primary Descriptor ─────────────────────────────────────────────────────

/** Primary signal descriptor — writable per-node state with typed initial value */
export interface PrimaryDescriptor<T = unknown> {
  readonly [PRIMARY]: true
  readonly initial: T | (() => T)
}

/** Create a primary signal descriptor. Supports value or factory for non-primitives. */
export function primary<T>(initial: T | (() => T)): PrimaryDescriptor<T> {
  return { [PRIMARY]: true, initial }
}

function isPrimaryDescriptor(value: unknown): value is PrimaryDescriptor {
  return value != null && typeof value === "object" && PRIMARY in value
}

/** Get the initial value from a primary descriptor */
function resolveInitial<T>(desc: PrimaryDescriptor<T>): T {
  return typeof desc.initial === "function" ? (desc.initial as () => T)() : desc.initial
}

// ─── Reduced Descriptor ─────────────────────────────────────────────────────

/** Reduced signal descriptor — cached tree reduction */
export interface ReducedDescriptor<T = unknown> {
  readonly [REDUCED]: true
  readonly direction: "up" | "down"
  readonly sourceKey: string
  readonly reducerType: "some" | "count" | "reduce"
  readonly includeSelf: boolean
  readonly reducer?: (acc: T, value: unknown) => T
  readonly initial?: T | (() => T)
  readonly equals?: (a: T, b: T) => boolean
}

export function isReducedDescriptor(value: unknown): value is ReducedDescriptor {
  return value != null && typeof value === "object" && REDUCED in value && (value as Record<symbol, boolean>)[REDUCED] === true
}

// ─── Accessor Capture ───────────────────────────────────────────────────────

function captureKey<T>(accessor: (s: T) => unknown): string {
  const keys: string[] = []
  const proxy = new Proxy({}, { get(_, key) { keys.push(String(key)); return undefined } })
  accessor(proxy as T)
  if (keys.length !== 1) throw new Error(`Accessor must access exactly one property, got: ${keys.join(", ")}`)
  return keys[0]!
}

// ─── Descriptor Builders ────────────────────────────────────────────────────

interface ReduceOptions<V> {
  includeSelf?: boolean
  equals?: (a: V, b: V) => boolean
}

interface DirectionBuilder {
  /** Boolean: "any match?" */
  some(opts?: { includeSelf?: boolean }): ReducedDescriptor<boolean>
  /** Number: "how many?" */
  count(opts?: { includeSelf?: boolean }): ReducedDescriptor<number>
  /** Custom aggregation — reducer must be pure, must not mutate accumulator.
   * `initial` should be a factory for non-primitives to avoid shared references. */
  reduce<V>(reducer: (acc: V, value: unknown) => V, initial: V | (() => V), opts?: ReduceOptions<V>): ReducedDescriptor<V>
}

function createBuilder(direction: "up" | "down", sourceKey: string): DirectionBuilder {
  return {
    some: (opts) => ({ [REDUCED]: true as const, direction, sourceKey, reducerType: "some" as const, includeSelf: opts?.includeSelf ?? false }),
    count: (opts) => ({ [REDUCED]: true as const, direction, sourceKey, reducerType: "count" as const, includeSelf: opts?.includeSelf ?? false }),
    reduce: (reducer, initial, opts) => ({
      [REDUCED]: true as const, direction, sourceKey, reducerType: "reduce" as const,
      includeSelf: opts?.includeSelf ?? false, reducer, initial, equals: opts?.equals,
    }),
  }
}

// ─── Tree Namespace ─────────────────────────────────────────────────────────

export const tree = {
  /** "values from my ancestors" — ancestor walks (root-to-self for reduce, nearest-first for find) */
  ancestors: <T>(accessor: (s: T) => unknown): DirectionBuilder => createBuilder("up", captureKey(accessor)),
  /** "values from my descendants" — DFS pre-order walk */
  descendants: <T>(accessor: (s: T) => unknown): DirectionBuilder => createBuilder("down", captureKey(accessor)),

  /** Imperative: walk up parent chain (excludes self) */
  *up(treeAccess: TreeAccess, nodeId: string): Iterable<string> {
    let current = treeAccess.parent(nodeId)
    while (current !== null) { yield current; current = treeAccess.parent(current) }
  },

  /** Imperative: DFS pre-order (excludes self) */
  *down(treeAccess: TreeAccess, nodeId: string): Iterable<string> {
    const children = treeAccess.children(nodeId)
    const stack: string[] = []
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!)
    while (stack.length > 0) {
      const id = stack.pop()!
      yield id
      const ch = treeAccess.children(id)
      for (let i = ch.length - 1; i >= 0; i--) stack.push(ch[i]!)
    }
  },
}

// ─── Reactive Tree Store ────────────────────────────────────────────────────

/** State definition: field name → primary descriptor or reduced descriptor */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StateDef = Record<string, PrimaryDescriptor<any> | ReducedDescriptor<any>>

/** Extract keys by descriptor type */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrimaryKeys<T extends StateDef> = { [K in keyof T]: T[K] extends PrimaryDescriptor<any> ? K : never }[keyof T]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReducedKeys<T extends StateDef> = { [K in keyof T]: T[K] extends ReducedDescriptor<any> ? K : never }[keyof T]

/** Per-node accessor: primaries are writable, reduceds are read-only */
export type NodeAccessor<T extends StateDef> = {
  [K in PrimaryKeys<T>]: T[K] extends PrimaryDescriptor<infer V> ? AlienSignal<V> : never
} & {
  readonly [K in ReducedKeys<T>]: () => T[K] extends ReducedDescriptor<infer V> ? V : never
}

/** Internal per-node storage */
interface NodeStore {
  primary: Map<string, AlienSignal<unknown>>
  reduced: Map<string, AlienSignal<unknown>>
  counts: Map<string, number>
}

interface PrimaryDef { name: string; initial: unknown | (() => unknown) }
interface ReducedDef { name: string; descriptor: ReducedDescriptor }

/** Map-like API: get/has/delete/size/clear + batch */
export interface ReactiveTreeStore<T extends StateDef> {
  get(nodeId: string): NodeAccessor<T>
  has(nodeId: string): boolean
  delete(nodeId: string, treeAccess?: TreeAccess): void
  readonly size: number
  clear(): void
  batch(treeAccess: TreeAccess, fn: () => void): void
}

/**
 * Create a reactive tree store from a state definition.
 *
 * Primary signals are writable per-node state. Reduced signals are cached
 * tree aggregates that recompute incrementally on source changes.
 *
 * Walks are coalesced: multiple signals sharing the same direction from the
 * same source node are updated in a single walk.
 */
export function createReactiveTree<T extends StateDef>(def: T): ReactiveTreeStore<T> {
  const primaryDefs: PrimaryDef[] = []
  const reducedDefs: ReducedDef[] = []

  for (const [key, value] of Object.entries(def)) {
    if (isReducedDescriptor(value)) {
      reducedDefs.push({ name: key, descriptor: value })
    } else if (isPrimaryDescriptor(value)) {
      primaryDefs.push({ name: key, initial: value.initial })
    }
  }

  const nodes = new Map<string, NodeStore>()
  let inBatch = false
  let pendingChanges: Array<{ key: string; nodeId: string; oldValue: unknown; newValue: unknown }> = []

  // ── Count-based reduceds (some/count) ──────────────────────────────────

  const countDefs = reducedDefs.filter(d => d.descriptor.reducerType !== "reduce")
  const fullReduceDefs = reducedDefs.filter(d => d.descriptor.reducerType === "reduce")

  // ── Node lifecycle ─────────────────────────────────────────────────────

  function getOrCreateNode(nodeId: string): NodeStore {
    let ns = nodes.get(nodeId)
    if (!ns) {
      ns = { primary: new Map(), reduced: new Map(), counts: new Map() }
      for (const pd of primaryDefs) {
        const init = typeof pd.initial === "function" ? (pd.initial as () => unknown)() : pd.initial
        ns.primary.set(pd.name, signal(init) as AlienSignal<unknown>)
      }
      for (const rd of reducedDefs) {
        const init = rd.descriptor.reducerType === "count" ? 0
          : rd.descriptor.reducerType === "some" ? false
          : typeof rd.descriptor.initial === "function" ? (rd.descriptor.initial as () => unknown)() : rd.descriptor.initial
        ns.reduced.set(rd.name, signal(init) as AlienSignal<unknown>)
        ns.counts.set(rd.name, 0)
      }
      nodes.set(nodeId, ns)
    }
    return ns
  }

  // ── Node accessor ──────────────────────────────────────────────────────

  function createNodeAccessor(nodeId: string): NodeAccessor<T> {
    const ns = getOrCreateNode(nodeId)
    const accessor: Record<string, unknown> = {}

    for (const pd of primaryDefs) {
      const sig = ns.primary.get(pd.name)!
      accessor[pd.name] = Object.assign(
        function primaryAccessor(value?: unknown) {
          if (arguments.length === 0) return sig()
          const oldValue = sig()
          if (oldValue === value) return
          sig(value!)
          if (inBatch) {
            pendingChanges.push({ key: pd.name, nodeId, oldValue, newValue: value })
          } else {
            recompute([{ key: pd.name, nodeId, oldValue, newValue: value }])
          }
        },
        { toString: () => `[signal:${pd.name}]` },
      )
    }

    for (const rd of reducedDefs) {
      const sig = ns.reduced.get(rd.name)!
      accessor[rd.name] = () => sig()
    }

    return accessor as NodeAccessor<T>
  }

  // ── Recomputation ──────────────────────────────────────────────────────

  function recompute(
    changes: Array<{ key: string; nodeId: string; oldValue: unknown; newValue: unknown }>,
    treeAccess?: TreeAccess,
  ): void {
    if (!treeAccess) return

    // ── Count-based signals: delta propagation ──
    // Coalesce walks: group by (walkDirection, sourceNodeId)
    const walks = new Map<string, Array<{ name: string; delta: number; descriptor: ReducedDescriptor; nodeId: string }>>()

    for (const change of changes) {
      const delta = (change.newValue ? 1 : 0) - (change.oldValue ? 1 : 0)
      if (delta === 0) continue

      for (const rd of countDefs) {
        if (rd.descriptor.sourceKey !== change.key) continue
        const walkDir = rd.descriptor.direction === "down" ? "up" : "down" // inverse
        const walkKey = `${walkDir}:${change.nodeId}`
        let group = walks.get(walkKey)
        if (!group) { group = []; walks.set(walkKey, group) }
        group.push({ name: rd.name, delta, descriptor: rd.descriptor, nodeId: change.nodeId })

        // includeSelf: also update the source node itself
        if (rd.descriptor.includeSelf) {
          updateCount(change.nodeId, rd.name, delta, rd.descriptor)
        }
      }
    }

    // One walk per (direction, sourceNode), update all signals at each visited node
    for (const [walkKey, updates] of walks) {
      const colonIdx = walkKey.indexOf(":")
      const dir = walkKey.slice(0, colonIdx)
      const nodeId = walkKey.slice(colonIdx + 1)
      const walker = dir === "up" ? tree.up(treeAccess, nodeId) : tree.down(treeAccess, nodeId)
      for (const visitedId of walker) {
        for (const u of updates) {
          updateCount(visitedId, u.name, u.delta, u.descriptor)
        }
      }
    }

    // ── Full-recompute signals (.reduce): recompute affected targets ──
    if (fullReduceDefs.length > 0) {
      recomputeFullReduce(changes, treeAccess)
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
    if (sig() !== newValue) (sig as AlienSignal<unknown>)(newValue)
  }

  // ── Full-recompute for .reduce() descriptors ──────────────────────────

  function recomputeFullReduce(
    changes: Array<{ key: string; nodeId: string; oldValue: unknown; newValue: unknown }>,
    treeAccess: TreeAccess,
  ): void {
    // Collect affected target nodes per reduce descriptor
    const affected = new Map<ReducedDef, Set<string>>()

    for (const change of changes) {
      for (const rd of fullReduceDefs) {
        if (rd.descriptor.sourceKey !== change.key) continue

        let targets = affected.get(rd)
        if (!targets) { targets = new Set(); affected.set(rd, targets) }

        if (rd.descriptor.direction === "down") {
          // Source changed → ancestors need recompute
          if (rd.descriptor.includeSelf) targets.add(change.nodeId)
          for (const id of tree.up(treeAccess, change.nodeId)) targets.add(id)
        } else {
          // Source changed → descendants need recompute
          if (rd.descriptor.includeSelf) targets.add(change.nodeId)
          for (const id of tree.down(treeAccess, change.nodeId)) targets.add(id)
        }
      }
    }

    // Recompute each affected target
    for (const [rd, targetIds] of affected) {
      for (const targetId of targetIds) {
        recomputeReduceForNode(targetId, rd, treeAccess)
      }
    }
  }

  /** Full recompute of a .reduce() signal for one node */
  function recomputeReduceForNode(nodeId: string, rd: ReducedDef, treeAccess: TreeAccess): void {
    const desc = rd.descriptor
    const reducer = desc.reducer!
    let acc = typeof desc.initial === "function" ? (desc.initial as () => unknown)() : desc.initial

    // Walk and accumulate
    if (desc.direction === "up") {
      // Ancestors: root-to-self order for reduce
      const ancestors: string[] = []
      if (desc.includeSelf) ancestors.push(nodeId)
      for (const id of tree.up(treeAccess, nodeId)) ancestors.push(id)
      ancestors.reverse() // root first
      for (const id of ancestors) {
        const sourceSig = nodes.get(id)?.primary.get(desc.sourceKey)
        if (sourceSig) acc = reducer(acc, sourceSig())
      }
    } else {
      // Descendants: DFS pre-order
      if (desc.includeSelf) {
        const sourceSig = nodes.get(nodeId)?.primary.get(desc.sourceKey)
        if (sourceSig) acc = reducer(acc, sourceSig())
      }
      for (const id of tree.down(treeAccess, nodeId)) {
        const sourceSig = nodes.get(id)?.primary.get(desc.sourceKey)
        if (sourceSig) acc = reducer(acc, sourceSig())
      }
    }

    // Write if changed
    const ns = getOrCreateNode(nodeId)
    const sig = ns.reduced.get(rd.name)
    if (!sig) return
    const currentValue = sig()
    const eq = desc.equals ?? Object.is
    if (!eq(currentValue as never, acc as never)) {
      ;(sig as AlienSignal<unknown>)(acc)
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────

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
        const changes: Array<{ key: string; nodeId: string; oldValue: unknown; newValue: unknown }> = []
        for (const [key, sig] of ns.primary) {
          const val = sig()
          if (val) changes.push({ key, nodeId, oldValue: val, newValue: typeof val === "boolean" ? false : undefined })
        }
        if (changes.length > 0) recompute(changes, treeAccess)
      }
      nodes.delete(nodeId)
    },
    get size() { return nodes.size },
    clear() { nodes.clear() },
    batch(treeAccess: TreeAccess, fn: () => void): void {
      inBatch = true
      pendingChanges = []
      try { fn() } finally {
        inBatch = false
        if (pendingChanges.length > 0) recompute(pendingChanges, treeAccess)
        pendingChanges = []
      }
    },
  }
}
