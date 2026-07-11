/**
 * App primitives for the apply-chain substrate.
 *
 * These are deliberately small plugins over {@link BaseApp}: effects route by
 * discriminator, state rides the existing apply chain, React observes the
 * resulting store, and async sources only pump values into dispatch.
 */

import { useSyncExternalStore } from "react"
import type { BaseApp } from "./runtime/base-app"
import type { Effect, Op } from "./types"

export type EffectRunnerMap<E extends Effect = Effect> = {
  [K in E["type"]]?: (effect: Extract<E, { type: K }>, dispatch: (op: Op) => void) => void
}

/** Route effects drained after dispatch to handlers keyed by `effect.type`. */
export function withRunners<E extends Effect = Effect>(runners: EffectRunnerMap<E>) {
  return <A extends BaseApp>(app: A): A => {
    const { dispatch, drainEffects } = app
    const pending: Effect[] = []
    app.dispatch = run
    app.drainEffects = drain
    return app

    function run(op: Op): void {
      dispatch(op)
      for (const effect of drainEffects()) {
        const runner = runners[effect.type as E["type"]] as
          | ((effect: E, dispatch: (op: Op) => void) => void)
          | undefined
        if (runner) runner(effect as E, app.dispatch)
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

export interface SliceStore<State> {
  getState(): State
  subscribe(listener: () => void): () => void
}

/** Add a state slice whose handlers are selected by `op.type`. */
export function withSlice<State, Operation extends Op = Op>(
  initialState: State,
  handlers: SliceHandlers<State, Operation>,
) {
  return <A extends BaseApp>(app: A): A & SliceStore<State> => {
    let state = initialState
    const listeners = new Set<() => void>()
    const { apply } = app
    app.apply = applySlice
    return Object.assign(app, { getState, subscribe })

    function applySlice(op: Op) {
      const handler = handlers[op.type] as SliceHandler<State, Op> | undefined
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

/** Read a {@link SliceStore} from React with stable snapshot semantics. */
export function useSlice<State>(slice: SliceStore<State>): State {
  return useSyncExternalStore(slice.subscribe, slice.getState, slice.getState)
}

export interface SourcePump {
  start(): Promise<void>
}

/** Pump an async iterable into the app's dispatch chain in source order. */
export function withSource<Value>(source: AsyncIterable<Value>, toOp: (value: Value) => Op) {
  return <A extends BaseApp>(app: A): A & SourcePump => {
    return Object.assign(app, { start })

    async function start(): Promise<void> {
      for await (const value of source) app.dispatch(toOp(value))
    }
  }
}
