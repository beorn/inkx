/**
 * BaseApp contract tests — lock in the apply-chain semantics.
 *
 * These tests mirror the v1r prototype's invariants:
 *   - base apply returns false (nothing handled)
 *   - reentrant dispatch throws
 *   - Effect[] = handled channel
 *   - dispatch-effects re-enter via the queue, not via nested dispatch()
 *   - non-dispatch effects bubble up to the runner via drainEffects()
 *
 * Plugins use the capture-and-override idiom directly:
 *   const prev = app.apply
 *   app.apply = (op) => { ...; return prev(op) }
 */

import React from "react"
import { describe, expect, test, vi } from "vitest"
import { Text } from "silvery"
import { createRenderer } from "@silvery/test"
import {
  createBaseApp,
  useSlice,
  withRunners,
  withSlice,
  withSource,
  type BaseApp,
  type SliceHandlers,
  type SourceInput,
} from "../src"
import type { ApplyResult, Effect, Op } from "../src/types"

describe("createBaseApp", () => {
  test("base apply returns false (nothing handled)", () => {
    const app = createBaseApp()
    expect(app.apply({ type: "whatever" })).toBe(false)
  })

  test("dispatch on unhandled op leaves drainEffects empty", () => {
    const app = createBaseApp()
    app.dispatch({ type: "noop" })
    expect(app.drainEffects()).toEqual([])
  })

  test("plugin can handle an op and emit runner effects", () => {
    const app = createBaseApp()
    const prev = app.apply
    app.apply = (op) => {
      if (op.type === "ping") return [{ type: "render" }]
      return prev(op)
    }
    app.dispatch({ type: "ping" })
    expect(app.drainEffects()).toEqual([{ type: "render" }])
  })

  test("drainEffects clears the pending queue", () => {
    const app = createBaseApp()
    app.apply = () => [{ type: "render" }]
    app.dispatch({ type: "x" })
    expect(app.drainEffects()).toHaveLength(1)
    expect(app.drainEffects()).toEqual([])
  })

  test("reentrant dispatch throws", () => {
    const app = createBaseApp()
    app.apply = (op) => {
      if (op.type === "outer") {
        // Direct re-entry is forbidden — must use a dispatch effect instead.
        app.dispatch({ type: "inner" })
        return []
      }
      return false
    }
    expect(() => app.dispatch({ type: "outer" })).toThrow(/Reentrant dispatch/)
  })

  test("dispatch effect re-enters the chain via the drain queue", () => {
    const app = createBaseApp()
    const seen: string[] = []
    const prev = app.apply
    app.apply = (op) => {
      seen.push(op.type)
      if (op.type === "a") {
        return [{ type: "dispatch", op: { type: "b" } } as Effect]
      }
      return prev(op)
    }
    app.dispatch({ type: "a" })
    expect(seen).toEqual(["a", "b"])
  })

  test("plugin ordering — last plugin wraps outermost (runs first)", () => {
    const app = createBaseApp()
    const order: string[] = []
    const innerPrev = app.apply
    app.apply = (op) => {
      order.push("inner")
      return innerPrev(op)
    }
    const outerPrev = app.apply
    app.apply = (op) => {
      order.push("outer")
      return outerPrev(op)
    }
    app.dispatch({ type: "x" })
    expect(order).toEqual(["outer", "inner"])
  })

  test("handled (empty effects) short-circuits downstream plugins", () => {
    const app = createBaseApp()
    let innerRan = false
    const innerPrev = app.apply
    app.apply = (op) => {
      innerRan = true
      return innerPrev(op)
    }
    const outerPrev = app.apply
    app.apply = (op): ApplyResult => {
      // outer handles everything with empty effects — inner should never run
      void outerPrev
      void op
      return []
    }
    app.dispatch({ type: "consumed" })
    expect(innerRan).toBe(false)
  })

  test("unhandled pass-through — inner plugin runs when outer returns false", () => {
    const app = createBaseApp()
    let innerRan = false
    const innerPrev = app.apply
    app.apply = (op) => {
      if (op.type === "inner-only") {
        innerRan = true
        return []
      }
      return innerPrev(op)
    }
    const outerPrev = app.apply
    app.apply = (op) => outerPrev(op) // pure pass-through
    app.dispatch({ type: "inner-only" })
    expect(innerRan).toBe(true)
  })

  test("runner effects accumulate across multiple dispatches", () => {
    const app = createBaseApp()
    app.apply = (op) => {
      if (op.type === "paint") return [{ type: "render" }]
      return false
    }
    app.dispatch({ type: "paint" })
    app.dispatch({ type: "paint" })
    expect(app.drainEffects()).toEqual([{ type: "render" }, { type: "render" }])
  })

  test("dispatch-effect chain A→B→C via queue, runner effects bubble up", () => {
    const app = createBaseApp()
    const seen: string[] = []
    app.apply = (op) => {
      seen.push(op.type)
      if (op.type === "a") return [{ type: "dispatch", op: { type: "b" } } as Effect]
      if (op.type === "b")
        return [{ type: "dispatch", op: { type: "c" } } as Effect, { type: "render" }]
      if (op.type === "c") return [{ type: "exit" }]
      return false
    }
    app.dispatch({ type: "a" })
    expect(seen).toEqual(["a", "b", "c"])
    // Non-dispatch effects (render, exit) bubble up to the runner:
    expect(app.drainEffects()).toEqual([{ type: "render" }, { type: "exit" }])
  })

  test("malformed dispatch-effect (no `op`) is silently dropped", () => {
    const app = createBaseApp()
    app.apply = (op) => {
      if (op.type === "a") return [{ type: "dispatch" } as Effect]
      return false
    }
    expect(() => app.dispatch({ type: "a" })).not.toThrow()
    expect(app.drainEffects()).toEqual([])
  })
})

