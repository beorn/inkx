/**
 * Layer 3 — queue batching (Option B model).
 *
 * The queue TextArea is ALWAYS live; there is no "hold" state. Auto-flush
 * happens on turn-end when the session returns to idle. Explicit submit
 * (Enter in the queue region) calls `flushQueue` to bypass the idle gate.
 *
 * Mirrors Claude Code's batching behaviour so queued messages collapse
 * into one turn instead of interleaving partial requests mid-tool-call.
 *
 * Failure mode this catches: a past refactor dropped the "join with \n\n"
 * step and sent every queued message as its own send(), turning three
 * queued lines into three sequential turns and triggering a rate limit
 * within seconds.
 */
import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"
import { describe, expect, test } from "vitest"
import { createSilvercodeController } from "../src/controller.ts"
import { createFakeSession } from "../src/test/fake-session.ts"

const SESSION = "fake-queue" as SessionId

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

describe("layer 3: queue batching", () => {
  test("three sends while thinking collapse to ONE send joined with \\n\\n on turn-end", async () => {
    const fake = createFakeSession({ sessionId: SESSION })
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      track: "claude",
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("test")

    // Session is idle until turn-start arrives; put it into "thinking"
    // first so the queue actually buffers instead of sending inline.
    fake.emit(initEvent())
    fake.emit(turnStart("a1"))
    expect(handle.store.state.get().status).toBe("thinking")

    // Three queued messages while busy — each one goes to the buffer,
    // nothing is sent to the session.
    controller.send(handle.id, "one")
    controller.send(handle.id, "two")
    controller.send(handle.id, "three")
    expect(fake.sent).toHaveLength(0)
    expect(controller.queuedText(handle.id)).toBe("one\n\ntwo\n\nthree")

    // turn-end flips the store to idle; the controller's subscribe-path
    // calls tryFlush on every turn-end / session-lifecycle event.
    fake.emit(turnEnd("a1"))
    expect(handle.store.state.get().status).toBe("idle")

    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]!.type).toBe("user")
    expect(fake.sent[0]!.payload).toBe("one\n\ntwo\n\nthree")
    expect(controller.queuedText(handle.id)).toBe("")

    controller.closeAll()
  })

  test("setQueuedText while idle does not auto-send — waits for explicit flush or next send", async () => {
    // Option B model: edits to the queue TextArea flow into setQueuedText.
    // While the session is idle, that buffer should NOT auto-drain on its
    // own — it only goes out on the next turn-end after a real `send`,
    // or on explicit `flushQueue` (Enter in queue region).
    const fake = createFakeSession({ sessionId: SESSION })
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      track: "claude",
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("test")

    fake.emit(initEvent())
    expect(handle.store.state.get().status).toBe("idle")

    // User types into the queue TextArea — flows back to setQueuedText.
    controller.setQueuedText(handle.id, "queued draft")
    expect(controller.queuedText(handle.id)).toBe("queued draft")
    expect(fake.sent).toHaveLength(0)

    // Explicit flush sends it.
    controller.flushQueue(handle.id)
    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]!.payload).toBe("queued draft")
    expect(controller.queuedText(handle.id)).toBe("")

    controller.closeAll()
  })

  test("regression: queue auto-flushes on turn-end after edits land via setQueuedText", async () => {
    // User scenario: session is busy, user edits the queue TextArea
    // directly (Option B has no "hold" — the TextArea is always live).
    // When Claude finishes its turn, turn-end → status=idle → controller's
    // subscribe-path calls tryFlush → queue drains.
    const fake = createFakeSession({ sessionId: SESSION })
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      track: "claude",
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("test")

    fake.emit(initEvent())
    fake.emit(turnStart("a1"))
    expect(handle.store.state.get().status).toBe("thinking")

    // User types directly into the always-live queue TextArea while
    // Claude is mid-turn. Three entries joined as the wire format.
    controller.setQueuedText(handle.id, "one\n\ntwo\n\nthree")
    expect(controller.queuedText(handle.id)).toBe("one\n\ntwo\n\nthree")
    expect(fake.sent).toHaveLength(0)

    // Claude finishes its turn → auto-flush fires.
    fake.emit(turnEnd("a1"))

    expect(handle.store.state.get().status).toBe("idle")
    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]!.type).toBe("user")
    expect(fake.sent[0]!.payload).toBe("one\n\ntwo\n\nthree")
    expect(controller.queuedText(handle.id)).toBe("")

    controller.closeAll()
  })

  test("flushQueue force-sends mid-thinking (Enter in queue region bypasses idle gate)", async () => {
    // The Option B Enter-in-queue path: flushQueue submits ALL queued
    // items NOW, even if Claude is mid-turn. Claude Code's CLI buffers
    // stdin while it's working, so the user-message lands as the next
    // turn's input.
    const fake = createFakeSession({ sessionId: SESSION })
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      track: "claude",
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("test")

    fake.emit(initEvent())
    fake.emit(turnStart("a1"))
    expect(handle.store.state.get().status).toBe("thinking")

    controller.setQueuedText(handle.id, "one\n\ntwo\n\nthree")
    expect(fake.sent).toHaveLength(0)

    // User presses Enter in the queue region → controller.flushQueue.
    // Status is still "thinking"; force-flush bypasses the gate.
    controller.flushQueue(handle.id)

    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]!.payload).toBe("one\n\ntwo\n\nthree")
    expect(controller.queuedText(handle.id)).toBe("")

    // Subsequent turn-end auto-flush is a no-op — buffer is empty,
    // no double-send.
    fake.emit(turnEnd("a1"))
    expect(fake.sent).toHaveLength(1)

    controller.closeAll()
  })

  test("clearQueue drops the buffer without sending anything", async () => {
    const fake = createFakeSession({ sessionId: SESSION })
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      track: "claude",
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("test")

    fake.emit(initEvent())
    fake.emit(turnStart("a1"))
    controller.send(handle.id, "buffered")
    expect(controller.queuedText(handle.id)).toBe("buffered")

    controller.clearQueue(handle.id)
    expect(controller.queuedText(handle.id)).toBe("")
    // Even a subsequent idle + turn-end must not resurrect the dropped text.
    fake.emit(turnEnd("a1"))
    expect(fake.sent).toHaveLength(0)

    controller.closeAll()
  })
})
