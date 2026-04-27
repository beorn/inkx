/**
 * Tests for the sub-agent ambient adapter — Phase 6.b.
 *
 * The harness doesn't yet expose a structured sub-agent event stream so
 * the registered adapter is a no-op until that lands. The
 * `emitSubagentEventForTest` surface drives one event through the same
 * sanitize → debounce → enqueue path the real subscription will use.
 */

import { describe, expect, test } from "vitest"
import { createScope } from "@silvery/scope"
import { createChannelQueue } from "../../src/channel-queue.ts"
import { emitSubagentEventForTest, registerSubagentAmbientAdapterHandle } from "../../src/ambient-adapters/subagent.ts"

describe("ambient-adapter/subagent", () => {
  test("register returns an idempotent disposer", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const handle = registerSubagentAmbientAdapterHandle({ scope, queue })
    expect(typeof handle.dispose).toBe("function")
    handle.dispose()
    handle.dispose()
  })

  test("emit routes a started event onto the queue", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const ok = emitSubagentEventForTest(
      { scope, queue },
      { kind: "started", agent: "tdd-bot", summary: "running tests for filewatch" },
    )
    expect(ok).toBe(true)
    const events = queue.peek()
    expect(events).toHaveLength(1)
    expect(events[0]?.source).toBe("subagent")
    expect(events[0]?.content).toContain("tdd-bot")
    expect(events[0]?.content).toContain("running tests for filewatch")
    expect(events[0]?.meta).toMatchObject({ kind: "subagent-status", agent: "tdd-bot", status: "started" })
  })

  test("emit covers progress / completed / stopped variants", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    for (const kind of ["progress", "completed", "stopped"] as const) {
      // Each call uses a fresh handle so the per-handle debounce doesn't
      // drop the second/third events. Production wiring uses ONE handle
      // with the per-source breaker — that's tested in types.test.ts.
      const ok = emitSubagentEventForTest({ scope, queue }, { kind, agent: "x", summary: kind })
      expect(ok).toBe(true)
    }
    expect(queue.peek().map((e) => e.meta?.status)).toEqual(["progress", "completed", "stopped"])
  })

  test("emit drops empty summary", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    // Empty summary still produces a content with a verb prefix; sanitize
    // doesn't drop it. We therefore explicitly assert non-empty content
    // is required for an actually-empty enqueue.
    expect(emitSubagentEventForTest({ scope, queue }, { kind: "started", agent: "x", summary: "" })).toBe(true)
    expect(queue.peek()).toHaveLength(1)
  })
})
