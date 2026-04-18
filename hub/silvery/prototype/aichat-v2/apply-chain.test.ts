/**
 * Apply-chain validation tests for aichat-v2.
 *
 * Validates the TEA Phase 2 substrate contract (Op / Effect / ApplyResult,
 * BaseApp dispatch+drain, with*Chain plugin pattern) end-to-end on a
 * real app (aichat-v2). The goal: prove the design from
 * `app-composition.md` + `vendor/silvery/packages/create/src/runtime/*`
 * handles a non-trivial app before rolling out to km-tui.
 *
 * These tests intentionally do NOT import from `@silvery/create/runtime/*`.
 * The real substrate lives on the `feat/tea-apply-chain-types` branch and
 * has not yet merged to silvery's main. To unblock the spike, we inline
 * a minimal implementation of the substrate contract here — if this
 * passes, the substrate API shape is correct for aichat-v2. When Phase 2
 * merges, swap the inline substrate for real imports in a one-line PR.
 *
 * Substrate contract tested (mirrors base-app.ts, types.ts):
 *   - Op: `{ type: string; [k: string]: unknown }`
 *   - Effect: `{ type: string; [k: string]: unknown }`
 *   - ApplyResult: `false | Effect[]`
 *   - `createBaseApp()` → { dispatch, apply, drainEffects }
 *   - plugin idiom: capture `app.apply`, override, delegate via `prev(op)`
 *   - effect drain: dispatch-type effects re-enter; others bubble to runner
 *   - reentry guard: throws on reentrant dispatch()
 */

import { describe, expect, test } from "vitest"
import { createChatModel, withChat } from "./app.js"
import { pipe, create, withScope, withCommands } from "./shims/app.js"
import { createInstantScope } from "./shims/scope.js"
import { createClock } from "./shims/clock.js"
import { RANDOM_AGENT_RESPONSES } from "../../../../vendor/silvery/examples/apps/aichat/script.ts"

// ============================================================================
// Inline substrate — mirrors vendor/silvery/packages/create/src/runtime/*
// on feat/tea-apply-chain-types. Swap for real imports when that lands.
// ============================================================================

type Op = { type: string; [key: string]: unknown }
type Effect = { type: string; [key: string]: unknown }
type ApplyResult = false | Effect[]
type Apply = (op: Op) => ApplyResult

interface BaseApp {
  dispatch(op: Op): void
  apply: Apply
  drainEffects(): Effect[]
}

function createBaseApp(): BaseApp {
  let dispatching = false
  let draining = false
  const effectQueue: Effect[] = []
  const pendingRunnerEffects: Effect[] = []

  const app: BaseApp = {
    dispatch(op) {
      if (dispatching) throw new Error(`Reentrant dispatch: ${op.type}`)
      dispatching = true
      try {
        const result = app.apply(op)
        if (result !== false) effectQueue.push(...result)
      } finally {
        dispatching = false
      }
      if (draining) return
      draining = true
      try {
        while (effectQueue.length > 0) {
          const batch = effectQueue.splice(0)
          for (const eff of batch) {
            if (eff.type === "dispatch") {
              const nested = (eff as { op?: Op }).op
              if (!nested || typeof nested.type !== "string") continue
              dispatching = true
              try {
                const nestedResult = app.apply(nested)
                if (nestedResult !== false) effectQueue.push(...nestedResult)
              } finally {
                dispatching = false
              }
            } else {
              pendingRunnerEffects.push(eff)
            }
          }
        }
      } finally {
        draining = false
      }
    },
    apply() {
      return false
    },
    drainEffects() {
      if (pendingRunnerEffects.length === 0) return []
      return pendingRunnerEffects.splice(0)
    },
  }
  return app
}

/** Mirrors withInputChain on feat/tea-apply-chain-types. */
interface KeyShape {
  ctrl?: boolean
  shift?: boolean
  meta?: boolean
  super?: boolean
  alt?: boolean
  eventType?: "press" | "repeat" | "release"
}
type InputHandler = (input: string, key: KeyShape) => void | "exit"
interface InputStore {
  readonly handlers: ReadonlyArray<{ handler: InputHandler; active: boolean }>
  register(h: InputHandler, active?: boolean): () => void
}

