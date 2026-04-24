/**
 * Layer 3 — queue batching.
 *
 * While the session is non-idle (thinking / tool-running / awaiting-permission),
 * controller.send() appends to a per-session queue. When the session returns
 * to idle, the WHOLE buffer goes as ONE send() — not three.
 *
 * Mirrors Claude Code's own batching behaviour so queued messages collapse
 * into one turn instead of interleaving partial requests mid-tool-call.
 *
 * Failure mode this catches: a past refactor dropped the "join with \n\n"
 * step and sent every queued message as its own send(), turning three
 * queued lines into three sequential turns and triggering a rate limit
 * within seconds.
 *
 * Because the session store flips status → idle only after a turn-end (or
 * session-end) event, the controller's own flush trigger is ambient — the
 * canonical way to deterministically drain the queue after idling is
 * holdQueue(id, false), which calls tryFlush unconditionally. That's what
 * silvercode's QueueEditor already does when it releases focus.
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
  test("three sends while thinking collapse to ONE send joined with \\n\\n on flush", async () => {
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
    // flush hook only fires on "result" / "session-lifecycle", so we
    // deterministically drain via holdQueue — the same call QueueEditor
    // makes when it releases focus.
    fake.emit(turnEnd("a1"))
    expect(handle.store.state.get().status).toBe("idle")
    controller.holdQueue(handle.id, false)

    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]!.type).toBe("user")
    expect(fake.sent[0]!.payload).toBe("one\n\ntwo\n\nthree")
    expect(controller.queuedText(handle.id)).toBe("")

    controller.closeAll()
  })

  test("holdQueue(true) pauses flush even when idle; release triggers it", async () => {
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
    // Session is idle, but the user is mid-edit in the QueueEditor.
    controller.holdQueue(handle.id, true)
    // Send with hold set → goes to queue, not to the session.
    controller.send(handle.id, "edited message")
    expect(fake.sent).toHaveLength(0)
    expect(controller.queuedText(handle.id)).toBe("edited message")

    // Release → flush.
    controller.holdQueue(handle.id, false)
    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]!.payload).toBe("edited message")

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
    // Even a subsequent idle + flush must not resurrect the dropped text.
    fake.emit(turnEnd("a1"))
    controller.holdQueue(handle.id, false)
    expect(fake.sent).toHaveLength(0)

    controller.closeAll()
  })
})
