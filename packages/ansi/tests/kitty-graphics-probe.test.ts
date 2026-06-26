/**
 * Runtime Kitty-graphics capability probe — km bead 19668.
 *
 * Env detection (`TERM_PROGRAM`/`TERM`) only GUESSES Kitty-graphics support. A
 * `ghostty`/`kitty` env value can front a sink that cannot actually paint Kitty
 * graphics (a cmux proxy, a captured/piped stream) — and an `<Image>` that
 * trusts the guess dumps raw graphics APC bytes (the welcome escape-flood).
 *
 * The authoritative answer is a runtime query: send a tiny `a=q` graphics
 * command and wait for the terminal's `\x1b_Gi=<id>;OK\x1b\` acknowledgement.
 * `probeTerminalProfile` uses it to CONFIRM an env-claimed `kittyGraphics`,
 * downgrading to `false` on no/failed response (the safe direction).
 */

import { describe, expect, test } from "vitest"
import {
  KITTY_PROBE_ID,
  parseKittyGraphicsResponse,
  probeKittyGraphics,
} from "../src/kitty-graphics-probe"
import { createTerminalProfile, probeTerminalProfile } from "../src/profile"
import type { ProbeInputOwner } from "../src/theme/detect"

const ST = "\x1b\\"
const okResponse = `\x1b_Gi=${KITTY_PROBE_ID};OK${ST}`
const errResponse = `\x1b_Gi=${KITTY_PROBE_ID};ENOTSUPPORTED${ST}`

/**
 * A fake InputOwner. The kitty probe sends a query containing `a=q`; this fake
 * feeds it `kittyResponse` (null = timeout/no-response). Any OTHER query (the
 * OSC theme probe) resolves null so `detectTheme` falls back quickly.
 */
function fakeInput(kittyResponse: string | null): ProbeInputOwner {
  return {
    async probe<T>(opts: {
      query: string
      parse: (acc: string) => { result: T; consumed: number } | null
      timeoutMs: number
    }): Promise<T | null> {
      if (opts.query.includes("a=q")) {
        if (kittyResponse === null) return null
        const parsed = opts.parse(kittyResponse)
        return parsed ? parsed.result : null
      }
      return null
    },
  }
}

const ghosttyEnv = { TERM: "xterm-256color", TERM_PROGRAM: "ghostty" }
// Minimal TTY stdout shape the profile factory reads (isTTY + dims).
const ttyStdout = { isTTY: true, columns: 80, rows: 24 } as unknown as NonNullable<
  Parameters<typeof createTerminalProfile>[0]
>["stdout"]

describe("parseKittyGraphicsResponse", () => {
  test("an OK ack for our id → supported", () => {
    expect(parseKittyGraphicsResponse(okResponse, KITTY_PROBE_ID)).toEqual({
      result: true,
      consumed: okResponse.length,
    })
  })

  test("a non-OK (error) ack for our id → parsed-but-unsupported", () => {
    expect(parseKittyGraphicsResponse(errResponse, KITTY_PROBE_ID)?.result).toBe(false)
  })

  test("no response for our id → null (keep waiting)", () => {
    expect(parseKittyGraphicsResponse("random noise", KITTY_PROBE_ID)).toBeNull()
    // Different id is not ours.
    expect(parseKittyGraphicsResponse(`\x1b_Gi=999;OK${ST}`, KITTY_PROBE_ID)).toBeNull()
  })

  test("prefix present but terminator not yet arrived → null (partial)", () => {
    expect(parseKittyGraphicsResponse(`\x1b_Gi=${KITTY_PROBE_ID};OK`, KITTY_PROBE_ID)).toBeNull()
  })
})

describe("probeKittyGraphics", () => {
  test("OK ack → true", async () => {
    expect(await probeKittyGraphics(fakeInput(okResponse), 5)).toBe(true)
  })
  test("error ack → false", async () => {
    expect(await probeKittyGraphics(fakeInput(errResponse), 5)).toBe(false)
  })
  test("no response (timeout) → undefined", async () => {
    expect(await probeKittyGraphics(fakeInput(null), 5)).toBeUndefined()
  })
})

describe("probeTerminalProfile confirms env-claimed kittyGraphics via the probe", () => {
  test("sanity: ghostty env alone reports kittyGraphics=true", () => {
    expect(createTerminalProfile({ env: ghosttyEnv, stdout: ttyStdout }).caps.kittyGraphics).toBe(
      true,
    )
  })

  test("probe OK keeps kittyGraphics=true on a ghostty env", async () => {
    const profile = await probeTerminalProfile({
      env: ghosttyEnv,
      stdout: ttyStdout,
      input: fakeInput(okResponse),
      timeoutMs: 5,
    })
    expect(profile.caps.kittyGraphics).toBe(true)
  })

  test("probe timeout DOWNGRADES kittyGraphics to false despite ghostty env (the cmux fix)", async () => {
    const profile = await probeTerminalProfile({
      env: ghosttyEnv,
      stdout: ttyStdout,
      input: fakeInput(null),
      timeoutMs: 5,
    })
    expect(profile.caps.kittyGraphics).toBe(false)
  })

  test("no input owner → cannot probe → env value preserved (no behavior change)", async () => {
    const profile = await probeTerminalProfile({
      env: ghosttyEnv,
      stdout: ttyStdout,
      probeTheme: false,
    })
    expect(profile.caps.kittyGraphics).toBe(true)
  })
})
