/**
 * withSlice — a declarative state-slice plugin for the apply chain.
 *
 * This is the ergonomic form of the canonical silvery plugin shape (docs
 * `design/tea.md`): an outer `apply(op)` wrapper owning a slice of state that
 * calls an inner `(state, op) → state | [state, effects]` reducer. bossi's
 * `withLatest` / `withViewMachine` hand-write that wrapper — capture
 * `prev = app.apply`, switch on `op.type`, own a closure `state`, keep a
 * `Set` of listeners for React. `withSlice` collapses all of it into a
 * `{ name, initial, handlers }` declaration.
 *
 * Contrast with the two prior-art helpers it supersedes for this use:
 *
 *   - `definePlugin` is declarative but returns a STANDALONE Zustand-shape
 *     store (no `pipe()` integration) and DROPS the `[state, effects]` tuple
 *     (`definePlugin.ts` "spike drops effects"). `withSlice` is an apply-chain
 *     plugin and PRESERVES effects — they flow out of `apply()` into the
 *     substrate's drain, exactly like a hand-written plugin.
 *   - `createSlice` is an inner reducer but discriminates on `op.op`, not the
 *     apply-chain `op.type`, and THROWS on an unknown op. `withSlice`
 *     discriminates on `op.type` and DELEGATES unknown ops to `prev(op)` so
 *     the chain keeps flowing.
 *
 * Handlers are keyed by op `type`. Each returns either the next state or a
 * `[state, effects]` tuple. State that is `===` to the previous state is a
 * no-op: subscribers are notified exactly once per real change (never on a
 * no-op), but the op is still reported handled (returns the effects, or `[]`).
 * State is assumed to be a non-array object (same convention as `tea()` /
 * `definePlugin`) so `[state, effects]` is unambiguous.
 *
 * The plugin assigns a typed handle at `app[name]` exposing `getState()` +
 * `subscribe(listener)` — bind it into React with {@link useSlice}. Dispatch
 * flows through the shared `app.dispatch(op)`; the slice has no dispatch of
 * its own.
 *
 * @example
 * ```ts
 * const app = pipe(
 *   createBaseApp(),
 *   withSlice({
 *     name: "counter",
 *     initial: { n: 0 },
 *     handlers: {
 *       inc: (s) => ({ n: s.n + 1 }),
 *       add: (s, op: { type: "add"; by: number }) => ({ n: s.n + op.by }),
 *       save: (s) => [s, [{ type: "persist", n: s.n }]], // effect preserved
 *     },
 *   }),
 * )
 * app.dispatch({ type: "inc" })
 * app.counter.getState() // { n: 1 }
 * ```
 */

import type { ApplyResult, Effect, Op } from "./types"
import type { BaseApp } from "./runtime/base-app"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Reducer result: the next state, or `[state, effects]`. */
export type SliceResult<S> = S | readonly [S, Effect[]]

/** One op handler — pure `(state, op) → state | [state, effects]`. */
export type SliceHandler<S, O> = (state: S, op: O) => SliceResult<S>

/**
 * The `handlers:` record: keyed by op `type`. Each handler declares the op
 * variant it consumes as its second parameter (or omits it for payload-free
 * ops).
 */
export type SliceHandlers<S> = Record<string, SliceHandler<S, any>>

/** Does F declare a second (op) parameter? */
type HasOpParam<F> = F extends (a: any, b: any, ...rest: any[]) => any ? true : false

/** The op variant a handler at key K consumes: its declared 2nd param, else `{ type: K }`. */
type InferOpParam<F, K extends string> =
  HasOpParam<F> extends true
    ? F extends (s: any, op: infer O) => any
      ? O
      : { type: K }
    : { type: K }

/**
 * The op union a `handlers` map consumes — one variant per key. Export-typed
 * so consumers can annotate their own dispatch: `type CounterOp = SliceOp<typeof handlers>`.
 */
export type SliceOp<H> = { [K in keyof H & string]: InferOpParam<H[K], K> }[keyof H & string]

/** The read-side handle assigned at `app[name]`. Bind with {@link useSlice}. */
export interface SliceHandle<S> {
  /** Current slice state (stable identity between changes). */
  getState(): S
  /** Subscribe to changes. Returns an unsubscribe function. Plain `Set` semantics. */
  subscribe(listener: () => void): () => void
}

/** Input to {@link withSlice}. */
export interface WithSliceSpec<Name extends string, S, H extends SliceHandlers<S>> {
  readonly name: Name
  readonly initial: S
  readonly handlers: H
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

/**
 * Build an apply-chain plugin from a declarative slice spec. See the module
 * docstring for the full contract.
 */
export function withSlice<Name extends string, S, H extends SliceHandlers<S>>(
  spec: WithSliceSpec<Name, S, H>,
): <A extends BaseApp>(app: A) => A & { [K in Name]: SliceHandle<S> } {
  const { name, initial, handlers } = spec

  return <A extends BaseApp>(app: A): A & { [K in Name]: SliceHandle<S> } => {
    let state = initial
    const listeners = new Set<() => void>()

    const handle: SliceHandle<S> = {
      getState: () => state,
      subscribe(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }

    const prev = app.apply
    app.apply = (op: Op): ApplyResult => {
      const handler = handlers[op.type]
      if (!handler) return prev(op)
      const result = handler(state, op)
      const [next, effects] = Array.isArray(result)
        ? (result as readonly [S, Effect[]])
        : [result as S, [] as Effect[]]
      if (next !== state) {
        state = next
        for (const listener of listeners) listener()
      }
      return effects as Effect[]
    }

    return Object.assign(app, { [name]: handle }) as A & { [K in Name]: SliceHandle<S> }
  }
}