function withInputChain<A extends BaseApp>(app: A): A & { input: InputStore } {
  const entries: { handler: InputHandler; active: boolean }[] = []
  const store: InputStore = {
    handlers: entries,
    register(handler, active = true) {
      const entry = { handler, active }
      entries.push(entry)
      return () => {
        const i = entries.indexOf(entry)
        if (i >= 0) entries.splice(i, 1)
      }
    },
  }
  const prev = app.apply
  app.apply = (op: Op): ApplyResult => {
    if (op.type !== "input:key") return prev(op)
    const input = (op.input as string) ?? ""
    const key = (op.key as KeyShape) ?? {}
    if (key.eventType === "release") return prev(op)
    let hasActive = false
    const effects: Effect[] = []
    for (const { handler, active } of entries) {
      if (!active) continue
      hasActive = true
      const result = handler(input, key)
      if (result === "exit") {
        effects.push({ type: "exit" })
        return effects
      }
    }
    return hasActive ? effects : prev(op)
  }
  return Object.assign(app, { input: store })
}

// ============================================================================
// Apply-chain contract tests — substrate design validation
// ============================================================================

describe("BaseApp contract", () => {
  test("base apply returns false (nothing handled)", () => {
    const app = createBaseApp()
    expect(app.apply({ type: "whatever" })).toBe(false)
  })

  test("dispatch on unhandled op leaves drainEffects empty", () => {
    const app = createBaseApp()
    app.dispatch({ type: "noop" })
    expect(app.drainEffects()).toEqual([])
  })

  test("plugin handles op and emits runner effects", () => {
    const app = createBaseApp()
    const prev = app.apply
    app.apply = (op) => (op.type === "ping" ? [{ type: "render" }] : prev(op))
    app.dispatch({ type: "ping" })
    expect(app.drainEffects()).toEqual([{ type: "render" }])
  })

  test("drainEffects clears the queue", () => {
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
        app.dispatch({ type: "inner" })
        return []
      }
      return false
    }
    expect(() => app.dispatch({ type: "outer" })).toThrow(/Reentrant dispatch/)
  })

  test("dispatch-effect re-enters via the drain queue", () => {
    const app = createBaseApp()
    const seen: string[] = []
    const prev = app.apply
    app.apply = (op) => {
      seen.push(op.type)
      if (op.type === "a") return [{ type: "dispatch", op: { type: "b" } }]
      return prev(op)
    }
    app.dispatch({ type: "a" })
    expect(seen).toEqual(["a", "b"])
  })

  test("plugin ordering — last wrapper runs first", () => {
    const app = createBaseApp()
    const order: string[] = []
    const base = app.apply
    app.apply = (op) => {
      order.push("inner")
      return base(op)
    }
    const inner = app.apply
    app.apply = (op) => {
      order.push("outer")
      return inner(op)
    }
    app.dispatch({ type: "x" })
    expect(order).toEqual(["outer", "inner"])
  })
})

// ============================================================================
// Apply-chain + chat-model integration — validates the substrate
// handles a real app's ops/effects end-to-end.
// ============================================================================

function testAI(response = RANDOM_AGENT_RESPONSES[0]!) {
  return {
    async *generateResponse() {
      for (const word of response.content.split(/(\s+)/)) yield { type: "text-delta" as const, text: word }
      yield { type: "done" as const, tokens: response.tokens }
    },
  }
}

