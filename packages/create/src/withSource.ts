/**
 * withSource — pump an AsyncIterable into the app as dispatched ops.
 *
 * bossi's `withSource` is the async-source → dispatch bridge: `for await (const
 * snapshot of procs.watch(app.scope, …)) app.dispatch({ type: "tick", snapshot })`.
 * The quit-path lesson from that code is load-bearing: the pump loop MUST end
 * when the owning scope dies, or the app hangs on exit. bossi achieves it by
 * threading `app.scope` into the watch generator; here the source is a generic
 * AsyncIterable that knows nothing about scopes, so `start(scope?)` wires the
 * scope's `AbortSignal` to loop termination via the substrate's `takeUntil`
 * helper (which races each `next()` against the abort and calls the iterator's
 * `return()` on the way out — a clean, no-throw shutdown).
 *
 * `start()` returns a {@link SourcePump}: an `AsyncDisposable` (so
 * `await using pump = app.start(scope)` ends the loop on scope exit), plus an
 * explicit `stop()` and a `done` promise that settles when the pump finishes
 * (source exhausted, scope aborted, or `stop()` called). Per-item dispatch
 * errors are logged and skipped so one bad item never kills the pump (matching
 * the runtime event loop); a throwing source rejects `done`.
 *
 * The `scope` parameter is structural (`{ signal: AbortSignal }`) so a
 * `@silvery/scope` `Scope` satisfies it without `@silvery/create` taking on a
 * dependency — but any `{ signal }` (e.g. `{ signal: controller.signal }`)
 * works too.
 *
 * @example
 * ```ts
 * const app = pipe(createBaseApp(), withSource(procs.watch(), (snap) => ({ type: "tick", snap })))
 * await using pump = app.start(scope) // stops when `scope` disposes
 * ```
 */

import type { Op } from "./types"
import type { BaseApp } from "./runtime/base-app"
import { takeUntil } from "./streams"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The minimal shape of an owning scope: anything carrying an `AbortSignal`
 * that fires on disposal. A `@silvery/scope` `Scope` satisfies this
 * structurally.
 */
export interface PumpScope {
  readonly signal: AbortSignal
}

/**
 * The handle returned by `start()`. Dispose it (`await using` /
 * `[Symbol.asyncDispose]`) or call `stop()` to end the pump; `done` settles
 * when the loop finishes.
 */
export interface SourcePump extends AsyncDisposable {
  /** End the pump loop. Idempotent. */
  stop(): void
  /**
   * Resolves when the pump loop finishes (source exhausted, scope aborted, or
   * `stop()` called). Rejects if the source iterator itself throws.
   */
  readonly done: Promise<void>
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

/**
 * Install a source pump. Assigns `app.start(scope?)`, which begins pumping
 * `source` items through `toOp` into `app.dispatch`. See the module docstring
 * for the shutdown contract.
 */
export function withSource<T>(
  source: AsyncIterable<T>,
  toOp: (item: T) => Op,
): <A extends BaseApp>(app: A) => A & { start(scope?: PumpScope): SourcePump } {
  return <A extends BaseApp>(app: A): A & { start(scope?: PumpScope): SourcePump } => {
    const start = (scope?: PumpScope): SourcePump => {
      const controller = new AbortController()
      // The owning scope's disposal (signal abort) ends the pump.
      if (scope) {
        if (scope.signal.aborted) {
          controller.abort()
        } else {
          scope.signal.addEventListener("abort", () => controller.abort(), { once: true })
        }
      }

      const done = (async () => {
        for await (const item of takeUntil(source, controller.signal)) {
          try {
            app.dispatch(toOp(item))
          } catch (err) {
            // One bad item must not kill the pump (matches the event loop).
            // eslint-disable-next-line no-console
            console.error("[withSource] dispatch threw for a source item", err)
          }
        }
      })()

      return {
        stop() {
          controller.abort()
        },
        done,
        async [Symbol.asyncDispose]() {
          controller.abort()
          await done
        },
      }
    }

    return Object.assign(app, { start })
  }
}
