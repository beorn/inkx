/**
 * @failure The production apply chain cannot drive a non-trivial application
 * model, so consumers must maintain a parallel event substrate.
 * @level l3
 * @consumer applications composed with @silvery/create
 * @see hh STATE hub/silvery/prototype/aichat-v2/MANUAL-VERIFICATION.md
 *
 * Apply-chain integration coverage for the aichat-v2 model.
 *
 * The low-level BaseApp and input-chain contracts already live beside their
 * production implementations. This suite keeps only the application seam:
 * real @silvery/create ops drive the chat domain, and effects return to the
 * runner as plain data.
 */

import { describe, expect, test } from "vitest"

import { createBaseApp } from "@silvery/create/runtime/base-app"
import { withInputChain } from "@silvery/create/runtime/with-input-chain"
import type { Op } from "@silvery/create/types"

import { createChatModel, withChat } from "./app.js"
import { pipe, create, withScope, withCommands } from "./shims/app.js"
import { createClock } from "./shims/clock.js"
import { createInstantScope } from "./shims/scope.js"
import { RANDOM_AGENT_RESPONSES } from "../../../examples/apps/aichat/script.ts"

// ============================================================================
// Apply-chain + chat-model integration
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
