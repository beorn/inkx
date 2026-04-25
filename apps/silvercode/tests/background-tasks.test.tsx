/**
 * Background tasks — controller unit coverage.
 *
 * Companion to tests/visual/ctrl-b-background.test.tsx. The visual test
 * covers the full key-handler → SidePanel → MessageList round trip; this
 * test exercises the controller methods directly so failures point at the
 * controller boundary instead of the rendering layer.
 *
 * Acceptance scenarios:
 *   - backgroundActiveTurn during a running turn creates a task + flips
 *     the store to idle within one tick (UI accepts new input).
 *   - turn-end after backgrounding flips the task to "completed" + emits
 *     a system message into the store with the BACKGROUND_MESSAGE_PREFIX.
 *   - cancelBackgroundTask flips the status to "cancelled" + suppresses
 *     the eventual turn-end "completed" message.
 *   - backgroundActiveTurn with no active turn is a no-op (no task).
 */
import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"
import { describe, expect, test } from "vitest"
import { BACKGROUND_MESSAGE_PREFIX, createSilvercodeController } from "../src/controller.ts"
import { createFakeSession } from "../src/test/fake-session.ts"

const SESSION = "fake-bg" as SessionId

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

describe("controller: background tasks", () => {
  test("backgroundActiveTurn creates a running task + flips status to idle so the UI accepts input immediately", async () => {
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
    fake.emit(textDelta("a1", "Reticulating"))
    expect(handle.store.state.get().status).toBe("thinking")

    controller.backgroundActiveTurn(handle.id)

    // Status flipped to idle so the UI is responsive.
    expect(handle.store.state.get().status).toBe("idle")
    // Background task list now has one running task with the partial
    // snippet captured.
    const tasks = controller.backgroundTasks(handle.id)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.status).toBe("running")
    expect(tasks[0]!.turnId).toBe("a1")
    expect(tasks[0]!.snippet).toContain("Reticulating")

    controller.closeAll()
  })

  test("turn-end after backgrounding surfaces a completed system message + flips task status", async () => {
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
    fake.emit(textDelta("a1", "Hello world"))
    controller.backgroundActiveTurn(handle.id)

    fake.emit(turnEnd("a1"))

    const tasks = controller.backgroundTasks(handle.id)
    expect(tasks[0]!.status).toBe("completed")

    // System message lands in the conversation. Filter messages so we
    // ignore the original assistant turn's content.
    const messages = handle.store.state.get().messages
    const sysMsg = messages.find((m) => (m.id as string).startsWith("bg-"))
    expect(sysMsg).toBeDefined()
    expect(sysMsg!.text.startsWith(BACKGROUND_MESSAGE_PREFIX)).toBe(true)
    expect(sysMsg!.text).toContain("completed")
    expect(sysMsg!.text).toContain("Hello world")

    controller.closeAll()
  })

  test("cancelBackgroundTask flips status to cancelled + suppresses subsequent turn-end completion message", async () => {
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
    fake.emit(textDelta("a1", "Doing work"))
    controller.backgroundActiveTurn(handle.id)

    const taskId = controller.backgroundTasks(handle.id)[0]!.id
    controller.cancelBackgroundTask(handle.id, taskId)

    expect(controller.backgroundTasks(handle.id)[0]!.status).toBe("cancelled")

    // Cancellation message lands.
    const cancelMsg = handle.store.state
      .get()
      .messages.find((m) => (m.id as string).startsWith("bg-cancel-") && m.text.includes("cancelled"))
    expect(cancelMsg).toBeDefined()

    // Eventual turn-end should NOT add a second "completed" message
    // (we already showed cancelled).
    fake.emit(turnEnd("a1"))
    const completedMessages = handle.store.state
      .get()
      .messages.filter((m) => (m.id as string).startsWith("bg-") && m.text.includes("completed"))
    expect(completedMessages).toHaveLength(0)
    expect(controller.backgroundTasks(handle.id)[0]!.status).toBe("cancelled")

    controller.closeAll()
  })

  test("backgroundActiveTurn with no active turn is a no-op", async () => {
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
    // Status is idle — Ctrl-B should be a no-op.
    controller.backgroundActiveTurn(handle.id)
    expect(controller.backgroundTasks(handle.id)).toHaveLength(0)

    controller.closeAll()
  })

  test("onBackgroundTasksChange fires within a tick of backgroundActiveTurn", async () => {
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

    let lastSnapshot: ReadonlyArray<unknown> = []
    controller.onBackgroundTasksChange((sid, tasks) => {
      if (sid === handle.id) lastSnapshot = tasks
    })

    controller.backgroundActiveTurn(handle.id)
    // Synchronous notify after backgroundActiveTurn — the SidePanel
    // indicator updates within the same React tick (no setTimeout).
    expect(lastSnapshot).toHaveLength(1)

    controller.closeAll()
  })
})
