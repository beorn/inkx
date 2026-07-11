/**
 * withSlice contract tests — the declarative apply-chain state slice.
 *
 * Locks the four guarantees:
 *   - reduces state via handlers keyed by op.type,
 *   - PRESERVES effects from the `[state, effects]` tuple form,
 *   - notifies subscribers exactly once per real change (never on a no-op),
 *   - delegates unknown ops to the downstream chain (no throw).
 */

import { describe, expect, test } from "vitest"
import { createBaseApp } from "../src/runtime/base-app"
import { withSlice } from "../src/withSlice"
import type { Op } from "../src/types"

interface Counter {
  n: number
}

function counterApp() {
  return withSlice({
    name: "counter",
    initial: { n: 0 } as Counter,
    handlers: {
      inc: (s: Counter) => ({ n: s.n + 1 }),
      add: (s: Counter, op: { type: "add"; by: number }) => ({ n: s.n + op.by }),
      // Tuple form: state unchanged, but an effect must survive.
      save: (s: Counter) => [s, [{ type: "persist", n: s.n }]] as const,
      // No-op: returns the SAME reference — must not notify.
      touch: (s: Counter) => s,
    },
  })(createBaseApp())
}

describe("withSlice", () => {
  test("reduces state through handlers keyed by op.type", () => {
    const app = counterApp()
    app.dispatch({ type: "inc" })
    expect(app.counter.getState()).toEqual({ n: 1 })
    app.dispatch({ type: "add", by: 5 })
    expect(app.counter.getState()).toEqual({ n: 6 })
  })

  test("a bare-state handler is handled with no effects", () => {
    const app = counterApp()
    app.dispatch({ type: "inc" })
    expect(app.drainEffects()).toEqual([])
  })

  test("PRESERVES effects from the [state, effects] tuple form", () => {
    const app = counterApp()
    app.dispatch({ type: "add", by: 3 })
    app.dispatch({ type: "save" })
    expect(app.drainEffects()).toEqual([{ type: "persist", n: 3 }])
  })

  test("notifies subscribers exactly once per change", () => {
    const app = counterApp()
    let count = 0
    app.counter.subscribe(() => count++)
    app.dispatch({ type: "inc" })
    expect(count).toBe(1)
    app.dispatch({ type: "add", by: 2 })
    expect(count).toBe(2)
  })

  test("a no-op (same-reference) change does NOT notify", () => {
    const app = counterApp()
    let count = 0
    app.counter.subscribe(() => count++)
    app.dispatch({ type: "touch" })
    expect(count).toBe(0)
  })

  test("getState keeps a stable reference across a no-op", () => {
    const app = counterApp()
    const before = app.counter.getState()
    app.dispatch({ type: "touch" })
    expect(app.counter.getState()).toBe(before)
  })

  test("subscribe returns an unsubscribe function", () => {
    const app = counterApp()
    let count = 0
    const off = app.counter.subscribe(() => count++)
    app.dispatch({ type: "inc" })
    off()
    app.dispatch({ type: "inc" })
    expect(count).toBe(1)
    expect(app.counter.getState()).toEqual({ n: 2 })
  })

  test("delegates an unknown op to the downstream chain (no throw)", () => {
    const base = createBaseApp()
    const seen: string[] = []
    base.apply = (op: Op) => {
      seen.push(op.type)
      return false
    }
    const app = withSlice({
      name: "counter",
      initial: { n: 0 } as Counter,
      handlers: { inc: (s: Counter) => ({ n: s.n + 1 }) },
    })(base)

    expect(() => app.dispatch({ type: "unknown" })).not.toThrow()
    expect(seen).toEqual(["unknown"])
    // A handled op does NOT reach downstream.
    app.dispatch({ type: "inc" })
    expect(seen).toEqual(["unknown"])
  })

  test("effect-emitting handlers compose with the substrate dispatch drain", () => {
    // A `dispatch` effect from a slice re-enters the chain via the base drain.
    const app = withSlice({
      name: "flow",
      initial: { hits: [] as string[] },
      handlers: {
        start: (s: { hits: string[] }) =>
          [s, [{ type: "dispatch", op: { type: "land" } }]] as const,
        land: (s: { hits: string[] }) => ({ hits: [...s.hits, "landed"] }),
      },
    })(createBaseApp())
    app.dispatch({ type: "start" })
    expect(app.flow.getState().hits).toEqual(["landed"])
  })
})
