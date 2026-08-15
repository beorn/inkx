import EventEmitter from "node:events"
import React, { useContext } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { Image, Text } from "../../src/index.js"
import { TermContext } from "../../packages/ag-react/src/context"
import { createTerm } from "../../packages/ag-term/src/ansi/term"
import { run } from "../../packages/ag-term/src/runtime/run"

const ST = "\x1b\\"
const CAPABILITY_RESPONSE = `\x1b_Gi=7777;OK${ST}\x1bP>|ghostty(1.2.3)${ST}\x1b[?1;4;22c`
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGIAAQAABQABDQottAAAAABJRU5ErkJggg==",
  "base64",
)

function createProbeTTY(capabilityResponse: string | null = CAPABILITY_RESPONSE): {
  stdin: NodeJS.ReadStream
  stdout: NodeJS.WriteStream
  writes: string[]
} {
  const stdinEmitter = new EventEmitter()
  const stdoutEmitter = new EventEmitter()
  const writes: string[] = []
  let raw = false

  const stdin = Object.assign(stdinEmitter, {
    isTTY: true,
    get isRaw() {
      return raw
    },
    setRawMode(next: boolean) {
      raw = next
      return stdin
    },
    resume() {},
    pause() {},
    setEncoding() {},
  }) as unknown as NodeJS.ReadStream

  const stdout = Object.assign(stdoutEmitter, {
    isTTY: true,
    columns: 80,
    rows: 24,
    write(data: string | Uint8Array) {
      const text = typeof data === "string" ? data : new TextDecoder().decode(data)
      writes.push(text)
      if (text.includes("a=q") && capabilityResponse !== null) {
        queueMicrotask(() => stdinEmitter.emit("data", capabilityResponse))
      }
      if (text.includes("\x1b]11;?")) {
        queueMicrotask(() => stdinEmitter.emit("data", "\x1b]11;rgb:0000/0000/0000\x07"))
      }
      return true
    },
  }) as unknown as NodeJS.WriteStream

  return { stdin, stdout, writes }
}

beforeEach(() => {
  vi.stubEnv("TERM", "xterm-256color")
  vi.stubEnv("TERM_PROGRAM", "")
  vi.stubEnv("TERM_PROGRAM_VERSION", "")
  vi.stubEnv("KITTY_WINDOW_ID", "")
  vi.stubEnv("GHOSTTY_RESOURCES_DIR", "")
  vi.stubEnv("WEZTERM_PANE", "")
  vi.stubEnv("WT_SESSION", "")
  vi.stubEnv("NO_COLOR", "1")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("run(term) terminal capability transaction", () => {
  test("preserves corpus provenance so live evidence reaches TermContext", async () => {
    let observedKittyGraphics: boolean | undefined
    function CapabilityProbe(): React.ReactElement {
      observedKittyGraphics = useContext(TermContext)?.caps.kittyGraphics
      return <Text>probe</Text>
    }

    const io = createProbeTTY()
    using term = createTerm({ stdin: io.stdin, stdout: io.stdout })

    const handle = await run(<CapabilityProbe />, term, {
      mouse: false,
      textSizing: false,
      widthDetection: false,
    })
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(io.writes.filter((write) => write.includes("a=q"))).toHaveLength(1)
    expect(observedKittyGraphics).toBe(true)

    handle.unmount()
  })

  test("unsupported terminals render text fallback without image transmission or placement", async () => {
    const io = createProbeTTY(null)
    using term = createTerm({ stdin: io.stdin, stdout: io.stdout })

    const handle = await run(
      <Image src={TINY_PNG} width={1} height={1} fallback="[image unavailable]" />,
      term,
      {
        mouse: false,
        textSizing: false,
        widthDetection: false,
      },
    )
    await new Promise<void>((resolve) => setImmediate(resolve))

    const output = io.writes.join("")
    expect(output).toContain("a=q")
    expect(output).toContain("[image")
    expect(output).toContain("unavailable]")
    expect(output).not.toContain("a=T")
    expect(output).not.toContain("a=p")

    handle.unmount()
  })
})
