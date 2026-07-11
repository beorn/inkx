/**
 * App primitives for the apply-chain substrate.
 *
 * These are deliberately small plugins over {@link BaseApp}: effects route by
 * discriminator, state rides the existing apply chain, React observes the
 * resulting store, and async sources only pump values into dispatch.
 */

import { useSyncExternalStore } from "react"
import type { BaseApp } from "./runtime/base-app"
import { takeUntil } from "./streams"
import type { Effect, Op } from "./types"

export type EffectRunnerMap<E extends Effect = Effect, A extends BaseApp = BaseApp> = {
  [K in E["type"]]?: (effect: Extract<E, { type: K }>, dispatch: (op: Op) => void, app: A) => void
}

/** Route effects drained after dispatch to handlers keyed by `effect.type`. */
export function withRunners<E extends Effect = Effect, A extends BaseApp = BaseApp>(
  runners: EffectRunnerMap<E, A>,
) {
  return (app: A): A => {
    const { dispatch, drainEffects } = app
    const pending: Effect[] = []
    app.dispatch = run
    app.drainEffects = drain
    return app

    function run(op: Op): void {
      dispatch(op)
      for (const effect of drainEffects()) {
        const runner = runners[effect.type as E["type"]] as
          | ((effect: E, dispatch: (op: Op) => void, app: A) => void)
          | undefined
        if (runner) runner(effect as E, app.dispatch, app)
        else pending.push(effect)
      }
    }

    function drain(): Effect[] {
      const effects = pending.splice(0)
      effects.push(...drainEffects())
      return effects
    }
  }
}

export type SliceResult<State> = readonly [State, readonly Effect[]]
export type SliceHandler<State, Operation extends Op = Op> = (
  state: State,
  op: Operation,
) => SliceResult<State>
export type SliceHandlers<State, Operation extends Op = Op> = {
  readonly [Type in Operation["type"]]?: SliceHandler<State, Extract<Operation, { type: Type }>>
}

export interface SliceHandle<State> {
  getState(): State
  subscribe(listener: () => void): () => void
}

export interface WithSliceSpec<Name extends string, State, Operation extends Op = Op> {
  readonly name: Name
  readonly initial: State
  readonly handlers: SliceHandlers<State, Operation>
}

/**
 * Add a named state slice whose handlers are selected by `op.type`.
 * Handled operations still delegate so stacked slices can consume one op.
 */
export function withSlice<Name extends string, State, Operation extends Op = Op>(
  spec: WithSliceSpec<Name, State, Operation>,
) {
  const { name, initial, handlers } = spec
  return <A extends BaseApp>(app: A): A & { [Key in Name]: SliceHandle<State> } => {
    let state = initial
    const listeners = new Set<() => void>()
    const { apply } = app
    const handle: SliceHandle<State> = { getState, subscribe }
    app.apply = applySlice
    return Object.assign(app, { [name]: handle }) as A & {
      [Key in Name]: SliceHandle<State>
    }

    function applySlice(op: Op) {
      const handler = (handlers as Readonly<Record<string, unknown>>)[op.type] as
        | SliceHandler<State, Op>
        | undefined
      if (!handler) return apply(op)

      const [nextState, effects] = handler(state, op)
      if (nextState !== state) {
        state = nextState
        for (const listener of listeners) listener()
      }

      const downstream = apply(op)
      return downstream === false ? [...effects] : [...effects, ...downstream]
    }

    function getState(): State {
      return state
    }

    function subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
  }
}

/** Read a {@link SliceHandle} from React with stable snapshot semantics. */
export function useSlice<State>(slice: SliceHandle<State>): State {
  return useSyncExternalStore(slice.subscribe, slice.getState, slice.getState)
}

export interface PumpScope {
  readonly signal: AbortSignal
}

export interface SourcePump extends AsyncDisposable {
  readonly done: Promise<void>
  stop(): void
}

export interface SourceApp {
  start(scope?: PumpScope): SourcePump
}

export type SourceInput<Value, A extends BaseApp = BaseApp> =
  | AsyncIterable<Value>
  | ((app: A) => AsyncIterable<Value>)

/** Lazily resolve and pump an async source until it or the owning scope ends. */
export function withSource<Value, A extends BaseApp = BaseApp>(
  source: SourceInput<Value, A>,
  toOp: (value: Value) => Op,
) {
  return (app: A): A & SourceApp => {
    return Object.assign(app, { start })

    function start(scope?: PumpScope): SourcePump {
      const controller = new AbortController()
      const owningScope = scope ?? pumpScopeFrom(app)
      if (owningScope?.signal.aborted) controller.abort()
      else
        owningScope?.signal.addEventListener("abort", stop, {
          once: true,
          signal: controller.signal,
        })

      const iterable = typeof source === "function" ? source(app) : source
      const done = pump(iterable)
      return { done, stop, [Symbol.asyncDispose]: dispose }

      function stop(): void {
        controller.abort()
      }

      async function dispose(): Promise<void> {
        stop()
        await done
      }

      async function pump(iterable: AsyncIterable<Value>): Promise<void> {
        try {
          for await (const value of takeUntil(iterable, controller.signal)) {
            app.dispatch(toOp(value))
          }
        } finally {
          controller.abort()
        }
      }
    }
  }
}

function pumpScopeFrom(app: BaseApp): PumpScope | undefined {
  if (!("scope" in app) || !isPumpScope(app.scope)) return undefined
  return app.scope
}

function isPumpScope(value: unknown): value is PumpScope {
  if (typeof value !== "object" || value === null || !("signal" in value)) return false
  const { signal } = value
  return (
    typeof signal === "object" &&
    signal !== null &&
    "aborted" in signal &&
    typeof signal.aborted === "boolean" &&
    "addEventListener" in signal &&
    typeof signal.addEventListener === "function"
  )
}