describe("plugin idiom", () => {
  test("captured prev is the base apply, not the wrapper (no infinite recursion)", () => {
    // Regression check: if a plugin accidentally writes `app.apply(op)` instead
    // of the captured `prev(op)`, it infinite-loops. Capturing into a local
    // const prevents that; this test verifies the captured reference is the
    // pre-wrap apply.
    const app = createBaseApp()
    let capturedPrev: ((op: Op) => ApplyResult) | null = null
    const prev = app.apply
    app.apply = (op) => {
      capturedPrev = prev
      return prev(op)
    }
    app.dispatch({ type: "any" })
    expect(capturedPrev).not.toBeNull()
    // The captured prev should refer to the base apply (returns false).
    expect(capturedPrev!({ type: "any" })).toBe(false)
  })
})

describe("withRunners", () => {
  type RunnerEffect = { type: "record"; value: string } | { type: "round-trip"; op: Op }

  test("routes drained effects by type in emission order and preserves unmatched effects", () => {
    const app = createBaseApp()
    app.apply = (op) =>
      op.type === "run"
        ? [
            { type: "record", value: "first" },
            { type: "unmatched", value: "middle" },
            { type: "record", value: "last" },
          ]
        : false

    const seen: string[] = []
    const enhanced = withRunners<RunnerEffect>({
      record(effect) {
        seen.push(effect.value)
      },
    })(app)

    enhanced.dispatch({ type: "run" })

    expect(seen).toEqual(["first", "last"])
    expect(enhanced.drainEffects()).toEqual([{ type: "unmatched", value: "middle" }])
  })

  test("runner dispatch callback re-enters the completed app chain", () => {
    const app = createBaseApp()
    const applied: string[] = []
    app.apply = (op) => {
      applied.push(op.type)
      if (op.type === "outer") return [{ type: "round-trip", op: { type: "inner" } }]
      return []
    }
    const enhanced = withRunners<RunnerEffect>({
      "round-trip"(effect, dispatch) {
        dispatch(effect.op)
      },
    })(app)

    enhanced.dispatch({ type: "outer" })

    expect(applied).toEqual(["outer", "inner"])
  })

  test("runner receives the composed app so it can read slice state and capabilities", () => {
    const app = withSlice({
      name: "latest",
      initial: "before",
      handlers: {
        run: () => ["after", [{ type: "record", value: "seen" }]] as const,
      },
    })(createBaseApp())
    let stateSeenByRunner: string | undefined

    const enhanced = withRunners<RunnerEffect, typeof app>({
      record(_effect, _dispatch, composedApp) {
        stateSeenByRunner = composedApp.latest.getState()
      },
    })(app)

    enhanced.dispatch({ type: "run" })

    expect(stateSeenByRunner).toBe("after")
  })
})

