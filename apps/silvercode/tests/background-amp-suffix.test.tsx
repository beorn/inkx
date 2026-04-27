/**
 * Trailing '&' submits + backgrounds — Claude Code parity.
 *
 * When the user submits a message ending in `&` (with optional trailing
 * whitespace), silvercode strips the `&`, sends the cleaned text, and
 * immediately backgrounds the in-flight turn so the UI is freed up for
 * the next input.
 *
 * Bead: km-silvercode.background-amp-suffix
 */

import type { AgentEvent, AgentSession, SessionId, TurnId } from "@km/agent-harness"
import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import { App } from "./../src/App.tsx"
import { createFakeSession, type ScriptedFakeSession } from "./../src/test/fake-session.ts"
import { installFakes } from "./../src/test/fake-boundaries.ts"

const COLS = 120
const ROWS = 40
const SESSION = "fake-session-1" as SessionId

const settle = (ms = 100) => new Promise<void>((r) => setTimeout(r, ms))

function turnStart(turnId: string, ts = 1010): AgentEvent {
  return { kind: "turn-start", sessionId: SESSION, turnId: turnId as TurnId, role: "assistant", ts }
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
      model="claude-sonnet-4-6"
      spawnFactory={() => fake as unknown as AgentSession}
    />,
    term,
  )
  await settle(150)
  return { term, fake, handle, fakes }
}

describe("Trailing '&' submit + background", () => {
  test("submitting 'foo &' sends 'foo' and backgrounds the turn", async () => {
    const fake = createFakeSession()
    const { term, handle, fakes } = await bootApp({ fake })
    try {
      // Idle session — the send goes immediately. Type "foo &" + Enter.
      feed(term, "foo &\r")
      await settle(180)

      // The cleaned message ("foo") was sent.
      const userSends = fake.sent.filter((s) => s.type === "user")
      expect(userSends.length).toBeGreaterThanOrEqual(1)
      const last = userSends[userSends.length - 1]!
      expect(last.payload).toBe("foo")

      // Active turn — emit a turn-start so backgroundActiveTurn has
      // something to grab. (We can't observe backgroundActiveTurn
      // directly through term, but we can check the SidePanel "Background"
      // indicator.)
      // Note: backgroundActiveTurn is called immediately after send; if
      // the turn hasn't started yet the controller's idempotency makes
      // it a no-op. To verify the call happened reliably, we simulate a
      // running turn first.
      fake.emit(turnStart("a1"))
      await settle(40)
      // Now type "bar &" — both the strip + background happen in sequence.
      feed(term, "bar &\r")
      await settle(180)
      // Mid-turn so "bar" gets queued (controller queues mid-turn) — but
      // the background call still fires. The SidePanel should show
      // "Background" indicator.
      expect(term.screen).toContainText("Background")
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })

  test("submitting 'foo' (no &) sends 'foo' and does NOT background", async () => {
    const fake = createFakeSession()
    const { term, handle, fakes } = await bootApp({ fake })
    try {
      fake.emit(turnStart("a1"))
      await settle(40)
      // Mid-turn, so "foo" gets queued — not sent. Crucially the
      // SidePanel should NOT show a Background indicator either.
      feed(term, "foo\r")
      await settle(140)
      expect(term.screen).not.toContainText("Background")
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })

  test("'&' alone backgrounds the existing turn without sending", async () => {
    const fake = createFakeSession()
    const { term, handle, fakes } = await bootApp({ fake })
    try {
      fake.emit(turnStart("a1"))
      await settle(40)

      const beforeUserSends = fake.sent.filter((s) => s.type === "user").length
      feed(term, "&\r")
      await settle(180)

      // No new user message dispatched (or queued visibly).
      const afterUserSends = fake.sent.filter((s) => s.type === "user").length
      expect(afterUserSends).toBe(beforeUserSends)

      // SidePanel shows a Background indicator (the turn was backgrounded).
      expect(term.screen).toContainText("Background")
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })

  test("trailing whitespace before '&' is handled — 'foo  &  ' sends 'foo'", async () => {
    const fake = createFakeSession()
    const { term, handle, fakes } = await bootApp({ fake })
    try {
      // Idle send.
      feed(term, "foo  &  \r")
      await settle(180)

      const userSends = fake.sent.filter((s) => s.type === "user")
      expect(userSends.length).toBeGreaterThanOrEqual(1)
      const last = userSends[userSends.length - 1]!
      expect(last.payload).toBe("foo")
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })
})
