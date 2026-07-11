/**
 * withRunners — an effect-runner plugin for the apply-chain substrate.
 *
 * The apply-chain base (`createBaseApp`) interprets exactly one effect:
 * `{type:"dispatch"}` re-enters the chain. Every other effect emitted by a
 * plugin bubbles out of `dispatch()` and waits in the pending queue for
 * `drainEffects()` — "whichever runner is driving" must pull and interpret
 * them. Historically each app hand-built that runner (bossi's `withControl`
 * drains `app.drainEffects()` after each dispatch and routes `control.kill`
 * to `procs.kill`). `tea()` already ships the ergonomic form of this — a
 * runner map keyed by effect `type` — but only for the Zustand substrate; it
 * cannot ride `pipe(createBaseApp(), …)`.
 *
 * `withRunners` ports that runner-map ergonomics onto the apply chain. It
 * wraps `dispatch`: after the inner chain settles, it drains the effects the
 * inner layer produced and routes each one whose `type` has a runner. Effects
 * WITHOUT a matching runner are passed through untouched — re-exposed via this
 * plugin's own `drainEffects()` so the plugin COMPOSES with:
 *
 *   - an outer consumer (e.g. the runtime event loop, which drains
 *     `app.drainEffects()` and routes `render` / `exit` / `suspend` itself,
 *     and hands anything else to `onOtherEffect`), and
 *   - other stacked `withRunners` instances (an outer one routes what an
 *     inner one didn't).
 *
 * Runners are fired but not awaited (matching `tea()`); an async runner that
 * needs to feed a result back into the app calls the injected `dispatch`
 * (Elm's `Cmd Msg` round-trip), which re-enters from the top of the chain.
 *
 * @example
 * ```ts
 * const app = pipe(
 *   createBaseApp(),
 *   withSlice({ name: "control", initial, handlers }), // emits {type:"kill"}
 *   withRunners({
 *     kill: (effect, dispatch) => {
 *       procs.kill(effect.pid)
 *       dispatch({ type: "killed", pid: effect.pid })
 *     },
 *   }),
 * )
 * app.dispatch({ type: "requestKill", pid: 42 })
 * // → slice emits {type:"kill",pid:42}; the runner fires; {type:"render"}
 * //   (unmatched) is left for app.drainEffects().
 * ```
 */

import type { Effect, Op } from "./types"
import type { BaseApp } from "./runtime/base-app"

// ---------------------------------------------------------------------------
// Types — the runner map, keyed by effect type (ported from tea())
// ---------------------------------------------------------------------------

/**
 * A single effect runner. Receives the effect and a `dispatch` for round-trip
 * communication (Elm's `Cmd Msg`). May be sync or async; the return value is
 * not awaited by the chain.
 */
export type EffectRunner<E extends Effect, O extends Op = Op> = (
  effect: E,
  dispatch: (op: O) => void,
) => void | Promise<void>

/**
 * Effect runners keyed by effect `type`. Typed by the effect union so each
 * runner receives the narrowed effect variant — the same ergonomics `tea()`
 * offers on the Zustand substrate.
 */
export type RunnerMap<E extends Effect = Effect, O extends Op = Op> = {
  [K in E["type"]]?: EffectRunner<Extract<E, { type: K }>, O>
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

/**
 * Install an effect runner over the apply chain.
 *
 * Wraps `app.dispatch`: runs the inner chain, drains the effects it produced,
 * routes each effect with a matching runner, and re-exposes the rest through
 * an overridden `app.drainEffects()`. See the module docstring for the
 * composition contract.
 */
export function withRunners<A extends BaseApp, E extends Effect = Effect, O extends Op = Op>(
  runners: RunnerMap<E, O>,
): (app: A) => A {
  return (app: A): A => {
    const prevDispatch = app.dispatch.bind(app)
    const prevDrain = app.drainEffects.bind(app)

    // Effects the inner chain produced that no runner claimed — buffered so an
    // outer consumer (or a stacked withRunners) still sees them via drainEffects().
    let passthrough: Effect[] = []

    // Late-bound so re-dispatch always re-enters from the current outermost
    // dispatch (an outer withRunners installed later still wraps us).
    const redispatch = (op: O): void => {
      app.dispatch(op as unknown as Op)
    }

    app.dispatch = (op: Op): void => {
      prevDispatch(op)
      for (const effect of prevDrain()) {
        const runner = (runners as Record<string, EffectRunner<Effect, O> | undefined>)[effect.type]
        if (!runner) {
          passthrough.push(effect)
          continue
        }
        try {
          const result = runner(effect, redispatch)
          if (result && typeof (result as Promise<void>).then === "function") {
            ;(result as Promise<void>).catch((err) => {
              // eslint-disable-next-line no-console
              console.error(`[withRunners] async runner for "${effect.type}" rejected`, err)
            })
          }
        } catch (err) {
          // Surface, but don't abort the drain for one bad runner.
          // eslint-disable-next-line no-console
          console.error(`[withRunners] runner for "${effect.type}" threw`, err)
        }
      }
    }

    app.drainEffects = (): Effect[] => {
      if (passthrough.length === 0) return []
      const out = passthrough
      passthrough = []
      return out
    }

    return app
  }
}
