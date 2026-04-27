/**
 * Pane chord prefix — Ctrl+G must reach the App-level useInput handler
 * even when SessionPromptComposer/TextArea owns focus.
 *
 * History: the chord was originally Ctrl+W (vim-window convention), but
 * silvery's TextArea + useReadline consume Ctrl+W as readline word-
 * delete-backwards (vendor/silvery/.../readline-ops.ts:131) BEFORE
 * App-level useInput sees it. Since SessionPromptComposer owns focus by default,
 * Ctrl+W never reached the chord handler. Switching to Ctrl+G — which
 * is not consumed by any TextArea/Readline binding — leaks the chord
 * through cleanly. Bead: km-silvercode.ctrl-w-blocked-by-textarea.
 *
 * This test simulates "Ctrl+G v" with the SessionPromptComposer focused (default)
 * and asserts a second session is spawned (= the vsplit chord fired).
 * The OLD behaviour with Ctrl+W typed `v` into the input box and never
 * spawned anything.
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
const CTRL_G = "\x07"
const CTRL_W = "\x17"

const settle = (ms = 100) => new Promise<void>((r) => setTimeout(r, ms))

type TermlessTerm = ReturnType<typeof createTermless>

function feed(term: TermlessTerm, data: string): void {
  ;(term as unknown as { sendInput: (s: string) => void }).sendInput(data)
}

async function bootApp(): Promise<{
  term: TermlessTerm
  fake: ScriptedFakeSession
  spawnCount: { value: number }
  handle: Awaited<ReturnType<typeof run>>
  fakes: ReturnType<typeof installFakes>
}> {
  const fakes = installFakes({})
  const fake = createFakeSession({ sessionId: SESSION })
  const spawnCount = { value: 0 }
  const term = createTermless({ cols: COLS, rows: ROWS })
  const handle = await run(
    <App
      cwd="/tmp/silvercode-test-chord"
      bare
      layout="single"
      model="claude-sonnet-4-6"
      spawnFactory={() => {
        spawnCount.value += 1
        // Each split spawns a new fake; first call returns the primary
        // session, subsequent calls return fresh fakes so PaneGrid can
        // mount each pane with its own handle.
        if (spawnCount.value === 1) return fake as unknown as AgentSession
        return createFakeSession({
          sessionId: `fake-session-${spawnCount.value}` as SessionId,
        }) as unknown as AgentSession
      }}
    />,
    term,
  )
  await settle(150)
  return { term, fake, spawnCount, handle, fakes }
}

describe("pane chord (Ctrl+G)", () => {
  test("Ctrl+G v spawns a second session (vsplit)", async () => {
    const { term, spawnCount, handle, fakes } = await bootApp()
    try {
      // Sanity: only the initial session was spawned at boot.
      expect(spawnCount.value).toBe(1)

      // Ctrl+G arms the chord.
      feed(term, CTRL_G)
      await settle(80)
      // `v` resolves the chord → splitFocusedPane("row") → spawnSession.
      feed(term, "v")
      await settle(200)

      expect(spawnCount.value).toBe(2)
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })

  test("Ctrl+G s spawns a second session (hsplit)", async () => {
    const { term, spawnCount, handle, fakes } = await bootApp()
    try {
      expect(spawnCount.value).toBe(1)
      feed(term, CTRL_G)
      await settle(80)
      feed(term, "s")
      await settle(200)
      expect(spawnCount.value).toBe(2)
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })

  test("plain v without chord prefix does NOT spawn (typed into input)", async () => {
    const { term, spawnCount, handle, fakes } = await bootApp()
    try {
      expect(spawnCount.value).toBe(1)
      feed(term, "v")
      await settle(200)
      expect(spawnCount.value).toBe(1)
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })

  test("Ctrl+W (the OLD chord prefix) does NOT spawn — TextArea ate it", async () => {
    // Regression guard: this is the symptom the rebind fixed. With Ctrl+W,
    // silvery's readline word-delete consumes the keystroke before App-
    // level useInput sees it, so the chord never arms and `v` lands in
    // the input box as a plain character. If this assertion ever flips
    // (Ctrl+W starts spawning), it means TextArea stopped consuming
    // Ctrl+W — re-evaluate whether to switch back to Ctrl+W.
    const { term, spawnCount, handle, fakes } = await bootApp()
    try {
      expect(spawnCount.value).toBe(1)
      feed(term, CTRL_W)
      await settle(80)
      feed(term, "v")
      await settle(200)
      expect(spawnCount.value).toBe(1)
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })
})