describe("withSlice", () => {
  interface CounterState {
    count: number
  }

  type CounterOp = { type: "increment"; by: number } | { type: "unchanged" }

  const handlers = {
    increment(state: CounterState, op: Extract<CounterOp, { type: "increment" }>) {
      const count = state.count + op.by
      return [{ count }, [{ type: "count.changed", count }]] as const
    },
    unchanged(state: CounterState) {
      return [state, []] as const
    },
  } satisfies SliceHandlers<CounterState, CounterOp>

  function createCounterApp(): BaseApp & {
    counter: {
      getState(): CounterState
      subscribe(listener: () => void): () => void
    }
  } {
    return withSlice<"counter", CounterState, CounterOp>({
      name: "counter",
      initial: { count: 0 },
      handlers,
    })(createBaseApp())
  }

  test("routes by op.type, preserves [state, effects], and notifies only for changed state", () => {
    const base = createBaseApp()
    base.apply = (op) => (op.type === "increment" ? [{ type: "downstream" }] : false)
    const app = withSlice<"counter", CounterState, CounterOp>({
      name: "counter",
      initial: { count: 0 },
      handlers,
    })(base)
    const listener = vi.fn()
    const unsubscribe = app.counter.subscribe(listener)

    app.dispatch({ type: "increment", by: 2 })
    expect(app.counter.getState()).toEqual({ count: 2 })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(app.drainEffects()).toEqual([
      { type: "count.changed", count: 2 },
      { type: "downstream" },
    ])

    app.dispatch({ type: "unchanged" })
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  test("stacked slices keep separate handles and both receive a shared op", () => {
    const app = withSlice({
      name: "parity",
      initial: "even",
      handlers: {
        increment: (state: string) => [state === "even" ? "odd" : "even", []] as const,
      },
    })(createCounterApp())

    app.dispatch({ type: "increment", by: 1 })

    expect(app.counter.getState()).toEqual({ count: 1 })
    expect(app.parity.getState()).toBe("odd")
  })

  test("useSlice is the React binding over getState/subscribe", () => {
    const slice = createCounterApp()

    function Counter() {
      const state = useSlice(slice.counter)
      return React.createElement(Text, null, String(state.count))
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    const element = React.createElement(Counter)
    const view = render(element)
    expect(view.text).toContain("0")

    slice.dispatch({ type: "increment", by: 3 })
    // createRenderer does not flush external-store updates automatically;
    // rerender mirrors the established hook contract tests.
    view.rerender(element)
    expect(view.text).toContain("3")
  })
})

describe("withSource", () => {
  test("pumps async-iterable values through dispatch in source order", async () => {
    async function* values() {
      yield 1
      yield 2
      yield 3
    }

    const received: number[] = []
    const base = createBaseApp()
    base.apply = (op) => {
      if (op.type === "value") received.push(op.value as number)
      return []
    }
    const app = withSource(values(), (value) => ({ type: "value", value }))(base)

    const start = app.start
    await start().done

    expect(received).toEqual([1, 2, 3])
  })

  test("stops pumping when the owning scope is disposed", async () => {
    async function* values() {
      yield 1
      yield 2
      yield 3
    }

    const controller = new AbortController()
    const received: number[] = []
    const base = createBaseApp()
    base.apply = (op) => {
      if (op.type === "value") {
        const value = op.value as number
        received.push(value)
        if (value === 2) controller.abort()
      }
      return []
    }
    const app = withSource(values(), (value) => ({ type: "value", value }))(base)

    const pump = app.start({ signal: controller.signal })
    await pump.done

    expect(received).toEqual([1, 2])
    expect(typeof pump.stop).toBe("function")
    expect(typeof pump[Symbol.asyncDispose]).toBe("function")
  })

  test("constructs a source from the composed app and defaults to its owning scope", async () => {
    const controller = new AbortController()
    const received: string[] = []
    const base = Object.assign(createBaseApp(), {
      scope: { signal: controller.signal },
      sourceLabel: "from-app",
    })
    base.apply = (op) => {
      if (op.type === "value") {
        received.push(op.value as string)
        controller.abort()
      }
      return []
    }
    const source: SourceInput<string, typeof base> = vi.fn(async function* (app: typeof base) {
      yield app.sourceLabel
      yield "after-dispose"
    })
    const app = withSource(source, (value) => ({ type: "value", value }))(base)

    await app.start().done

    expect(source).toHaveBeenCalledWith(app)
    expect(received).toEqual(["from-app"])
  })
})
