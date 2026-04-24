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

  test("regression: queue auto-flushes on turn-end after editor releases mid-thinking", async () => {
    // User scenario from the bug report: "After cursor returns to command box,
    // queue doesn't submit — items just stay there."
    //
    // Reproduction:
    //   1. Session is busy (thinking).
    //   2. User opens queue editor (hold=true) and queues 3 messages via
    //      setQueuedText (matches what QueueEditor's onChange does).
    //   3. User presses Enter on a queue item → editor calls onQueueRelease
    //      → App.tsx setQueueFocused(false) → useEffect calls
    //      controller.holdQueue(id, false). Cursor returns to command box.
    //   4. Hold is released BUT session is still thinking — tryFlush bails.
    //   5. Eventually Claude emits turn-end → status flips to "idle" →
    //      controller's subscribe-path tryFlush fires → queue must drain.
    //
    // If step 5 doesn't drain the queue, items stay there forever and the
    // user's queued work is silently lost until they press Enter on the
    // command-box prompt (which combines pending + new in send()).
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

    // Queue editor opens — App.tsx sets hold=true via useEffect.
    controller.holdQueue(handle.id, true)
    // User types three queued entries through setQueuedText (the path the
    // QueueEditor's onChange→writeBack uses, NOT controller.send()). This
    // models the actual user motion: paste/type in the editor, see the
    // text in the queue area, then release.
    controller.setQueuedText(handle.id, "one\n\ntwo\n\nthree")
    expect(controller.queuedText(handle.id)).toBe("one\n\ntwo\n\nthree")
    expect(fake.sent).toHaveLength(0)

    // Enter on a queue item → onQueueRelease → setQueueFocused(false) →
    // useEffect → holdQueue(id, false). Hold released, but session is
    // still thinking — tryFlush should bail silently here.
    controller.holdQueue(handle.id, false)
    expect(fake.sent).toHaveLength(0)
    expect(controller.queuedText(handle.id)).toBe("one\n\ntwo\n\nthree")

    // Now Claude finishes its turn. The controller's subscribe handler
    // applies the event (status → idle) and calls tryFlush. The queue
    // MUST drain at this point — that's the auto-flush guarantee.
    fake.emit(turnEnd("a1"))

    expect(handle.store.state.get().status).toBe("idle")
    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]!.type).toBe("user")
    expect(fake.sent[0]!.payload).toBe("one\n\ntwo\n\nthree")
    expect(controller.queuedText(handle.id)).toBe("")

    controller.closeAll()
  })

  test("flushQueue force-sends mid-thinking (Enter on a queue item bypasses idle gate)", async () => {
    // The user-facing fix: pressing Enter on a queue item should submit
    // ALL queued items NOW, even if Claude is mid-turn. The previous
    // behaviour only released the hold and waited for the next idle
    // window, which made the items look stuck. flushQueue bypasses the
    // idle gate; Claude Code's CLI buffers stdin while it's working, so
    // the user-message lands as the next turn's input.
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

    // Editor opens (hold=true), user types three entries via setQueuedText.
    controller.holdQueue(handle.id, true)
    controller.setQueuedText(handle.id, "one\n\ntwo\n\nthree")
    expect(fake.sent).toHaveLength(0)

    // User presses Enter on a queue item → App.tsx onQueueSubmit calls
    // controller.flushQueue. Status is still "thinking" — the old code
    // path (holdQueue(false)→tryFlush) would have bailed here. The new
    // force-flush path sends through.
    controller.flushQueue(handle.id)

    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]!.payload).toBe("one\n\ntwo\n\nthree")
    expect(controller.queuedText(handle.id)).toBe("")
    // Hold cleared so the subsequent turn-end auto-flush is a no-op,
    // never resurrecting drained text or double-sending.
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
    // Even a subsequent idle + flush must not resurrect the dropped text.
    fake.emit(turnEnd("a1"))
    controller.holdQueue(handle.id, false)
    expect(fake.sent).toHaveLength(0)

    controller.closeAll()
  })
})
