/**
 * Trailing '&' is no longer a Silvercode backgrounding shortcut.
 *
 * The old shim stripped the suffix and tried to background the active provider
 * turn. That only worked for text-only turns, so `&` now stays part of the
 * prompt text until backgrounding is backed by a real provider job id.
 *
 * Bead: km-silvercode.background-amp-suffix
 */

import type { AgentEvent, AgentSession, SessionId, TurnId } from "@km/agent-harness"
import React from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import { App } from "./../src/App.tsx"
import { createFakeSession, type ScriptedFakeSession } from "./../src/test/fake-session.ts"
import { installFakes } from "./../src/test/fake-boundaries.ts"

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

describe("Trailing '&' submit", () => {
  test("submitting 'foo &' sends the literal prompt and does not background", async () => {
    const fake = createFakeSession()
    const { term, handle, fakes } = await bootApp({ fake })
    try {
      feed(term, "foo &\r")
      await settle(180)

      const userSends = fake.sent.filter((s) => s.type === "user")
      expect(userSends.length).toBeGreaterThanOrEqual(1)
      const last = userSends[userSends.length - 1]!
      expect(last.payload).toBe("foo &")

      fake.emit(turnStart("a1"))
      await settle(40)
      feed(term, "bar &\r")
      await settle(180)
      expect(fake.sent[fake.sent.length - 1]!.payload).toBe("bar &")
      expect(term.screen).not.toContainText("Background")
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
      feed(term, "foo\r")
      await settle(140)
      expect(fake.sent[fake.sent.length - 1]!.payload).toBe("foo")
      expect(term.screen).not.toContainText("Background")
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })

  test("'&' alone is submitted literally", async () => {
    const fake = createFakeSession()
    const { term, handle, fakes } = await bootApp({ fake })
    try {
      fake.emit(turnStart("a1"))
      await settle(40)

      feed(term, "&\r")
      await settle(180)

      expect(fake.sent[fake.sent.length - 1]!.payload).toBe("&")
      expect(term.screen).not.toContainText("Background")
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })

  test("trailing whitespace is trimmed but '&' remains prompt text", async () => {
    const fake = createFakeSession()
    const { term, handle, fakes } = await bootApp({ fake })
    try {
      feed(term, "foo  &  \r")
      await settle(180)

      const userSends = fake.sent.filter((s) => s.type === "user")
      expect(userSends.length).toBeGreaterThanOrEqual(1)
      const last = userSends[userSends.length - 1]!
      expect(last.payload).toBe("foo  &")
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })
})
