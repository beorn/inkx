/**
 * Reduced Signals — cached tree reductions, incrementally recomputed on change.
 *
 * A reduced signal is a cached pure function over the tree. Like Array.reduce,
 * but over a tree walk. Results are stored as per-node alien-signals for
 * efficient React subscription via useSignal.
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
interface ReducedDescriptor<T> {
  readonly [REDUCED]: true
  readonly direction: "up" | "down"
  readonly sourceKey: string
  readonly reducerType: "some" | "count"
}

/** Check if a value is a reduced signal descriptor */
export function isReducedDescriptor(value: unknown): value is ReducedDescriptor<unknown> {
  return value != null && typeof value === "object" && REDUCED in value && (value as Record<symbol, boolean>)[REDUCED] === true
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
  /** Declarative: "values from my ancestors" — used in state definitions */
  ancestors: (sourceKey: string): DirectionBuilder => createBuilder("up", sourceKey),

  /** Declarative: "values from my descendants" — used in state definitions */
  descendants: (sourceKey: string): DirectionBuilder => createBuilder("down", sourceKey),

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
    // Push in reverse so first child is popped first
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

// ─── Reduced Signal Store ───────────────────────────────────────────────────

interface ReducedDef {
  name: string
  descriptor: ReducedDescriptor<unknown>
}

/** Per-node signals container */
export interface NodeSignals {
  /** Primary signals — set directly by actions */
  primary: Map<string, AlienSignal<boolean>>
  /** Reduced signals — cached tree reductions */
  reduced: Map<string, AlienSignal<unknown>>
  /** Internal counts for reduced signals (counts, not booleans!) */
  counts: Map<string, number>
}

export class ReducedSignalStore {
  private nodes = new Map<string, NodeSignals>()
  private reducedDefs: ReducedDef[] = []
  private inBatch = false
  private pendingSourceChanges: Array<{ key: string; nodeId: string; oldValue: boolean; newValue: boolean }> = []

  /** Register a reduced signal definition. Must be called before any node() calls. */
  defineReduced<T>(name: string, descriptor: ReducedDescriptor<T>): void {
    this.reducedDefs.push({ name, descriptor: descriptor as ReducedDescriptor<unknown> })
  }

  /** Get or create signals for a node. Lazy creation is intentional — nodes are
   * created on first access (either via setPrimary or via component read). */
  node(nodeId: string): NodeSignals {
    let ns = this.nodes.get(nodeId)
    if (!ns) {
      ns = { primary: new Map(), reduced: new Map(), counts: new Map() }
      for (const def of this.reducedDefs) {
        const initial = def.descriptor.reducerType === "count" ? 0 : false
        ns.reduced.set(def.name, signal(initial) as AlienSignal<unknown>)
        ns.counts.set(def.name, 0)
      }
      this.nodes.set(nodeId, ns)
    }
    return ns
  }

  /** Number of tracked nodes (for debugging/monitoring) */
  get size(): number {
    return this.nodes.size
  }

  /** Get a primary signal for a node, creating if needed */
  primarySignal(nodeId: string, key: string): AlienSignal<boolean> {
    const ns = this.node(nodeId)
    let sig = ns.primary.get(key)
    if (!sig) {
      sig = signal(false) as AlienSignal<boolean>
      ns.primary.set(key, sig)
    }
    return sig
  }

  /** Read a primary signal's current value */
  peekPrimary(nodeId: string, key: string): boolean {
    const sig = this.nodes.get(nodeId)?.primary.get(key)
    return sig ? sig() : false
  }

  /** Read a reduced signal for a node */
  reducedSignal(nodeId: string, name: string): AlienSignal<unknown> | undefined {
    return this.nodes.get(nodeId)?.reduced.get(name)
  }

  /** Set a primary signal value — batched or immediate */
  setPrimary(nodeId: string, key: string, value: boolean): void {
    const sig = this.primarySignal(nodeId, key)
    const oldValue = sig()
    if (oldValue === value) return

    sig(value)

    if (this.inBatch) {
      this.pendingSourceChanges.push({ key, nodeId, oldValue, newValue: value })
    } else {
      // Auto-batch: immediate recomputation (no tree access → no propagation)
      this.recompute([{ key, nodeId, oldValue, newValue: value }])
    }
  }

  /** Batch multiple signal writes — recomputes reduced signals once at the end */
  batch(treeAccess: TreeAccess, fn: () => void): void {
    this.inBatch = true
    this.pendingSourceChanges = []
    try {
      fn()
    } finally {
      this.inBatch = false
      if (this.pendingSourceChanges.length > 0) {
        this.recompute(this.pendingSourceChanges, treeAccess)
      }
      this.pendingSourceChanges = []
    }
  }

  /** Remove a node and its signals — clean up on tree removal */
  removeNode(nodeId: string, treeAccess?: TreeAccess): void {
    const ns = this.nodes.get(nodeId)
    if (!ns) return

    if (treeAccess) {
      const changes: Array<{ key: string; nodeId: string; oldValue: boolean; newValue: boolean }> = []
      for (const [key, sig] of ns.primary) {
        if (sig()) {
          changes.push({ key, nodeId, oldValue: true, newValue: false })
        }
      }
      if (changes.length > 0) {
        this.recompute(changes, treeAccess)
      }
    }

    this.nodes.delete(nodeId)
  }

  /**
   * Recompute reduced signals affected by source changes.
   *
   * Key insight: propagation direction is the INVERSE of the descriptor direction.
   * - "down" descriptor (cursorDescendant): source change → propagate UP to ancestors
   * - "up" descriptor (selectedAncestor): source change → propagate DOWN to descendants
   */
  private recompute(
    changes: Array<{ key: string; nodeId: string; oldValue: boolean; newValue: boolean }>,
    treeAccess?: TreeAccess,
  ): void {
    if (!treeAccess) return

    for (const change of changes) {
      const delta = (change.newValue ? 1 : 0) - (change.oldValue ? 1 : 0)
      if (delta === 0) continue

      for (const def of this.reducedDefs) {
        if (def.descriptor.sourceKey !== change.key) continue

        if (def.descriptor.direction === "down") {
          // "down" descriptor → propagate UP to ancestors
          for (const ancestorId of tree.up(treeAccess, change.nodeId)) {
            this.updateCount(ancestorId, def.name, delta, def.descriptor)
          }
        } else {
          // "up" descriptor → propagate DOWN to descendants
          for (const descendantId of tree.down(treeAccess, change.nodeId)) {
            this.updateCount(descendantId, def.name, delta, def.descriptor)
          }
        }
      }
    }
  }

  /** Update the internal count for a reduced signal and write the derived value */
  private updateCount(nodeId: string, name: string, delta: number, descriptor: ReducedDescriptor<unknown>): void {
    const ns = this.node(nodeId)
    const oldCount = ns.counts.get(name) ?? 0
    const newCount = oldCount + delta
    if (newCount < 0) {
      // Dev assertion: negative counts indicate a stale-topology bug.
      // Clamp to 0 to avoid cascading corruption, but log for debugging.
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

  /** Check if a node exists in the store */
  hasNode(nodeId: string): boolean {
    return this.nodes.has(nodeId)
  }

  /** Clear all nodes (for testing) */
  clear(): void {
    this.nodes.clear()
  }
}
