import { probeTerminalProfile } from "@silvery/ansi"
import { afterEach, describe, expect, it } from "vitest"
import { createInputOwner } from "../src/runtime/input-owner"

const ST = "\x1b\\"
const KITTY_ACK = `\x1b_Gi=7777;OK${ST}`
const XTVERSION_GHOSTTY = `\x1bP>|ghostty(1.2.3)${ST}`
const DA1_WITH_SIXEL = "\x1b[?1;4;22c"

function createProbeIO(
  responses: readonly string[] = [KITTY_ACK, XTVERSION_GHOSTTY, DA1_WITH_SIXEL],
) {
  const writes: string[] = []
  const dataHandlers = new Set<(chunk: string) => void>()
  let raw = false
  const stdin = {
    isTTY: true,
    get isRaw() {
      return raw
    },
    setRawMode(value: boolean) {
      raw = value
      return stdin
    },
    resume() {},
    pause() {},
    setEncoding() {},
    on(event: string, handler: (chunk: string) => void) {
      if (event === "data") dataHandlers.add(handler)
      return stdin
    },
    off(event: string, handler: (chunk: string) => void) {
      if (event === "data") dataHandlers.delete(handler)
      return stdin
    },
  } as unknown as NodeJS.ReadStream
  const stdout = {
    isTTY: true,
    columns: 120,
    rows: 40,
    write(query: string) {
      writes.push(query)
      if (query.includes("a=q")) {
        for (const response of responses) queueMicrotask(() => deliver(response))
      }
      return true
    },
  } as unknown as NodeJS.WriteStream

  function deliver(chunk: string) {
    for (const handler of dataHandlers) handler(chunk)
  }

  return { stdin, stdout, writes }
}

const owners: Array<ReturnType<typeof createInputOwner>> = []
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose()
})

describe("probeTerminalProfile capability transaction", () => {
  it("retains split Kitty, XTVERSION, and DA1 replies through the real InputOwner", async () => {
    const io = createProbeIO()
    const input = createInputOwner(io.stdin, io.stdout, { enableBracketedPaste: false })
    owners.push(input)

    const profile = await probeTerminalProfile({
      env: { TERM: "xterm-256color", NO_COLOR: "1" },
      stdout: io.stdout,
      stdin: io.stdin,
      input,
      timeoutMs: 50,
    })

    expect(io.writes.filter((query) => query.includes("a=q"))).toHaveLength(1)
    expect(profile.caps.kittyGraphics).toBe(true)
    expect(profile.caps.sixel).toBe(true)
    expect(profile.caps.maybeNerdFont).toBe(true)
    expect(profile.capabilityProvenance).toMatchObject({
      kittyGraphics: "live",
      sixel: "live",
      maybeNerdFont: "live",
    })
  })

  it("treats DA1 without parameter 4 as no evidence and preserves corpus Sixel", async () => {
    const io = createProbeIO(["\x1b[?1;22c"])
    const input = createInputOwner(io.stdin, io.stdout, { enableBracketedPaste: false })
    owners.push(input)

    const profile = await probeTerminalProfile({
      env: { TERM: "xterm-256color", TERM_PROGRAM: "WezTerm", NO_COLOR: "1" },
      stdout: io.stdout,
      stdin: io.stdin,
      input,
      timeoutMs: 50,
    })

    expect(profile.caps.sixel).toBe(true)
    expect(profile.capabilityProvenance.sixel).toBe("corpus")
    expect(profile.caps.kittyGraphics).toBe(false)
    expect(profile.capabilityProvenance.kittyGraphics).toBe("live-da1-barrier")
  })

  it("treats transaction timeout as no evidence and preserves corpus Kitty support", async () => {
    const io = createProbeIO([])
    const input = createInputOwner(io.stdin, io.stdout, { enableBracketedPaste: false })
    owners.push(input)

    const profile = await probeTerminalProfile({
      env: { TERM: "xterm-256color", TERM_PROGRAM: "ghostty", NO_COLOR: "1" },
      stdout: io.stdout,
      stdin: io.stdin,
      input,
      timeoutMs: 5,
    })

    expect(profile.caps.kittyGraphics).toBe(true)
    expect(profile.capabilityProvenance.kittyGraphics).toBe("corpus")
  })

  it("keeps caller-explicit capability values over live positive evidence", async () => {
    const io = createProbeIO()
    const input = createInputOwner(io.stdin, io.stdout, { enableBracketedPaste: false })
    owners.push(input)

    const profile = await probeTerminalProfile({
      env: { TERM: "xterm-256color", NO_COLOR: "1" },
      stdout: io.stdout,
      stdin: io.stdin,
      caps: { kittyGraphics: false, maybeNerdFont: false },
      input,
      timeoutMs: 50,
    })

    expect(profile.caps.kittyGraphics).toBe(false)
    expect(profile.caps.maybeNerdFont).toBe(false)
    expect(profile.capabilityProvenance).toMatchObject({
      kittyGraphics: "explicit",
      maybeNerdFont: "explicit",
      sixel: "live",
    })
  })

  it.each([
    ["probeGraphics:false", { probeGraphics: false }],
    ["probeTheme:false", { probeTheme: false }],
  ] as const)("emits no capability query for %s", async (_label, option) => {
    const io = createProbeIO()
    const input = createInputOwner(io.stdin, io.stdout, { enableBracketedPaste: false })
    owners.push(input)

    await probeTerminalProfile({
      env: { TERM: "xterm-256color", NO_COLOR: "1" },
      stdout: io.stdout,
      stdin: io.stdin,
      input,
      timeoutMs: 50,
      ...option,
    })

    expect(io.writes.filter((query) => query.includes("a=q"))).toEqual([])
  })

  it("emits no capability query when the profile has no input capability", async () => {
    const io = createProbeIO()
    const input = createInputOwner(io.stdin, io.stdout, { enableBracketedPaste: false })
    owners.push(input)

    const profile = await probeTerminalProfile({
      env: { TERM: "xterm-256color", NO_COLOR: "1" },
      stdout: io.stdout,
      stdin: undefined,
      input,
      timeoutMs: 50,
    })

    expect(profile.caps.input).toBe(false)
    expect(io.writes.filter((query) => query.includes("a=q"))).toEqual([])
  })
})
