/**
 * Queue editor — termless interaction tests.
 *
 * Drives the real silvercode `<App/>` through `createTermless` (xterm.js
 * emulator) for ANSI-faithful coverage of the queue / command flow:
 *
 *   - Enter in command during mid-turn → enqueues (no new send)
 *   - Enter in queue (after Up to focus the queue) → force-flushes the
 *     entire buffer as ONE user message joined by "\n\n"
 *   - turn-end → controller auto-flushes any pending queue
 *   - QUEUE / QUEUE HELD divider chrome flips with focus
 *
 * These complement `queue-option-b.test.tsx` (createRenderer harness).
 * The termless path exercises real input parsing + ANSI output, so it
 * catches a different class of regression.
 *
 * Cursor-position assertions (e.g. "cursor x is inside command region")
 * are blocked on a separate gap: silvery's emulator-backed run() resolves
 * `nonTTYMode` to "line-by-line" because the internal stdout doesn't
 * report `isTTY: true`. In line-by-line mode the scheduler suppresses
 * the cursor-positioning ANSI escape (`scheduler.ts:568`), so xterm.js
 * never receives the move and `term.getCursor()` returns the post-write
 * stream position instead of silvery's intent. Bead:
 * `km-silvercode.test-process-harness` (process harness) tracks the
 * fix that lets termless tests assert cursor visibility + position.
 */

import type { AgentEvent, AgentSession, SessionId, TurnId } from "@km/agent-harness"
import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import { App } from "../../src/App.tsx"
import { createFakeSession, type ScriptedFakeSession } from "../../src/test/fake-session.ts"
import { installFakes } from "../../src/test/fake-boundaries.ts"

const COLS = 120
const ROWS = 40
const SESSION = "fake-session-1" as SessionId

const settle = (ms = 100) => new Promise<void>((r) => setTimeout(r, ms))

function turnStart(turnId: string, ts = 1010): AgentEvent {
  return { kind: "turn-start", sessionId: SESSION, turnId: turnId as TurnId, role: "assistant", ts }
}

function turnEnd(turnId: string, ts = 1020): AgentEvent {
  return { kind: "turn-end", sessionId: SESSION, turnId: turnId as TurnId, stopReason: "end_turn", ts }
}

type TermlessTerm = ReturnType<typeof createTermless>

function feed(term: TermlessTerm, data: string): void {
  ;(term as unknown as { sendInput: (s: string) => void }).sendInput(data)
}

async function bootApp(opts: { fake?: ScriptedFakeSession } = {}): Promise<{
  term: TermlessTerm
  fake: ScriptedFakeSession
  handle: Awaited<ReturnType<typeof run>>
  fakes: ReturnType<typeof installFakes>
}> {
  const fakes = installFakes({})
  const fake = opts.fake ?? createFakeSession()
  const term = createTermless({ cols: COLS, rows: ROWS })
  const handle = await run(
    <App
      cwd="/tmp/silvercode-test"
      bare
      layout="single"
      track="claude"
      model="claude-sonnet-4-6"
      spawnFactory={() => fake as unknown as AgentSession}
    />,
    term,
  )
  // Boot: spawnSession resolves on a microtask; welcome screen wants
  // a few render passes to settle.
  await settle(150)
  return { term, fake, handle, fakes }
}

describe("queue editor — termless interaction", () => {
  test("Enter in command during mid-turn enqueues (no new send)", async () => {
    const fake = createFakeSession()
    const { term, handle, fakes } = await bootApp({ fake })
    try {
      fake.emit(turnStart("a1"))
      await settle(40)
      const baseline = fake.sent.length
      feed(term, "first\r")
      await settle(120)
      // No new send — queued instead.
      expect(fake.sent.length).toBe(baseline)
      // Queue divider visible.
      expect(term.screen).toContainText("QUEUE")
      expect(term.screen).toContainText("first")
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })

  test("Enter in queue force-flushes the entire buffer as one send", async () => {
    const fake = createFakeSession()
    const { term, handle, fakes } = await bootApp({ fake })
    try {
      fake.emit(turnStart("a1"))
      await settle(40)
      // Queue three entries by submitting mid-turn.
      feed(term, "one\r")
      await settle(80)
      feed(term, "two\r")
      await settle(80)
      feed(term, "three\r")
      await settle(80)
      const baseline = fake.sent.length
      // ArrowUp at top of (now-empty) command → focus moves to queue.
      // ArrowUp x2 to climb past mid-queue and trigger boundary.
      feed(term, "\x1b[A")
      await settle(60)
      // Enter in queue region → onQueueSubmit → controller.flushQueue.
      feed(term, "\r")
      await settle(180)
      // Exactly one new send dispatched, joined by "\n\n".
      expect(fake.sent.length).toBe(baseline + 1)
      const last = fake.sent[fake.sent.length - 1]!
      expect(last.type).toBe("user")
      expect(last.payload).toBe("one\n\ntwo\n\nthree")
      // Queue empty → divider gone.
      expect(term.screen).not.toContainText("QUEUE")
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })

  test("turn-end auto-flushes queued entries", async () => {
    const fake = createFakeSession()
    const { term, handle, fakes } = await bootApp({ fake })
    try {
      fake.emit(turnStart("a1"))
      await settle(40)
      feed(term, "auto-flush-me\r")
      await settle(120)
      const baseline = fake.sent.length
      // turn-end → controller's onTurnEnd flushes the queue.
      fake.emit(turnEnd("a1"))
      await settle(180)
      expect(fake.sent.length).toBeGreaterThan(baseline)
      const last = fake.sent[fake.sent.length - 1]!
      expect(last.type).toBe("user")
      expect(String(last.payload)).toContain("auto-flush-me")
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })
})
