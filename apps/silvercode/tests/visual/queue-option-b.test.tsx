/**
 * Option B queue UX — visual regression scenarios.
 *
 * Two always-live silvery `<TextArea>` widgets (queue + command) with
 * cursor-boundary focus handoff via silvery's `onEdge` callback. These
 * scenarios cover the acceptance list from
 * `apps/silvercode/docs/queue-option-b-design.md`:
 *
 *   1. Focus swap up: Up at top of command (with non-empty queue) → queue focused
 *   2. Focus swap down: Down at bottom of queue → command focused
 *   3. Enter in queue flushes the entire buffer to the session
 *   4. Enter in command during mid-turn enqueues (not sends)
 *   5. Empty queue Up-arrow is a no-op (no focus swap)
 *   6. Per-region focus signal: divider title flips between QUEUE / QUEUE HELD
 *
 * The rendered frame is the source of truth — we read it via the test
 * harness's @silvery/test renderer, then assert based on visible chrome
 * (divider title, prompt color) and the underlying controller state
 * (queueText, fake.sent payloads).
 *
 * Bead: km-silvercode.queue-option-b-impl
 */

import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { leftWidthFor, renderScenario } from "../../src/test/render-harness.tsx"
import { createFakeSession, type ScriptedFakeSession } from "../../src/test/fake-session.ts"

const COLS = 120
const ROWS = 30
const SESSION = "fake-session-1" as SessionId
let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = []

