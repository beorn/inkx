/**
 * Ctrl-B disabled background flow — termless interaction tests.
 *
 * Drives the real silvercode `<App/>` through `createTermless` (xterm.js
 * emulator) for end-to-end coverage of the disabled Ctrl-B background-job
 * shim:
 *
 *   - Ctrl-B during a running job does not create a fake background job.
 *   - New prompts can still be submitted during active output because stdin
 *     writes are allowed after turn-start acknowledgement.
 *
 * Companion to controller.ts unit tests — this exercises the full wiring
 * from key handler → controller → store → ChatBlockList + SidePanel.
 */

import type { AgentEvent, AgentSession, SessionId, TurnId } from "@km/agent-harness"
import React from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import { App } from "../../src/App.tsx"
import { createFakeSession, type ScriptedFakeSession } from "../../src/test/fake-session.ts"
import { installFakes } from "../../src/test/fake-boundaries.ts"

const COLS = 120
const ROWS = 40
const SESSION = "fake-session-1" as SessionId
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

const settle = (ms = 100) => new Promise<void>((r) => setTimeout(r, ms))

function turnStart(turnId: string, ts = 1010): AgentEvent {
  return { kind: "turn-start", sessionId: SESSION, turnId: turnId as TurnId, role: "assistant", ts }
}

function textDelta(turnId: string, text: string, ts = 1015): AgentEvent {
  return { kind: "text-delta", sessionId: SESSION, turnId: turnId as TurnId, blockIndex: 0, text, ts }
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

// Send Ctrl-B to the terminal — `\x02` is the byte the terminal driver
// produces when the user presses Ctrl-B (ASCII 0x02 = STX).
const CTRL_B = "\x02"

describe("Ctrl-B disabled background flow", () => {
  test("Ctrl-B during a running job does not create a background indicator", async () => {
    const fake = createFakeSession()
    const { term, handle, fakes } = await bootApp({ fake })
    try {
      fake.emit(turnStart("a1"))
      fake.emit(textDelta("a1", "Reticulating splines\n"))
      await settle(60)

      expect(term.screen).not.toContainText("Background")

      feed(term, CTRL_B)
      await settle(80)

      expect(term.screen).not.toContainText("Background")

      const beforeSends = fake.sent.length
      feed(term, "after-ctrl-b\r")
      await settle(120)
      expect(fake.sent.length).toBe(beforeSends + 1)
      expect(fake.sent[fake.sent.length - 1]!.payload).toBe("after-ctrl-b")
      expect(term.screen).not.toContainText("QUEUE")
      expect(term.screen).not.toContainText("[bg]")
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })

  test("Ctrl-B does not alter foreground streaming", async () => {
    const fake = createFakeSession()
    const { term, handle, fakes } = await bootApp({ fake })
    try {
      fake.emit(turnStart("a1"))
      fake.emit(textDelta("a1", "Still running\n"))
      await settle(60)

      feed(term, CTRL_B)
      await settle(80)
      fake.emit(textDelta("a1", "Still foreground\n"))
      await settle(80)

      expect(term.screen).not.toContainText("Background")
      expect(term.screen).toContainText("Still foreground")
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })

  test("Ctrl-B is a no-op when the session is idle (no active turn)", async () => {
    const fake = createFakeSession()
    const { term, handle, fakes } = await bootApp({ fake })
    try {
      // No turn-start emitted — session is idle.
      feed(term, CTRL_B)
      await settle(80)
      // No Background row should appear — Ctrl-B was a no-op.
      expect(term.screen).not.toContainText("Background")
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })
})
