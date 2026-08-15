/**
 * Runtime graphics capability probe — km bead 19668 + kitty-probe-env-gated.
 *
 * Env detection (`TERM_PROGRAM`/`TERM`) only GUESSES Kitty-graphics support. A
 * `ghostty`/`kitty` env value can front a sink that cannot actually paint Kitty
 * graphics (a cmux proxy, a captured/piped stream) — and an `<Image>` that
 * trusts the guess dumps raw graphics APC bytes (the welcome escape-flood).
 *
 * The authoritative answer is one runtime transaction: send a tiny `a=q`
 * graphics command followed by a DA1 barrier. Kitty can upgrade or downgrade
 * the env guess; DA1 attribute 4 supplies Sixel from the same response.
 */

import { describe, expect, test } from "vitest"
import {
  KITTY_PROBE_ID,
  parseTerminalGraphicsResponse,
  probeTerminalGraphics,
} from "../src/kitty-graphics-probe"
import { createTerminalProfile, probeTerminalProfile } from "../src/profile"
import type { ProbeInputOwner } from "../src/theme/detect"

const ST = "\x1b\\"
const okResponse = `\x1b_Gi=${KITTY_PROBE_ID};OK${ST}`
const errResponse = `\x1b_Gi=${KITTY_PROBE_ID};ENOTSUPPORTED${ST}`
const da1NoSixel = "\x1b[?62;1;6c"
const da1Sixel = "\x1b[?62;1;4;6c"

/**
 * A fake InputOwner. The graphics probe sends `a=q` plus DA1; this fake feeds
 * it `graphicsResponse` (null = timeout/no-response). Any other query (the OSC
 * theme probe) resolves null so `detectTheme` falls back quickly.
 */
function fakeInput(graphicsResponse: string | null, queries: string[] = []): ProbeInputOwner {
  return {
    async probe<T>(opts: {
      query: string
      parse: (acc: string) => { result: T; consumed: number } | null
      timeoutMs: number
    }): Promise<T | null> {
      queries.push(opts.query)
      if (opts.query.includes("a=q") && opts.query.includes("\x1b[c")) {
        if (graphicsResponse === null) return null
        const parsed = opts.parse(graphicsResponse)
        return parsed ? parsed.result : null
      }
      return null
    },
  }
}

const ghosttyEnv = { TERM: "xterm-256color", TERM_PROGRAM: "ghostty" }
const weztermEnv = { TERM: "xterm-256color", TERM_PROGRAM: "WezTerm" }
const genericEnv = { TERM: "xterm-256color" }
// Minimal TTY stdout shape the profile factory reads (isTTY + dims).
const ttyStdout = { isTTY: true, columns: 80, rows: 24 } as unknown as NonNullable<
  Parameters<typeof createTerminalProfile>[0]
>["stdout"]
const ttyStdin = { isTTY: true, setRawMode() {} }

describe("parseTerminalGraphicsResponse", () => {
  test("Kitty OK plus the DA1 barrier reports Kitty and DA1 attribute 4 reports Sixel", () => {
    const response = `${okResponse}${da1Sixel}`
    expect(parseTerminalGraphicsResponse(response, KITTY_PROBE_ID)).toEqual({
      result: { kittyGraphics: true, sixel: true },
      consumed: response.length,
    })
  })

  test("a Kitty error and DA1 without attribute 4 report no graphics capability", () => {
    expect(
      parseTerminalGraphicsResponse(`${errResponse}${da1NoSixel}`, KITTY_PROBE_ID)?.result,
    ).toEqual({ kittyGraphics: false, sixel: false })
  })

  test("DA1 is the barrier: no Kitty reply is an authoritative false", () => {
    expect(parseTerminalGraphicsResponse(da1NoSixel, KITTY_PROBE_ID)?.result).toEqual({
      kittyGraphics: false,
      sixel: false,
    })
  })

  test("DA1 attribute 4 reports Sixel without manufacturing Kitty support", () => {
    expect(parseTerminalGraphicsResponse(da1Sixel, KITTY_PROBE_ID)?.result).toEqual({
      kittyGraphics: false,
      sixel: true,
    })
  })

  test("waits for the DA1 barrier despite a complete Kitty reply", () => {
    expect(parseTerminalGraphicsResponse(okResponse, KITTY_PROBE_ID)).toBeNull()
    expect(parseTerminalGraphicsResponse("random noise", KITTY_PROBE_ID)).toBeNull()
  })
})

describe("probeTerminalGraphics", () => {
  test("issues one bounded query-only Kitty + DA1 transaction", async () => {
    const queries: string[] = []
    expect(await probeTerminalGraphics(fakeInput(`${okResponse}${da1Sixel}`, queries), 5)).toEqual({
      kittyGraphics: true,
      sixel: true,
    })
    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain("a=q")
    expect(queries[0]).toContain("\x1b[c")
    expect(queries[0]).not.toContain("a=T")
    expect(queries[0]).not.toContain("a=p")
  })

  test("no response (timeout) is an honest no-capability result", async () => {
    expect(await probeTerminalGraphics(fakeInput(null), 5)).toEqual({
      kittyGraphics: false,
      sixel: false,
    })
  })
})

describe("probeTerminalProfile uses the live graphics probe as authority", () => {
  test("sanity: ghostty env alone reports kittyGraphics=true", () => {
    expect(createTerminalProfile({ env: ghosttyEnv, stdout: ttyStdout }).caps.kittyGraphics).toBe(
      true,
    )
  })

  test("a live reply upgrades a deliberately mismatched generic environment", async () => {
    const profile = await probeTerminalProfile({
      env: genericEnv,
      stdout: ttyStdout,
      stdin: ttyStdin,
      input: fakeInput(`${okResponse}${da1Sixel}`),
      timeoutMs: 5,
    })
    expect(profile.caps.kittyGraphics).toBe(true)
    expect(profile.caps.sixel).toBe(true)
  })

  test("probe timeout downgrades Kitty and Sixel env guesses to protect the fallback path", async () => {
    expect(createTerminalProfile({ env: ghosttyEnv, stdout: ttyStdout }).caps.kittyGraphics).toBe(
      true,
    )
    expect(createTerminalProfile({ env: weztermEnv, stdout: ttyStdout }).caps.sixel).toBe(true)

    const ghostty = await probeTerminalProfile({
      env: ghosttyEnv,
      stdout: ttyStdout,
      stdin: ttyStdin,
      input: fakeInput(null),
      timeoutMs: 5,
    })
    const profile = await probeTerminalProfile({
      env: weztermEnv,
      stdout: ttyStdout,
      stdin: ttyStdin,
      input: fakeInput(null),
      timeoutMs: 5,
    })
    expect(ghostty.caps.kittyGraphics).toBe(false)
    expect(profile.caps.sixel).toBe(false)
  })

  test("probeTheme:false remains the documented no-I/O mode", async () => {
    const queries: string[] = []
    const profile = await probeTerminalProfile({
      env: ghosttyEnv,
      stdout: ttyStdout,
      stdin: ttyStdin,
      input: fakeInput(`${okResponse}${da1Sixel}`, queries),
      probeTheme: false,
    })
    expect(profile.caps.kittyGraphics).toBe(true)
    expect(queries).toEqual([])
  })
})