beforeEach(() => {
  consoleSpies = (["log", "info", "debug", "warn", "error"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  )
})

afterEach(() => {
  for (const spy of consoleSpies) spy.mockRestore()
  consoleSpies = []
})

function turnStart(turnId: string): AgentEvent {
  return { kind: "turn-start", sessionId: SESSION, turnId: turnId as TurnId, role: "assistant", ts: 1010 }
}

function sessionInit(): AgentEvent {
  return {
    kind: "session-init",
    sessionId: SESSION,
    cwd: "/tmp/silvercode-test",
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

function userMessage(): AgentEvent {
  return { kind: "user-message", sessionId: SESSION, turnId: "u1" as TurnId, text: "seed", ts: 1005 }
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

function createQueueFake(): ScriptedFakeSession {
  return Object.assign(createFakeSession({ sessionId: SESSION }), { agent: "claude", protocolVersion: 1 })
}

/**
 * Drive a seeded transcript + a turn-start so the session is in a
 * single-flight "thinking" state — that's the realistic context for a
 * queue UX (user types a follow-up while the agent is still working).
 */
async function busySession(opts: { initialQueue?: string } = {}) {
  const s = await renderScenario({
    script: [sessionInit(), userMessage(), turnStart("a1")],
    cols: COLS,
    rows: ROWS,
    fake: createQueueFake(),
  })
  if (opts.initialQueue) {
    s.controller.setQueuedText(s.controller.focusedId(), opts.initialQueue)
    await new Promise<void>((r) => setTimeout(r, 0))
    s.resample()
  }
  return s
}

describe("Option B queue — focus handoff and Enter semantics", () => {
  test("scenario 1: empty queue → divider hidden, no QUEUE label visible", async () => {
    const s = await renderScenario({ script: [], cols: COLS, rows: ROWS })
    try {
      // No queue, no divider. The QUEUE / QUEUE HELD label only appears
      // when the queue is non-empty.
      expect(s.text).not.toContain("QUEUE")
    } finally {
      s.dispose()
    }
  })

  test("scenario 2: non-empty queue while busy → QUEUE divider visible", async () => {
    const s = await busySession({ initialQueue: "first\n\nsecond" })
    try {
      // Mid-turn the queue is held by the controller; the divider title
      // reflects the focused region. Default focus is "command", so we
      // should see "QUEUE" (not "QUEUE HELD").
      expect(s.text).toContain("QUEUE")
      expect(s.text).not.toContain("QUEUE HELD")
      // Both queued lines render somewhere in the frame.
      expect(s.text).toContain("first")
      expect(s.text).toContain("second")
    } finally {
      s.dispose()
    }
  })

  test("queue divider stays inside the command pane", async () => {
    const s = await busySession({ initialQueue: "queued-entry" })
    try {
      const leftWidth = leftWidthFor(COLS)
      const dividerLine = s.lines.find((line) => line.includes("QUEUE"))
      expect(dividerLine, s.text).toBeDefined()
      expect(dividerLine!.slice(leftWidth), s.text).not.toContain("─")
      expect(dividerLine!.slice(leftWidth), s.text).not.toContain("QUEUE")
    } finally {
      s.dispose()
    }
  })

  test("scenario 3: Up at top of command with non-empty queue → divider flips to QUEUE HELD", async () => {
    const s = await busySession({ initialQueue: "queued-entry" })
    try {
      // Sanity: starts with command region focused → "QUEUE" label.
      expect(s.text).toContain("QUEUE")
      expect(s.text).not.toContain("QUEUE HELD")
      // Press Up at the top of the (empty) command TextArea — silvery's
      // onEdge fires "top", SessionPromptComposer calls onFocusRegion("queue").
      await s.app.press("ArrowUp")
      // Re-sample: divider title should now read "QUEUE HELD" (yellow).
      expect(s.text).toContain("QUEUE HELD")
    } finally {
      s.dispose()
    }
  })

  test("scenario 4: Down at bottom of queue → divider flips back to QUEUE", async () => {
    const s = await busySession({ initialQueue: "queued-entry" })
    try {
      // Enter the queue first.
      await s.app.press("ArrowUp")
      expect(s.text).toContain("QUEUE HELD")
      // Press Down at the (single-line) bottom of the queue TextArea.
      // onEdge fires "bottom" → onFocusRegion("command").
      await s.app.press("ArrowDown")
      expect(s.text).toContain("QUEUE")
      expect(s.text).not.toContain("QUEUE HELD")
    } finally {
      s.dispose()
    }
  })

  test("leaving queue focus after an idle turn drains the held queue", async () => {
    const s = await busySession({ initialQueue: "held-after-idle" })
    try {
      const baseline = s.fake.sent.length

      await s.app.press("ArrowUp")
      expect(s.text).toContain("QUEUE HELD")

      // Claude finishes while the user is still focused in the queue.
      // The focus guard intentionally pauses auto-flush at this point.
      s.emit(turnEnd("a1"))
      await new Promise<void>((r) => setTimeout(r, 20))
      expect(s.fake.sent.length).toBe(baseline)
      expect(s.text).toContain("QUEUE HELD")

      // Once the user leaves the queue editor, the paused auto-flush
      // should retry immediately. Otherwise the queue can sit forever
      // because there may not be another turn boundary.
      await s.app.press("ArrowDown")
      await new Promise<void>((r) => setTimeout(r, 20))

      expect(s.fake.sent.length).toBe(baseline + 1)
      expect(s.fake.sent[s.fake.sent.length - 1]!.payload).toBe("held-after-idle")
      expect(s.text).not.toContain("QUEUE")
    } finally {
      s.dispose()
    }
  })

  test("scenario 5: empty queue + Up at top of command → no swap (label stays absent)", async () => {
    const s = await renderScenario({ script: [], cols: COLS, rows: ROWS })
    try {
      // No queue, command empty. Press Up — onEdge fires "top" but
      // SessionPromptComposer short-circuits because hasQueue is false; no focus
      // change, divider absent.
      await s.app.press("ArrowUp")
      expect(s.text).not.toContain("QUEUE")
      expect(s.text).not.toContain("QUEUE HELD")
    } finally {
      s.dispose()
    }
  })

  test("scenario 6: Ctrl+J in queue region force-flushes the buffer", async () => {
    const s = await busySession({ initialQueue: "one\n\ntwo\n\nthree" })
    try {
      // Sanity — the seeding sends were queued (mid-turn), nothing
      // dispatched yet beyond what the welcome/turn-start flow itself
      // produces. We capture the baseline send count.
      const baseline = s.fake.sent.length
      // Enter queue region.
      await s.app.press("ArrowUp")
      expect(s.text).toContain("QUEUE HELD")
      // Ctrl+J in queue → onQueueSubmit → controller.flushQueue. With
      // submitKey="ctrl+enter" silvery's TextArea emits onSubmit only
      // on Ctrl+Enter / Ctrl+J — plain Enter inserts a newline (= adds
      // a new queued entry), which is what we want for multi-entry
      // editing.
      await s.app.press("Ctrl+j")
      // Force-flush sends ONE user message containing all three entries
      // joined by "\n\n".
      expect(s.fake.sent.length).toBe(baseline + 1)
      const last = s.fake.sent[s.fake.sent.length - 1]!
      expect(last.type).toBe("user")
      expect(last.payload).toBe("one\n\ntwo\n\nthree")
      // Buffer cleared; QUEUE / QUEUE HELD divider gone.
      expect(s.text).not.toContain("QUEUE")
      expect(s.text).not.toContain("QUEUE HELD")
    } finally {
      s.dispose()
    }
  })

  test("scenario 7: Enter in command during mid-turn enqueues, doesn't send", async () => {
    const s = await busySession()
    try {
      const baseline = s.fake.sent.length
      // Type a follow-up + Enter — mid-turn, so controller.send queues.
      for (const ch of "follow-up") await s.app.press(ch)
      await s.app.press("Enter")
      // Nothing new dispatched.
      expect(s.fake.sent.length).toBe(baseline)
      // Queue is now non-empty → divider appears.
      expect(s.text).toContain("QUEUE")
      // The queued text renders.
      expect(s.text).toContain("follow-up")
      // Now turn-end → auto-flush.
      s.emit(turnEnd("a1"))
      // Re-render to drain microtasks.
      await new Promise<void>((r) => setTimeout(r, 20))
      expect(s.fake.sent.length).toBeGreaterThan(baseline)
      const last = s.fake.sent[s.fake.sent.length - 1]!
      expect(last.payload).toContain("follow-up")
    } finally {
      s.dispose()
    }
  })
})
