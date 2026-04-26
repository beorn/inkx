/**
 * Ctrl+D×2 quit — App-level chord detection.
 *
 * Help text says `ctrl-d ctrl-d → exit silvercode`. Before this test, the
 * actual implementation was an empty-Enter ×2 chord inside CommandBox; the
 * literal Ctrl+D byte (`\x04`) never reached the exit path. The fix wires
 * a useInput branch in App.tsx that arms a 1500ms window on the first
 * Ctrl+D and calls `requestExit()` on the second.
 *
 * Bead: km-silvercode.ctrl-d-quit
 */

import type { AgentSession, SessionId } from "@km/agent-harness"
import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import { App } from "../src/App.tsx"
import { createFakeSession, type ScriptedFakeSession } from "../src/test/fake-session.ts"
import { installFakes } from "../src/test/fake-boundaries.ts"

const COLS = 120
const ROWS = 40
const SESSION = "fake-session-1" as SessionId
const CTRL_D = "\x04"

const settle = (ms = 100) => new Promise<void>((r) => setTimeout(r, ms))

type TermlessTerm = ReturnType<typeof createTermless>

function feed(term: TermlessTerm, data: string): void {
  ;(term as unknown as { sendInput: (s: string) => void }).sendInput(data)
}

async function bootApp(): Promise<{
  term: TermlessTerm
  fake: ScriptedFakeSession
  handle: Awaited<ReturnType<typeof run>>
  fakes: ReturnType<typeof installFakes>
}> {
  const fakes = installFakes({})
  const fake = createFakeSession({ sessionId: SESSION })
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
  await settle(150)
  return { term, fake, handle, fakes }
}

describe("Ctrl+D×2 quit", () => {
  test("first Ctrl+D arms; second within 1500ms exits", async () => {
    const { term, handle, fakes } = await bootApp()
    let exited = false
    handle.waitUntilExit().then(() => {
      exited = true
    })
    try {
      // First Ctrl+D — should arm the chord without exiting.
      feed(term, CTRL_D)
      await settle(80)
      expect(exited).toBe(false)

      // Second Ctrl+D within 1500ms — should call requestExit().
      feed(term, CTRL_D)
      // Exit teardown is async — give it time to flush.
      await settle(300)
      expect(exited).toBe(true)
    } finally {
      if (!exited) handle.unmount()
      fakes.dispose()
    }
  })

  test("single Ctrl+D does not exit", async () => {
    const { term, handle, fakes } = await bootApp()
    let exited = false
    handle.waitUntilExit().then(() => {
      exited = true
    })
    try {
      feed(term, CTRL_D)
      await settle(200)
      // Single press only arms — the app stays alive.
      expect(exited).toBe(false)
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })

  test("intervening keystroke resets the arm; following Ctrl+D only re-arms", async () => {
    const { term, handle, fakes } = await bootApp()
    let exited = false
    handle.waitUntilExit().then(() => {
      exited = true
    })
    try {
      // Arm with first Ctrl+D.
      feed(term, CTRL_D)
      await settle(80)
      // Intervening character — resets the arm.
      feed(term, "a")
      await settle(80)
      // Now a single Ctrl+D should only arm again, NOT exit.
      feed(term, CTRL_D)
      await settle(200)
      expect(exited).toBe(false)
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })
})
