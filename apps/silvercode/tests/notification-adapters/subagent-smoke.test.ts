/**
 * End-to-end smoke test — synthetic Task tool spawn lands a START event,
 * synthetic completion lands a COMPLETE event. This is the proof that
 * the controller's `tool-use` / `tool-result` subscription path drives
 * real notification events all the way through sanitize → enqueue.
 *
 * Standalone (no controller dependency) so it runs in fast tests; the
 * controller integration is exercised indirectly here by feeding the
 * adapter the same shapes the controller subscribe loop forwards.
 */

import { describe, expect, test } from "vitest"
import { createScope } from "@silvery/scope"
import { createChannelQueue } from "../../src/channel-queue.ts"
import { registerSubagentNotificationAdapterHandle } from "../../src/notification-adapters/subagent.ts"

describe("notification-adapter/subagent — smoke (synthetic Task lifecycle)", () => {
  test("spawn → START event lands; result → COMPLETE event lands", () => {
    const scope = createScope("smoke")
    const t = 1_000
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue, now: () => t })

    // ── 1. Synthetic Task spawn ──────────────────────────────────────
    handle.notifyTaskToolUse({
      toolUseId: "toolu_smoke_1",
      toolName: "Task",
      input: {
        description: "wire recall.ts adapter",
        subagent_type: "general-purpose",
        prompt: "Replace the recall.ts stub with a real adapter…",
      },
      sessionId: "session-smoke",
    })
    const afterStart = queue.peek()
    expect(afterStart).toHaveLength(1)
    const startEvent = afterStart[0]!
    // START payload — log shape matches the design goal.
    // Format: `[subagent <agent>] started: <description>`
    expect(startEvent.source).toBe("subagent")
    expect(startEvent.content).toBe("[subagent general-purpose] started: wire recall.ts adapter")
    expect(startEvent.meta).toMatchObject({
      kind: "subagent-status",
      agent: "general-purpose",
      status: "started",
      fromSessionId: "session-smoke",
    })

    // ── 2. Keep the same clock tick; parallel lifecycle events must not drop.

    // ── 3. Synthetic Task completion ────────────────────────────────
    handle.notifyTaskToolResult({
      toolUseId: "toolu_smoke_1",
      output: "Done — adapter wired, 12 tests pass.",
      sessionId: "session-smoke",
    })
    const afterComplete = queue.peek()
    expect(afterComplete).toHaveLength(2)
    const completeEvent = afterComplete[1]!
    // COMPLETE payload — same agent/session attribution; result digest
    // appended after an em-dash separator, capped at 200 chars.
    expect(completeEvent.source).toBe("subagent")
    expect(completeEvent.content).toBe(
      "[subagent general-purpose] completed: wire recall.ts adapter — Done — adapter wired, 12 tests pass.",
    )
    expect(completeEvent.meta).toMatchObject({
      kind: "subagent-status",
      agent: "general-purpose",
      status: "completed",
      fromSessionId: "session-smoke",
    })
    expect(handle.inflightCount()).toBe(0)
  })
})
