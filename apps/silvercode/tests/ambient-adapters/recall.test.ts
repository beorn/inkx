/**
 * Tests for the recall ambient adapter — Phase 6.b.
 *
 * The default recall query returns no hits (the dep wiring is deferred).
 * These tests use an injected query fn so we exercise the
 * sanitize → debounce → enqueue path with deterministic data.
 */

import { describe, expect, test } from "vitest"
import { createScope } from "@silvery/scope"
import { createChannelQueue } from "../../src/channel-queue.ts"
import { registerRecallAmbientAdapterHandle, triggerRecallProbe } from "../../src/ambient-adapters/recall.ts"

describe("ambient-adapter/recall", () => {
  test("default register is a no-op disposer", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const handle = registerRecallAmbientAdapterHandle({ scope, queue })
    expect(typeof handle.dispose).toBe("function")
    handle.dispose()
    handle.dispose() // idempotent
  })

  test("probe enqueues one event per recall hit (after debounce)", async () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    let now = 1000
    // Two hits — second one is debounced because it lands inside the
    // 500ms window. This proves the per-source breaker actually fires.
    const emitted = await triggerRecallProbe(
      {
        scope,
        queue,
        now: () => now++,
        query: async () => [
          { token: "decker", summary: "we discussed deckers in march" },
          { token: "decker", summary: "decker has a sync backend in cloudsv" },
        ],
      },
      "decker",
    )
    expect(emitted).toBe(1)

    const events = queue.peek()
    expect(events).toHaveLength(1)
    expect(events[0]?.source).toBe("recall")
    expect(events[0]?.content).toContain("decker")
  })

  test("probe handles a query that throws without breaking the queue", async () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const emitted = await triggerRecallProbe(
      {
        scope,
        queue,
        query: async () => {
          throw new Error("recall daemon down")
        },
      },
      "decker",
    )
    expect(emitted).toBe(0)
    expect(queue.peek()).toEqual([])
  })

  test("probe is a no-op after dispose", async () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const handle = registerRecallAmbientAdapterHandle({
      scope,
      queue,
      query: async () => [{ token: "x", summary: "hit" }],
    })
    handle.dispose()
    const emitted = await handle.probe("x")
    expect(emitted).toBe(0)
    expect(queue.peek()).toEqual([])
  })
})
