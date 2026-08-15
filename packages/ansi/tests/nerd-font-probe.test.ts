/**
 * A terminal identity that survives the process environment must be allowed to
 * correct the conservative Nerd Font heuristic. SSH and terminal containers
 * commonly normalize the child environment to TERM=xterm-256color even when
 * the attached Ghostty terminal can render its built-in Nerd Font symbols.
 */

import { describe, expect, test } from "vitest"
import { parseTerminalVersionResponse, probeTerminalProfile } from "@silvery/ansi"
import type { ProbeInputOwner } from "../src/theme/detect"

const XTVERSION_GHOSTTY = "\x1bP>|ghostty(1.2.3)\x1b\\"
const GENERIC_ENV = { TERM: "xterm-256color", COLORTERM: "truecolor" }
const TTY = { isTTY: true, columns: 120, rows: 40 }
const TTY_STDIN = { isTTY: true, setRawMode() {} }

function terminalInput(response: string | null): ProbeInputOwner {
  return {
    async probe<T>(_opts: {
      query: string
      parse: (acc: string) => { result: T; consumed: number } | null
      timeoutMs: number
    }): Promise<T | null> {
      return null
    },
    async probeTransaction<T>(opts: {
      recognize: (acc: string) =>
        | { status: "pending"; consumed: readonly { start: number; end: number }[] }
        | {
            status: "complete"
            consumed: readonly { start: number; end: number }[]
            value: T
          }
    }) {
      if (response === null) return { status: "timeout" }
      const result = opts.recognize(`${response}\x1b[?1;22c`)
      return result.status === "complete"
        ? { status: "complete", value: result.value }
        : { status: "timeout" }
    },
  }
}

describe("probeTerminalProfile — Nerd Font identity", () => {
  test("the shared XTVERSION parser consumes through the matched response", () => {
    const prefixed = `noise${XTVERSION_GHOSTTY}`
    expect(parseTerminalVersionResponse(prefixed)).toEqual({
      result: "ghostty(1.2.3)",
      consumed: prefixed.length,
    })
    expect(parseTerminalVersionResponse("\x1bP>|ghostty(1.2.3)")).toBeNull()
  })

  test("observed Ghostty upgrades a generic SSH/container environment", async () => {
    const profile = await probeTerminalProfile({
      env: GENERIC_ENV,
      stdout: TTY,
      stdin: TTY_STDIN,
      input: terminalInput(XTVERSION_GHOSTTY),
      timeoutMs: 5,
    })

    expect(profile.caps.maybeNerdFont).toBe(true)
  })

  test("an explicit NERDFONT=0 override wins over observed Ghostty", async () => {
    const profile = await probeTerminalProfile({
      env: { ...GENERIC_ENV, NERDFONT: "0" },
      stdout: TTY,
      stdin: TTY_STDIN,
      input: terminalInput(XTVERSION_GHOSTTY),
      timeoutMs: 5,
    })

    expect(profile.caps.maybeNerdFont).toBe(false)
  })

  test("caller-supplied caps stay authoritative over observed Ghostty", async () => {
    const profile = await probeTerminalProfile({
      env: GENERIC_ENV,
      stdout: TTY,
      stdin: TTY_STDIN,
      caps: { maybeNerdFont: false },
      input: terminalInput(XTVERSION_GHOSTTY),
      timeoutMs: 5,
    })

    expect(profile.caps.maybeNerdFont).toBe(false)
  })

  test("no terminal identity response keeps the portable fallback", async () => {
    const profile = await probeTerminalProfile({
      env: GENERIC_ENV,
      stdout: TTY,
      stdin: TTY_STDIN,
      input: terminalInput(null),
      timeoutMs: 5,
    })

    expect(profile.caps.maybeNerdFont).toBe(false)
  })

  test("an observed terminal without guaranteed Nerd symbols stays portable", async () => {
    const profile = await probeTerminalProfile({
      env: GENERIC_ENV,
      stdout: TTY,
      stdin: TTY_STDIN,
      input: terminalInput("\x1bP>|xterm(390)\x1b\\"),
      timeoutMs: 5,
    })

    expect(profile.caps.maybeNerdFont).toBe(false)
  })
})
