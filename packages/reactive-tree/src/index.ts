/**
 * @km/reactive-tree — per-node signals + tree-scoped computeds.
 *
 * A materialized-view engine over any tree. Writable per-node state is
 * expressed with `signal()`; tree-scoped aggregates (some/count/reduce over
 * ancestors or descendants) are expressed declaratively and maintained by a
 * pluggable `Strategy`. Defaults cover the common cases (sparse ancestor index
 * for descendants(.some/.count), walk for everything else); users can supply
 * their own strategy when the defaults don't fit.
 *
 * ```ts
 * import { signal } from "alien-signals"
 * import { reactiveTree } from "@km/reactive-tree"
 *
 * const store = reactiveTree(
 *   (tree) => ({
 *     cursor:            signal(false),
 *     cursorDescendant:  tree.descendants(s => s.cursor).some(),
 *     selectedAncestor:  tree.ancestors(s => s.selected).some(),
 *     excludedSigils:    tree.ancestors(s => s.ownSigils).reduce(concat, () => []),
 *   }),
 *   { parent, children },
 * )
 *
 * store.get("sub1").cursor(true)
 * store.get("card1").cursorDescendant()  // true (cached computed)
 * ```
 *
 * Engine layering:
 *
 *   1. `types.ts`        — Descriptor, Traversal, Sig
 *   2. `strategy.ts`     — Strategy + StrategyContext + StrategyInstance
 *   3. `strategies/`     — sparse, walk, walkUp, singleton implementations
 *   4. `defaults.ts`     — which strategy the engine picks when user omits one
 *   5. `index.ts` (here) — the factory that wires everything together
 *
 * Traversal is duck-typed (`parent(id) → string|null`, `children(id) → string[]`) —
 * the engine never assumes how your tree is stored. Call `rebind(traversal)` when
 * the topology changes; node identities and writable signal values are preserved,
 * so React subscriptions stay valid across rebinds.
 */

import { signal, computed, startBatch, endBatch, getActiveSub, setActiveSub } from "alien-signals"
import type { Sig, Descriptor, Traversal } from "./types.ts"
import { DESC, isDescriptor } from "./types.ts"
import type { Strategy, StrategyContext, StrategyInstance } from "./strategy.ts"
import { resolveDefaultStrategy } from "./defaults.ts"

// Re-export the strategy surface so consumers can `import { sparse } from "@km/reactive-tree"`
// instead of reaching into a subpath.
export type { Strategy, StrategyContext, StrategyInstance } from "./strategy.ts"
export type { Traversal, Descriptor, Sig } from "./types.ts"
export { sparse, walk, walkUp, singleton } from "./strategies/index.ts"

// ─── Internal batching/untracked helpers ────────────────────────────────────
// Expose alien-signals' low-level primitives in local, safe wrappers so the
// index-mutating paths stay atomic from an observer's perspective (writers
// see one combined reactive update per logical change, never an intermediate
// half-state) and don't accidentally track internal signal reads inside a
// caller's computed / effect.

function runBatch(fn: () => void): void {
  startBatch()
  try {
    fn()
  } finally {
    endBatch()
  }
}