describe("apply-chain integration with chat model", () => {
  test("chat model operates independently of apply chain (pure domain)", () => {
    // The chat model has zero knowledge of ops/effects — it's pure state.
    // The apply chain converts Ops → model mutations → Effects.
    const scope = createInstantScope()
    const chat = createChatModel({
      ai: testAI(),
      scope,
      clock: createClock(scope),
      onExit: () => {},
    })
    expect(chat.messages()).toHaveLength(1) // initial system message
    chat.submit("hello")
    expect(chat.messages().filter((m) => m.role === "user")).toHaveLength(1)
  })

  test("withInputChain dispatches key ops → chat.submit via handler", () => {
    const scope = createInstantScope()
    const chat = createChatModel({
      ai: testAI(),
      scope,
      clock: createClock(scope),
      onExit: () => {},
    })
    const app = withInputChain(createBaseApp())

    let submittedContent: string | null = null
    app.input.register((input) => {
      if (input === "enter") {
        chat.submit("hello from key handler")
        submittedContent = "hello from key handler"
      }
    })

    app.dispatch({ type: "input:key", input: "enter", key: { eventType: "press" } })
    expect(submittedContent).toBe("hello from key handler")
    expect(chat.messages().filter((m) => m.role === "user").map((m) => m.content)).toContain(
      "hello from key handler",
    )
    // No runner effects for a no-op handler — but the chain was engaged.
    expect(app.drainEffects()).toEqual([])
  })

  test("handler returns 'exit' → substrate emits exit effect → runner sees it", () => {
    const app = withInputChain(createBaseApp())
    app.input.register((input, key) => {
      if (input === "c" && key.ctrl) return "exit"
    })

    app.dispatch({ type: "input:key", input: "c", key: { ctrl: true, eventType: "press" } })
    expect(app.drainEffects()).toEqual([{ type: "exit" }])
  })

  test("release events pass through the chain without firing handlers", () => {
    const app = withInputChain(createBaseApp())
    let fired = false
    app.input.register(() => {
      fired = true
    })
    app.dispatch({ type: "input:key", input: "j", key: { eventType: "release" } })
    expect(fired).toBe(false)
    expect(app.drainEffects()).toEqual([])
  })

  test("multi-handler ordering — registration order determines apply order", () => {
    const app = withInputChain(createBaseApp())
    const seen: string[] = []
    app.input.register(() => {
      seen.push("first")
    })
    app.input.register(() => {
      seen.push("second")
    })
    app.dispatch({ type: "input:key", input: "x", key: { eventType: "press" } })
    expect(seen).toEqual(["first", "second"])
  })

  test("full app composition — chat + commands + input chain", () => {
    // Builds a headless app that mirrors production composition:
    //   chat model → withChat (commands) → withInputChain (keys → commands)
    // Then dispatches a key, routes through commands, mutates the model.
    const scope = createInstantScope()
    const chat = createChatModel({
      ai: testAI(),
      scope,
      clock: createClock(scope),
      onExit: () => {},
    })
    const domainApp = pipe(
      create(),
      withScope(createInstantScope()),
      withCommands(),
      withChat({ chat }),
    )

    // Now layer the runtime apply chain on top.
    const runtimeApp = withInputChain(createBaseApp())
    runtimeApp.input.register((input) => {
      if (input === "enter") {
        domainApp.commands.chat.submit.fn({ content: "via apply chain" })
      }
    })

    expect(domainApp.chat.messages().filter((m) => m.role === "user")).toHaveLength(0)
    runtimeApp.dispatch({ type: "input:key", input: "enter", key: { eventType: "press" } })
    const userMsgs = domainApp.chat.messages().filter((m) => m.role === "user")
    expect(userMsgs).toHaveLength(1)
    expect(userMsgs[0]!.content).toBe("via apply chain")
  })

  test("effects are plain data (JSON-serializable)", () => {
    // This is why effects-as-data matters: replay, persistence, IPC.
    const app = withInputChain(createBaseApp())
    app.input.register((input) => (input === "q" ? "exit" : undefined))
    app.dispatch({ type: "input:key", input: "q", key: { eventType: "press" } })
    const effects = app.drainEffects()
    expect(JSON.parse(JSON.stringify(effects))).toEqual(effects)
  })

  test("ops are plain data (JSON-serializable) — enables replay", () => {
    const recorded: Op[] = []
    const app = createBaseApp()
    const orig = app.dispatch
    app.dispatch = (op) => {
      recorded.push(op)
      orig(op)
    }
    const input = withInputChain(app)
    let count = 0
    input.input.register(() => {
      count++
    })

    // Record
    input.dispatch({ type: "input:key", input: "j", key: { eventType: "press" } })
    input.dispatch({ type: "input:key", input: "k", key: { eventType: "press" } })
    expect(count).toBe(2)
    // Ops are JSON-safe
    const serialized = JSON.stringify(recorded)
    expect(JSON.parse(serialized)).toEqual(recorded)

    // Replay on a fresh app
    const replayApp = withInputChain(createBaseApp())
    let replayedCount = 0
    replayApp.input.register(() => {
      replayedCount++
    })
    for (const op of JSON.parse(serialized) as Op[]) replayApp.dispatch(op)
    expect(replayedCount).toBe(2)
  })
})
