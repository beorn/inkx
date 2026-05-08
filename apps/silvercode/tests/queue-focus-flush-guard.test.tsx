/**
 * Layer 3 — queue auto-flush focus guard.
 *
 * When the user has moved focus into the queue region (to inspect / edit /
 * reorder queued entries), the controller's turn-end handler MUST NOT
 * auto-flush the queue. Otherwise the user's queued draft gets snatched
 * out from under them mid-edit.
 *
 * Wiring: App.tsx owns `focusedRegion: "queue" | "command"` state. The
 * controller needs a way to read it without depending on React. We pass
 * a `getFocusedRegion: () => "queue" | "command"` accessor through
 * ControllerOptions; tryFlush() bails when it returns "queue" (auto-path
 * only — explicit flushQueue / Enter-in-queue still works).
 *
 * Bead: km-silvercode.queue-focus-flush-guard
 */
import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"
import { describe, expect, test } from "vitest"
import { createSilvercodeController } from "../src/controller.ts"
import { createFakeSession } from "../src/test/fake-session.ts"

const SESSION = "fake-focus-guard" as SessionId
const ACTIVE_STATE = "thinking"

function initEvent(): AgentEvent {
  return {
    kind: "session-init",
    sessionId: SESSION,
    cwd: "/tmp/fake",
    model: "claude-sonnet-4-6",
    mode: "auto",
    tools: [],
    mcp_servers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "2.1.119",
    apiKeySource: "OAuth",
    ts: 1000,
  }
}

function turnStart(turnId: string): AgentEvent {
  return { kind: "turn-start", sessionId: SESSION, turnId: turnId as TurnId, role: "assistant", ts: 1010 }
}

function turnEnd(turnId: string): AgentEvent {
  return {
    kind: "turn-end",
    sessionId: SESSION,
    turnId: turnId as TurnId,
    stopReason: "end_turn",
    ts: 1020,
  }
}

describe("layer 3: queue auto-flush focus guard", () => {
  test("turn-end does NOT flush queue while focusedRegion === 'queue'", async () => {
    const fake = createFakeSession({ sessionId: SESSION })
    let region: "queue" | "command" = "command"
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      initialSessions: 0,
      spawnFactory: () => fake,
      getFocusedRegion: () => region,
    })
    const handle = await controller.spawnSession("test")

    fake.emit(initEvent())
    fake.emit(turnStart("a1"))
    expect(handle.store.state.get().status).toBe(ACTIVE_STATE)

    // User has typed entries into the always-live queue TextArea while
    // Claude is mid-turn, then moved focus INTO the queue region to
    // inspect / re-order them.
    controller.setQueuedText(handle.id, "draft entry")
    region = "queue"

    // Claude finishes its turn. Without the focus guard, tryFlush would
    // grab the queue and submit it — yanking the user's draft mid-edit.
    fake.emit(turnEnd("a1"))

    expect(handle.store.state.get().status).toBe("idle")
    expect(fake.sent).toHaveLength(0)
    expect(controller.queuedText(handle.id)).toBe("draft entry")

    // Now the user moves focus back to the command box. The next turn
    // boundary should drain the queue normally.
    region = "command"
    fake.emit(turnStart("a2"))
    fake.emit(turnEnd("a2"))

    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]!.payload).toBe("draft entry")
    expect(controller.queuedText(handle.id)).toBe("")

    controller.closeAll()
  })

  test("explicit flushQueue still works while focus is in queue (Enter-in-queue path)", async () => {
    // The focus guard is an AUTO-flush guard only. Explicit submit
    // (Enter in the queue region → controller.flushQueue) is the user
    // saying "send it now" — it must bypass the focus check.
    const fake = createFakeSession({ sessionId: SESSION })
    const region = "queue"
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      initialSessions: 0,
      spawnFactory: () => fake,
      getFocusedRegion: () => region,
    })
    const handle = await controller.spawnSession("test")

    fake.emit(initEvent())
    fake.emit(turnStart("a1"))
    controller.setQueuedText(handle.id, "explicit send")

    controller.flushQueue(handle.id)

    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]!.payload).toBe("explicit send")
    expect(controller.queuedText(handle.id)).toBe("")

    controller.closeAll()
  })

  test("default (no getFocusedRegion supplied) preserves prior auto-flush behaviour", async () => {
    // Backwards compat: if a consumer doesn't pass the accessor, behave
    // exactly like before — turn-end auto-flushes the queue.
    const fake = createFakeSession({ sessionId: SESSION })
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("test")

    fake.emit(initEvent())
    fake.emit(turnStart("a1"))
    controller.setQueuedText(handle.id, "auto-drain me")
    fake.emit(turnEnd("a1"))

    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]!.payload).toBe("auto-drain me")
    expect(controller.queuedText(handle.id)).toBe("")

    controller.closeAll()
  })
})
