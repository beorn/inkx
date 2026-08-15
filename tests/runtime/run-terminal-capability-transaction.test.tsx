import EventEmitter from "node:events"
import React, { useContext } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { Text } from "../../src/index.js"
import { TermContext } from "../../packages/ag-react/src/context"
import { createTerm } from "../../packages/ag-term/src/ansi/term"
import { run } from "../../packages/ag-term/src/runtime/run"

const ST = "\x1b\\"
const CAPABILITY_RESPONSE = `\x1b_Gi=7777;OK${ST}\x1bP>|ghostty(1.2.3)${ST}\x1b[?1;4;22c`

function createProbeTTY(): {
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
      if (text.includes("a=q")) {
        queueMicrotask(() => stdinEmitter.emit("data", CAPABILITY_RESPONSE))
      }
      if (text.includes("\x1b]11;?")) {
        queueMicrotask(() => stdinEmitter.emit("data", "\x1b]11;rgb:0000/0000/0000\x07"))
      }
      return true
    },
  }) as unknown as NodeJS.WriteStream

  return { stdin, stdout, writes }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("run(term) terminal capability transaction", () => {
  test("preserves corpus provenance so live evidence reaches TermContext", async () => {
    vi.stubEnv("TERM", "xterm-256color")
    vi.stubEnv("TERM_PROGRAM", "")
    vi.stubEnv("TERM_PROGRAM_VERSION", "")
    vi.stubEnv("KITTY_WINDOW_ID", "")
    vi.stubEnv("GHOSTTY_RESOURCES_DIR", "")
    vi.stubEnv("WEZTERM_PANE", "")
    vi.stubEnv("WT_SESSION", "")
    vi.stubEnv("NO_COLOR", "1")

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
})
