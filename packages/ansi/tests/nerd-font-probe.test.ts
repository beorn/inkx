/**
 * A terminal identity that survives the process environment must be allowed to
 * correct the conservative Nerd Font heuristic. SSH and terminal containers
 * commonly normalize the child environment to TERM=xterm-256color even when
 * the attached Ghostty terminal can render its built-in Nerd Font symbols.
 */

import { describe, expect, test } from "vitest"
import { parseTerminalVersionResponse, probeTerminalProfile, XTVERSION_QUERY } from "@silvery/ansi"
import type { ProbeInputOwner } from "../src/theme/detect"

const XTVERSION_GHOSTTY = "\x1bP>|ghostty(1.2.3)\x1b\\"
const GENERIC_ENV = { TERM: "xterm-256color", COLORTERM: "truecolor" }
const TTY = { isTTY: true, columns: 120, rows: 40 }

function terminalInput(response: string | null): ProbeInputOwner {
  return {
    async probe<T>(opts: {
      query: string
      parse: (acc: string) => { result: T; consumed: number } | null
      timeoutMs: number
    }): Promise<T | null> {
      if (opts.query !== XTVERSION_QUERY || response === null) return null
      return opts.parse(response)?.result ?? null
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
      input: terminalInput(XTVERSION_GHOSTTY),
      timeoutMs: 5,
    })

    expect(profile.caps.maybeNerdFont).toBe(true)
  })

  test("an explicit NERDFONT=0 override wins over observed Ghostty", async () => {
    const profile = await probeTerminalProfile({
      env: { ...GENERIC_ENV, NERDFONT: "0" },
      stdout: TTY,
      input: terminalInput(XTVERSION_GHOSTTY),
      timeoutMs: 5,
    })

    expect(profile.caps.maybeNerdFont).toBe(false)
  })

  test("caller-supplied caps stay authoritative over observed Ghostty", async () => {
    const profile = await probeTerminalProfile({
      env: GENERIC_ENV,
      stdout: TTY,
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
      input: terminalInput(null),
      timeoutMs: 5,
    })

    expect(profile.caps.maybeNerdFont).toBe(false)
  })

  test("an observed terminal without guaranteed Nerd symbols stays portable", async () => {
    const profile = await probeTerminalProfile({
      env: GENERIC_ENV,
      stdout: TTY,
      input: terminalInput("\x1bP>|xterm(390)\x1b\\"),
      timeoutMs: 5,
    })

    expect(profile.caps.maybeNerdFont).toBe(false)
  })
})
