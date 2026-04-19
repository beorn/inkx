/**
 * Strategy — how a tree-scoped aggregate is maintained.
 *
 * The engine decomposes into three primitives:
 *
 *   1. Signals     — per-node writable state (plain `signal()` from alien-signals)
 *   2. Descriptors — what to aggregate (`descendants/ancestors(key).some|count|reduce(...)`)
 *   3. Strategies  — HOW to maintain the aggregate (sparse index, walk on read, etc.)
 *
 * A strategy is a factory (`Strategy = (ctx) => StrategyInstance`) that the
 * engine calls once per descriptor. The instance holds per-descriptor state in
 * its closure, receives signal-change and rebind notifications from the engine,
 * and produces per-node reads that the engine wraps in alien-signals computeds.
 *
 * This matches the project's composition rules (docs/principles.md):
 *
 *   - plain functions returning plain objects (no classes, no singletons)
 *   - explicit DI via `StrategyContext` (no globals, no hidden state)
 *   - defaults over configuration (engine picks a strategy if the user doesn't)
 *   - composable: users can plug their own strategies without modifying the engine
 *
 * See `strategies/` for the built-in implementations:
 *   - sparse  — O(1) reads for `descendants(...).some()/.count()` on sparse keys
 *   - walk    — reference walk-on-read for any aggregate (slow, always correct)
 *   - walkUp  — walk-on-read for `ancestors(...)` (O(depth), cheap)
 */

import type { Sig } from "./types.ts"
import type { Descriptor, Traversal } from "./types.ts"

/**
 * Read-only view of the engine's state, passed to every strategy call.
 *
 * Ownership: the engine owns `treeVersion` (a signal bumped on rebind); the
 * strategy depends on it in `read()` so its computeds invalidate when the tree
 * shape changes. Strategies hold their own indices / counters in their closure.
 *
 * The `traversal` and walk helpers are methods (not properties) because the
 * underlying traversal can be swapped by `rebind()` — callers must always
 * dereference through these accessors, never snapshot the result.
 */
export interface StrategyContext {
  /** The full descriptor (key, dir, type, includeSelf, reducer, initial). */
  readonly descriptor: Descriptor
  /** Per-node accessor lookup. May be called re-entrantly during read. */
  get(nodeId: string): Record<string, unknown>
  /** Current traversal. Always re-read — rebind() may have replaced it. */
  traversal(): Traversal
  /** Tree-version signal; strategies MUST read it in their `read()` closures. */
  treeVersion(): number
  /** DFS descendants of `id`, excluding `id` itself. */
  walkDown(id: string): Iterable<string>
  /** Ancestors of `id` from parent up to root, excluding `id` itself. */
  walkUp(id: string): Iterable<string>
}

/**
 * The per-descriptor instance a strategy returns.
 *
 * The engine dispatches:
 *   - `onSignalChange` whenever a signal with `descriptor.key` flips on ANY node
 *   - `onRebind`        whenever `createTree.rebind()` swaps the traversal
 *   - `read(nodeId)`    once per distinct node (the result is wrapped in a computed)
 *
 * Strategies that don't care about a given event simply omit the handler.
 */
export interface StrategyInstance {
  /** Called after a signal write when the old and new values differ. */
  onSignalChange?(nodeId: string, oldValue: unknown, newValue: unknown): void
  /** Called when `createTree.rebind()` swaps the traversal. */
  onRebind?(): void
  /** Called when `createTree.clear()` wipes all nodes. */
  onClear?(): void
  /** Produce the per-node read. The engine wraps this in `computed()`. */
  read(nodeId: string): () => unknown
}

/**
 * Strategy factory — called once per descriptor at `createTree` creation.
 *
 * Implementations live in `strategies/` and are plain arrow functions. The
 * closure holds any per-descriptor state (sparse indices, caches, counters).
 */
export type Strategy = (ctx: StrategyContext) => StrategyInstance

/** Re-export the Sig type for strategy implementations that need it. */
export type { Sig }
