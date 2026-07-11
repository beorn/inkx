/**
 * withRunners contract tests — the apply-chain effect runner.
 *
 * Locks the three composition guarantees from the design ruling:
 *   - routes effects whose type has a runner (with a re-dispatch callback),
 *   - passes UNKNOWN effects through untouched (re-exposed via drainEffects),
 *   - stacks: an outer withRunners routes what an inner one didn't.
 */

import { describe, expect, test, vi } from "vitest"
import { createBaseApp } from "../src/runtime/base-app"
import { withRunners } from "../src/withRunners"
import type { Effect, Op } from "../src/types"

/** A base whose apply emits the given effects for `type: "go"`. */
function baseEmitting(effects: Effect[]) {
  const app = createBaseApp()
  app.apply = (op: Op) => (op.type === "go" ? effects : false)
  return app
}

describe("withRunners", () => {
  test("routes an effect whose type has a runner", () => {
    const seen: Effect[] = []
    const app = withRunners({ domain: (eff) => seen.push(eff) })(
      baseEmitting([{ type: "domain", n: 1 }]),
    )
    app.dispatch({ type: "go" })
    expect(seen).toEqual([{ type: "domain", n: 1 }])
  })

  test("passes an unmatched effect through to drainEffects", () => {
    const app = withRunners({ domain: () => {} })(
      baseEmitting([{ type: "domain", n: 1 }, { type: "render" }]),
    )
    app.dispatch({ type: "go" })
    // `domain` was routed; `render` (no runner) is left for the outer consumer.
    expect(app.drainEffects()).toEqual([{ type: "render" }])
  })

  test("with no runner installed, every effect passes through", () => {
    const app = withRunners({})(baseEmitting([{ type: "render" }, { type: "exit" }]))
    app.dispatch({ type: "go" })
    expect(app.drainEffects()).toEqual([{ type: "render" }, { type: "exit" }])
  })

  test("drainEffects clears the passthrough buffer", () => {
    const app = withRunners({})(baseEmitting([{ type: "render" }]))
    app.dispatch({ type: "go" })
    expect(app.drainEffects()).toEqual([{ type: "render" }])
    expect(app.drainEffects()).toEqual([])
  })

  test("runner receives a dispatch callback and can re-dispatch (Cmd Msg)", () => {
    const app = createBaseApp()
    app.apply = (op: Op) => {
      if (op.type === "go") return [{ type: "domain" }]
      if (op.type === "next") return [{ type: "render" }]
      return false
    }
    const wired = withRunners({ domain: (_eff, dispatch) => dispatch({ type: "next" }) })(app)
    wired.dispatch({ type: "go" })
    // The runner re-dispatched "next"; its render effect bubbled through.
    expect(wired.drainEffects()).toEqual([{ type: "render" }])
  })

  test("stacks: outer withRunners routes what the inner one didn't", () => {
    const app = createBaseApp()
    app.apply = (op: Op) =>
      op.type === "go" ? [{ type: "a" }, { type: "b" }, { type: "c" }] : false
    const seenA: Effect[] = []
    const seenB: Effect[] = []
    const stacked = withRunners({ b: (e) => seenB.push(e) })(
      withRunners({ a: (e) => seenA.push(e) })(app),
    )
    stacked.dispatch({ type: "go" })
    expect(seenA).toEqual([{ type: "a" }])
    expect(seenB).toEqual([{ type: "b" }])
    // `c` matched neither runner — bubbles to the outermost drainEffects.
    expect(stacked.drainEffects()).toEqual([{ type: "c" }])
  })

  test("effects accumulate across dispatches until drained", () => {
    const app = withRunners({})(baseEmitting([{ type: "render" }]))
    app.dispatch({ type: "go" })
    app.dispatch({ type: "go" })
    expect(app.drainEffects()).toEqual([{ type: "render" }, { type: "render" }])
  })

  test("a throwing runner is surfaced but does not abort the drain", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const seen: Effect[] = []
    const app = withRunners({
      bad: () => {
        throw new Error("boom")
      },
      good: (e) => seen.push(e),
    })(baseEmitting([{ type: "bad" }, { type: "good" }]))
    expect(() => app.dispatch({ type: "go" })).not.toThrow()
    expect(seen).toEqual([{ type: "good" }])
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  test("an async runner rejection is caught (no unhandled rejection)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const app = withRunners({
      domain: async () => {
        throw new Error("async boom")
      },
    })(baseEmitting([{ type: "domain" }]))
    app.dispatch({ type: "go" })
    await Promise.resolve()
    await Promise.resolve()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
