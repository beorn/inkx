/**
 * Layer 3 — queue batching (Option B model).
 *
 * The queue TextArea is ALWAYS live; there is no "hold" state. Auto-flush
 * happens once a pending stdin write is acknowledged by any backend event,
 * or on turn-end when the session returns to idle. Explicit submit
 * (Enter in the queue region) calls `flushQueue` to bypass the idle gate.
 *
 * Mirrors Claude Code's stdin behaviour: after the provider has acknowledged
 * the current prompt, subsequent normal submits can be written immediately
 * while the current assistant turn is still streaming.
 *
 * Failure mode this catches: a past refactor dropped the "join with \n\n"
 * step and sent every queued message as its own send(), turning three
 * queued lines into three sequential turns and triggering a rate limit
 * within seconds.
 */
import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createSilvercodeController } from "../src/controller.ts"
import { createFakeSession } from "../src/test/fake-session.ts"

const SESSION = "fake-queue" as SessionId
let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = []
let writeSpies: Array<ReturnType<typeof vi.spyOn>> = []
const silentWrite = ((
  _chunk: string | Uint8Array,
  encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
  callback?: (err?: Error) => void,
): boolean => {
  const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback
  cb?.()
  return true
}) as typeof process.stdout.write

beforeEach(() => {
  consoleSpies = (["log", "info", "debug", "warn", "error"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  )
  writeSpies = [
    vi.spyOn(process.stdout, "write").mockImplementation(silentWrite),
    vi.spyOn(process.stderr, "write").mockImplementation(silentWrite as typeof process.stderr.write),
  ]
})

afterEach(() => {
  for (const spy of consoleSpies) spy.mockRestore()
  for (const spy of writeSpies) spy.mockRestore()
  consoleSpies = []
  writeSpies = []
})

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

function assistantMessage(turnId: string, text: string): AgentEvent {
  return {
    kind: "assistant-message",
    sessionId: SESSION,
    turnId: turnId as TurnId,
    content: [{ type: "text", text }],
    ts: 1015,
  }
}

function textDelta(turnId: string, text: string): AgentEvent {
  return {
    kind: "text-delta",
    sessionId: SESSION,
    turnId: turnId as TurnId,
    blockIndex: 0,
    text,
    ts: 1030,
  }
}

describe("layer 3: queue batching", () => {
  test("second prompt before backend acknowledgement queues only until the first prompt is acknowledged", async () => {
    const fake = createFakeSession({ sessionId: SESSION })
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("test")

    fake.emit(initEvent())
    expect(handle.store.state.get().status).toBe("idle")

    controller.send(handle.id, "yes")
    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]!.payload).toBe("yes")

    controller.send(handle.id, "its")
    expect(fake.sent).toHaveLength(1)
    expect(controller.queuedText(handle.id)).toBe("its")

    fake.emit(turnStart("a1"))
    expect(fake.sent).toHaveLength(2)
    expect(fake.sent[1]!.payload).toBe("its")
    expect(controller.queuedText(handle.id)).toBe("")

    fake.emit(turnEnd("a1"))

    fake.emit(turnStart("a2"))
    fake.emit(textDelta("a2", "itsGot it — thanks for the correction."))
    fake.emit(turnEnd("a2"))

    const state = handle.store.state.get()
    expect(state.status).toBe("idle")
    const assistant = state.messages.find((m) => m.id === ("a2" as TurnId))
    expect(assistant?.role).toBe("assistant")
    expect(assistant?.text).toBe("Got it — thanks for the correction.")
    expect(assistant?.text.startsWith("its")).toBe(false)

    controller.closeAll()
  })

  test("aggregate-only assistant response also acknowledges the pending stdin write", async () => {
    const fake = createFakeSession({ sessionId: SESSION })
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("test")

    fake.emit(initEvent())
    controller.send(handle.id, "first")
    expect(fake.sent.map((s) => s.payload)).toEqual(["first"])

    controller.send(handle.id, "second")
    expect(fake.sent.map((s) => s.payload)).toEqual(["first"])
    expect(controller.queuedText(handle.id)).toBe("second")

    // Claude's raw stream-json does not literally contain Silvercode
    // `turn-start`; replay/aggregate paths can surface an assistant
    // aggregate first. Any backend event is enough to prove the previous
    // stdin write reached the provider, so the queued follow-up can flush.
    fake.emit(assistantMessage("a1", "working"))

    expect(fake.sent.map((s) => s.payload)).toEqual(["first", "second"])
    expect(controller.queuedText(handle.id)).toBe("")

    controller.closeAll()
  })

  test("explicit queue flush waits while the previous send has no backend acknowledgement", async () => {
    const fake = createFakeSession({ sessionId: SESSION })
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("test")

    fake.emit(initEvent())
    controller.send(handle.id, "first")
    expect(fake.sent).toHaveLength(1)

    controller.setQueuedText(handle.id, "second")
    controller.flushQueue(handle.id)

    expect(fake.sent).toHaveLength(1)
    expect(controller.queuedText(handle.id)).toBe("second")

    fake.emit(turnStart("a1"))
    expect(fake.sent).toHaveLength(2)
    expect(fake.sent[1]!.payload).toBe("second")
    expect(controller.queuedText(handle.id)).toBe("")

    fake.emit(turnEnd("a1"))

    controller.closeAll()
  })

  test("normal submits while the provider is thinking write immediately after turn-start", async () => {
    const fake = createFakeSession({ sessionId: SESSION })
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("test")

    // Session is idle until turn-start arrives; put it into "thinking"
    // first so the queue actually buffers instead of sending inline.
    fake.emit(initEvent())
    fake.emit(turnStart("a1"))
    expect(handle.store.state.get().status).toBe("thinking")

    // The first provider turn has been acknowledged, so normal command-box
    // submits can be written to stdin immediately. Claude Code buffers them
    // for the next turn.
    controller.send(handle.id, "one")
    controller.send(handle.id, "two")
    controller.send(handle.id, "three")
    expect(fake.sent.map((s) => s.payload)).toEqual(["one", "two", "three"])
    expect(controller.queuedText(handle.id)).toBe("")

    // turn-end flips the store to idle; there is no buffered command-box text
    // left to drain.
    fake.emit(turnEnd("a1"))
    expect(handle.store.state.get().status).toBe("idle")

    expect(fake.sent).toHaveLength(3)
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
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("test")

    fake.emit(initEvent())
    fake.emit(turnStart("a1"))
    controller.setQueuedText(handle.id, "buffered")
    expect(controller.queuedText(handle.id)).toBe("buffered")

    controller.clearQueue(handle.id)
    expect(controller.queuedText(handle.id)).toBe("")
    // Even a subsequent idle + turn-end must not resurrect the dropped text.
    fake.emit(turnEnd("a1"))
    expect(fake.sent).toHaveLength(0)

    controller.closeAll()
  })
})
