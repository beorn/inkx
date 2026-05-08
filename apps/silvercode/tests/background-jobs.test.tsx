/**
 * Background jobs — controller unit coverage.
 *
 * Silvercode used to fake backgrounding by detaching one provider turnId from
 * the foreground store. That only worked for text-only turns and leaked as soon
 * as Claude crossed a tool boundary, so the shim is disabled until background
 * jobs are backed by a real provider job id / native task notification.
 *
 * Acceptance scenarios:
 *   - backgroundActiveJob during a running job is a no-op.
 *   - foreground streaming continues to render after the disabled shortcut.
 *   - backgroundActiveJob with no active job is a no-op.
 */
import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createSilvercodeController } from "../src/controller.ts"
import { createFakeSession } from "../src/test/fake-session.ts"

const SESSION = "fake-bg" as SessionId
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

function textDelta(turnId: string, text: string): AgentEvent {
  return { kind: "text-delta", sessionId: SESSION, turnId: turnId as TurnId, blockIndex: 0, text, ts: 1015 }
}

function turnEnd(turnId: string): AgentEvent {
  return { kind: "turn-end", sessionId: SESSION, turnId: turnId as TurnId, stopReason: "end_turn", ts: 1020 }
}

describe("controller: background jobs", () => {
  test("backgroundActiveJob is disabled and does not detach the running provider turn", async () => {
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
    fake.emit(textDelta("a1", "Reticulating"))
    expect(handle.store.state.get().status).toBe("thinking")

    controller.backgroundActiveJob(handle.id)

    expect(handle.store.state.get().status).toBe("thinking")
    expect(controller.backgroundJobs(handle.id)).toHaveLength(0)

    fake.emit(textDelta("a1", " foreground still receives output"))
    const foreground = handle.store.state.get().messages.find((m) => m.id === ("a1" as TurnId))
    expect(foreground?.text).toContain("Reticulating foreground still receives output")

    controller.closeAll()
  })

  test("backgroundActiveJob does not affect prompt submission", async () => {
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
    fake.emit(turnStart("a1"))
    expect(handle.store.state.get().status).toBe("thinking")

    controller.backgroundActiveJob(handle.id)
    controller.send(handle.id, "second")

    // The second send is immediate because prompt submission is allowed after
    // turn-start acknowledgement, not because backgrounding changed state.
    expect(fake.sent.map((s) => s.payload)).toEqual(["first", "second"])
    expect(controller.queuedText(handle.id)).toBe("")

    controller.closeAll()
  })

  test("backgroundActiveJob with no active job is a no-op", async () => {
    const fake = createFakeSession({ sessionId: SESSION })
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("test")
    fake.emit(initEvent())
    // Status is idle — Ctrl-B should be a no-op.
    controller.backgroundActiveJob(handle.id)
    expect(controller.backgroundJobs(handle.id)).toHaveLength(0)

    controller.closeAll()
  })

  test("onBackgroundJobsChange does not fire for disabled backgroundActiveJob", async () => {
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

    let lastSnapshot: ReadonlyArray<unknown> = []
    controller.onBackgroundJobsChange((sid, jobs) => {
      if (sid === handle.id) lastSnapshot = jobs
    })

    controller.backgroundActiveJob(handle.id)
    expect(lastSnapshot).toHaveLength(0)

    controller.closeAll()
  })
})
