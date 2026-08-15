/**
 * Runtime Kitty-graphics capability probe — km bead 19668.
 *
 * Env detection (`TERM_PROGRAM`/`TERM`) only GUESSES Kitty-graphics support. A
 * `ghostty`/`kitty` env value can front a sink that cannot actually paint Kitty
 * graphics (a cmux proxy, a captured/piped stream) — and an `<Image>` that
 * trusts the guess dumps raw graphics APC bytes (the welcome escape-flood).
 *
 * Live terminal evidence is gathered in one bounded transaction. An explicit
 * Kitty response can refine the environment corpus in either direction;
 * timeout or an absent response is no evidence and preserves the corpus value.
 */

import { describe, expect, test } from "vitest"
import {
  KITTY_PROBE_ID,
  parseKittyGraphicsResponse,
  probeKittyGraphics,
  recognizeTerminalCapabilityTransaction,
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
    async probeTransaction<T>(opts: {
      recognize: (acc: string) =>
        | { status: "pending"; consumed: readonly { start: number; end: number }[] }
        | {
            status: "complete"
            consumed: readonly { start: number; end: number }[]
            value: T
          }
    }) {
      if (kittyResponse === null) return { status: "timeout" }
      const result = opts.recognize(`${kittyResponse}\x1b[?1;22c`)
      return result.status === "complete"
        ? { status: "complete", value: result.value }
        : { status: "timeout" }
    },
  }
}

const ghosttyEnv = { TERM: "xterm-256color", TERM_PROGRAM: "ghostty" }
// Minimal TTY stdout shape the profile factory reads (isTTY + dims).
const ttyStdout = { isTTY: true, columns: 80, rows: 24 } as unknown as NonNullable<
  Parameters<typeof createTerminalProfile>[0]
>["stdout"]
const ttyStdin = { isTTY: true, setRawMode() {} } as unknown as NonNullable<
  Parameters<typeof createTerminalProfile>[0]
>["stdin"]

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

describe("recognizeTerminalCapabilityTransaction", () => {
  test("returns exact spans for interleaved Kitty, XTVERSION, and DA1 responses", () => {
    const version = "\x1bP>|ghostty(1.2.3)\x1b\\"
    const da1 = "\x1b[?1;4;22c"
    const buffer = `j${okResponse}k${version}m${da1}`

    expect(recognizeTerminalCapabilityTransaction(buffer, KITTY_PROBE_ID)).toEqual({
      status: "complete",
      consumed: [
        { start: 1, end: 1 + okResponse.length },
        {
          start: 2 + okResponse.length,
          end: 2 + okResponse.length + version.length,
        },
        {
          start: 3 + okResponse.length + version.length,
          end: buffer.length,
        },
      ],
      value: {
        kittyGraphics: true,
        sixel: true,
        terminalVersion: "ghostty(1.2.3)",
      },
    })
  })

  test("DA1 without parameter 4 completes with no Sixel evidence", () => {
    const da1 = "\x1b[?1;22c"
    expect(recognizeTerminalCapabilityTransaction(`${okResponse}${da1}`, KITTY_PROBE_ID)).toEqual({
      status: "complete",
      consumed: [
        { start: 0, end: okResponse.length },
        { start: okResponse.length, end: okResponse.length + da1.length },
      ],
      value: {
        kittyGraphics: true,
        sixel: undefined,
        terminalVersion: undefined,
      },
    })
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

describe("probeTerminalProfile refines corpus kittyGraphics from live evidence", () => {
  test("sanity: ghostty env alone reports kittyGraphics=true", () => {
    expect(createTerminalProfile({ env: ghosttyEnv, stdout: ttyStdout }).caps.kittyGraphics).toBe(
      true,
    )
  })

  test("probe OK keeps kittyGraphics=true on a ghostty env", async () => {
    const profile = await probeTerminalProfile({
      env: ghosttyEnv,
      stdout: ttyStdout,
      stdin: ttyStdin,
      input: fakeInput(okResponse),
      timeoutMs: 5,
    })
    expect(profile.caps.kittyGraphics).toBe(true)
  })

  test("an explicit negative Kitty response overrides the positive corpus", async () => {
    const profile = await probeTerminalProfile({
      env: ghosttyEnv,
      stdout: ttyStdout,
      stdin: ttyStdin,
      input: fakeInput(errResponse),
      timeoutMs: 5,
    })
    expect(profile.caps.kittyGraphics).toBe(false)
    expect(profile.capabilityProvenance.kittyGraphics).toBe("live")
  })

  test("probe timeout is no evidence and preserves positive corpus support", async () => {
    const profile = await probeTerminalProfile({
      env: ghosttyEnv,
      stdout: ttyStdout,
      stdin: ttyStdin,
      input: fakeInput(null),
      timeoutMs: 5,
    })
    expect(profile.caps.kittyGraphics).toBe(true)
    expect(profile.capabilityProvenance.kittyGraphics).toBe("corpus")
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
