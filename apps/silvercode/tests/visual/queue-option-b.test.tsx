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
import { describe, expect, test } from "vitest"
import { renderScenario } from "../../src/test/render-harness.tsx"
import { welcome } from "../../src/test/scripts/welcome.ts"

const COLS = 120
const ROWS = 30
const SESSION = "fake-session-1" as SessionId

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

/**
 * Drive the welcome script + a turn-start so the session is in a
 * "thinking" state — that's the realistic context for a queue UX (user
 * types a follow-up while Claude is still working).
 */
async function busySession(opts: { initialQueue?: string } = {}) {
  const s = await renderScenario({ script: welcome, cols: COLS, rows: ROWS })
  // Move to mid-turn so subsequent sends queue instead of dispatching
  // immediately.
  s.emit(turnStart("a1"))
  // Seed the queue if requested. The harness uses the sole spawned
  // session; controller is not exposed directly, so we drive setQueuedText
  // through the public path: a single send while non-idle goes to queue.
  if (opts.initialQueue) {
    // Multiple sends, joined via controller's "\n\n" wire format.
    const lines = opts.initialQueue.split("\n\n")
    // We can't access controller directly, but we can reach it via the
    // App's controllerRef indirectly. Simplest: dispatch each line as a
    // user keypress through the command TextArea + Enter, which routes
    // to handleSubmit → controller.send → queue (because mid-turn).
    //
    // App.tsx's handleSubmit has a 50ms dedupe guard against
    // double-Enter from palette+TextInput racing. Tests press faster
    // than that, so we wait between Enters.
    for (const line of lines) {
      // The default app starts with focusedRegion="command" and an
      // empty TextArea. Simulate typing each char then Enter.
      for (const ch of line) {
        await s.app.press(ch)
      }
      await s.app.press("Enter")
      await new Promise<void>((r) => setTimeout(r, 60))
    }
  }
  return s
}

describe("Option B queue — focus handoff and Enter semantics", () => {
  test("scenario 1: empty queue → divider hidden, no QUEUE label visible", async () => {
    const s = await renderScenario({ script: welcome, cols: COLS, rows: ROWS })
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

  test("scenario 3: Up at top of command with non-empty queue → divider flips to QUEUE HELD", async () => {
    const s = await busySession({ initialQueue: "queued-entry" })
    try {
      // Sanity: starts with command region focused → "QUEUE" label.
      expect(s.text).toContain("QUEUE")
      expect(s.text).not.toContain("QUEUE HELD")
      // Press Up at the top of the (empty) command TextArea — silvery's
      // onEdge fires "top", CommandBox calls onFocusRegion("queue").
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

  test("scenario 5: empty queue + Up at top of command → no swap (label stays absent)", async () => {
    const s = await renderScenario({ script: welcome, cols: COLS, rows: ROWS })
    try {
      // No queue, command empty. Press Up — onEdge fires "top" but
      // CommandBox short-circuits because hasQueue is false; no focus
      // change, divider absent.
      await s.app.press("ArrowUp")
      expect(s.text).not.toContain("QUEUE")
      expect(s.text).not.toContain("QUEUE HELD")
    } finally {
      s.dispose()
    }
  })

  test("scenario 6: Enter in queue region force-flushes the buffer", async () => {
    const s = await busySession({ initialQueue: "one\n\ntwo\n\nthree" })
    try {
      // Sanity — the seeding sends were queued (mid-turn), nothing
      // dispatched yet beyond what the welcome/turn-start flow itself
      // produces. We capture the baseline send count.
      const baseline = s.fake.sent.length
      // Enter queue region.
      await s.app.press("ArrowUp")
      expect(s.text).toContain("QUEUE HELD")
      // Enter in queue → onQueueSubmit → controller.flushQueue. With
      // submitKey="enter" silvery's TextArea emits onSubmit on a bare
      // Enter (Shift+Enter is a newline).
      await s.app.press("Enter")
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