function runUntracked<T>(fn: () => T): T {
  const prev = getActiveSub()
  setActiveSub(undefined)
  try {
    return fn()
  } finally {
    setActiveSub(prev)
  }
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

/** Shared option bag for every aggregate method. */
interface AggregateOptions {
  includeSelf?: boolean
  /** Override the engine's default strategy for this descriptor. */
  strategy?: Strategy
}

interface ReduceOptions<V> extends AggregateOptions {
  equals?: (a: V, b: V) => boolean
}

export interface DirectionBuilder {
  some(opts?: AggregateOptions): Descriptor
  count(opts?: AggregateOptions): Descriptor
  reduce<V>(reducer: (acc: V, value: unknown) => V, initial: V | (() => V), opts?: ReduceOptions<V>): Descriptor
}

function dirBuilder(dir: "up" | "down", key: string): DirectionBuilder {
  return {
    some: (opts) => ({
      [DESC]: true as const,
      dir,
      key,
      type: "some",
      includeSelf: opts?.includeSelf,
      strategy: opts?.strategy,
    }),
    count: (opts) => ({
      [DESC]: true as const,
      dir,
      key,
      type: "count",
      includeSelf: opts?.includeSelf,
      strategy: opts?.strategy,
    }),
    reduce: (reducer, initial, opts) => ({
      [DESC]: true as const,
      dir,
      key,
      type: "reduce",
      reducer: reducer as (acc: unknown, value: unknown) => unknown,
      initial,
      equals: opts?.equals as ((a: unknown, b: unknown) => boolean) | undefined,
      includeSelf: opts?.includeSelf,
      strategy: opts?.strategy,
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

function* walkUpIter(t: Traversal, id: string): Iterable<string> {
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
  const dsl: TreeDSL = {
    descendants: (accessor) => dirBuilder("down", captureKey(accessor)),
    ancestors: (accessor) => dirBuilder("up", captureKey(accessor)),
  }
  const schema = factory(dsl)

  const signalDefs: Array<{ name: string; init: unknown }> = []
  const computedDefs: Array<{ name: string; desc: Descriptor }> = []
  for (const [name, value] of Object.entries(schema)) {
    if (isDescriptor(value)) computedDefs.push({ name, desc: value })
    else signalDefs.push({ name, init: (value as Sig<unknown>)() })
  }

  let traversal = initialTraversal
  const nodes = new Map<string, NodeAccessor<T>>()

  // Shared version signal — every strategy reads it in its per-node computed
  // so rebind() invalidates every tree-walking read atomically.
  const treeVersion = signal(0)
  let treeEpoch = 0

  // ─── Strategy bindings ────────────────────────────────────────────────────
  // For each descriptor: resolve a strategy, build a context, mount it.
  // Group by observed key so signal writes can dispatch to every interested
  // strategy in O(1) per descriptor.

  interface Binding {
    name: string
    desc: Descriptor
    instance: StrategyInstance
    ctx: StrategyContext
  }

  const bindings: Binding[] = []
  const bindingsByKey = new Map<string, Binding[]>()

  function getAccessorForCtx(nodeId: string): Record<string, unknown> {
    return get(nodeId) as unknown as Record<string, unknown>
  }

  for (const { name, desc } of computedDefs) {
    const strategyFactory: Strategy = resolveDefaultStrategy(desc)
    const ctx: StrategyContext = {
      descriptor: desc,
      get: getAccessorForCtx,
      traversal: () => traversal,
      treeVersion: () => treeVersion(),
      walkDown: (id) => walkDown(traversal, id),
      walkUp: (id) => walkUpIter(traversal, id),
    }
    const instance = strategyFactory(ctx)
    const binding: Binding = { name, desc, instance, ctx }
    bindings.push(binding)
    let arr = bindingsByKey.get(desc.key)
    if (!arr) {
      arr = []
      bindingsByKey.set(desc.key, arr)
    }
    arr.push(binding)
  }

  function dispatchSignalChange(key: string, nodeId: string, oldValue: unknown, newValue: unknown): void {
    const arr = bindingsByKey.get(key)
    if (!arr) return
    for (const b of arr) b.instance.onSignalChange?.(nodeId, oldValue, newValue)
  }

  function dispatchRebind(): void {
    for (const b of bindings) b.instance.onRebind?.()
  }

  function dispatchClear(): void {
    for (const b of bindings) b.instance.onClear?.()
  }

  // ─── Node construction ────────────────────────────────────────────────────

  function get(id: string): NodeAccessor<T> {
    let node = nodes.get(id)
    if (node) return node

    const accessor: Record<string, unknown> = {}

    // Signals — wrapped to dispatch onSignalChange when the observed key
    // is watched by at least one strategy. Bootstrap of truthy initial
    // values is deferred until after `nodes.set` so strategy side effects
    // can't re-enter the constructor via `get(id)`.
    const truthyBootstrap: Array<{ name: string; value: unknown }> = []
    for (const { name, init } of signalDefs) {
      const cloned = Array.isArray(init) ? [...init] : typeof init === "object" && init !== null ? { ...init } : init
      const sig = signal(cloned) as Sig<unknown>
      if (bindingsByKey.has(name)) {
        const nodeId = id
        const key = name
        function wrappedSig(value?: unknown) {
          // Read path: no args → return current value (caller's tracking applies)
          // eslint-disable-next-line prefer-rest-params
          if (arguments.length === 0) return sig()
          runBatch(() => {
            // Untracked: a caller inside a computed/effect shouldn't subscribe
            // to this signal just because the wrapper reads it to detect
            // value changes. Only explicit reads (the 0-arg branch) should
            // establish a dependency.
            const oldValue = runUntracked(() => sig())
            // Dispatch BEFORE the signal write so strategies can veto the
            // change by throwing (e.g., singleton's invariant enforcement).
            // If a strategy throws, the signal stays at oldValue — the write
            // below never runs.
            dispatchSignalChange(key, nodeId, oldValue, value)
            sig(value)
          })
          return undefined
        }
        accessor[name] = wrappedSig
        if (!!cloned) truthyBootstrap.push({ name, value: cloned })
      } else {
        accessor[name] = sig
      }
    }

    // Computeds — produced by each descriptor's strategy.
    for (const b of bindings) {
      accessor[b.name] = computed(b.instance.read(id))
    }

    node = accessor as NodeAccessor<T>
    // Register BEFORE seeding — if a strategy's onSignalChange observer calls
    // get(id) re-entrantly, we want it to find the already-registered accessor.
    nodes.set(id, node)
    if (truthyBootstrap.length > 0) {
      runBatch(() => {
        for (const { name, value } of truthyBootstrap) {
          dispatchSignalChange(name, id, undefined, value)
        }
      })
    }
    return node
  }

  return {
    get,
    has: (id) => nodes.has(id),
    clear: () => {
      runBatch(() => {
        nodes.clear()
        dispatchClear()
        treeVersion(++treeEpoch)
      })
    },
    get size() {
      return nodes.size
    },
    rebind(t: Traversal) {
      runBatch(() => {
        traversal = t
        // Rebuild strategy indices first — ancestor chains are different under
        // the new traversal.
        dispatchRebind()
        // Bump the shared version signal. Strategies' `read` computeds read
        // this, so every cached aggregate is invalidated in one go.
        //
        // We intentionally do NOT clear `nodes` — it would destroy signal
        // instances that React components are subscribed to via `useSignal`.
        treeVersion(++treeEpoch)
      })
    },
  }
}
