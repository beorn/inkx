import EventEmitter from "node:events"
import React from "react"
import { describe, expect, test } from "vitest"
import { Text } from "../../src/index.js"
import { createTerminalProfile } from "@silvery/ansi"
import { createTerm } from "../../packages/ag-term/src/ansi/term"
import { run, useInput } from "../../packages/ag-term/src/runtime/run"

function createMockTTY(): {
  stdin: NodeJS.ReadStream
  stdout: NodeJS.WriteStream
  output: () => string
  send: (data: string) => void
  stats: {
    readonly maxDataListeners: number
    readonly listenerlessWhileRaw: boolean
  }
} {
  const stdinEmitter = new EventEmitter()
  const stdoutEmitter = new EventEmitter()
  const chunks: string[] = []
  let raw = false
  let maxDataListeners = 0
  let listenerlessWhileRaw = false

  stdinEmitter.on("newListener", (event) => {
    if (event !== "data") return
    maxDataListeners = Math.max(maxDataListeners, stdinEmitter.listenerCount("data") + 1)
  })
  stdinEmitter.on("removeListener", (event) => {
    if (event !== "data") return
    if (raw && stdinEmitter.listenerCount("data") === 0) listenerlessWhileRaw = true
  })

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
    columns: 100,
    rows: 24,
    write(data: string | Uint8Array) {
      const text = typeof data === "string" ? data : new TextDecoder().decode(data)
      chunks.push(text)
      if (text.includes("\x1b[14t")) {
        queueMicrotask(() => stdinEmitter.emit("data", "\x1b[4;384;800t"))
      }
      if (text.includes("\x1b[18t")) {
        queueMicrotask(() => stdinEmitter.emit("data", "\x1b[8;24;100t"))
      }
      if (text.includes("\x1b[?u")) {
        queueMicrotask(() => stdinEmitter.emit("data", "\x1b[?7u"))
      }
      const widthMode = text.match(/\[\?(\d+)\$p/)
      if (widthMode) {
        queueMicrotask(() => stdinEmitter.emit("data", `\x1b[?${widthMode[1]};2$y`))
      }
      return true
    },
  }) as unknown as NodeJS.WriteStream

  return {
    stdin,
    stdout,
    output: () => chunks.join(""),
    send: (data) => stdinEmitter.emit("data", data),
    stats: {
      get maxDataListeners() {
        return maxDataListeners
      },
      get listenerlessWhileRaw() {
        return listenerlessWhileRaw
      },
    },
  }
}

describe("run() SGR-Pixels mouse default", () => {
  test("mouse=true auto-enables SGR-Pixels when cell-size probing succeeds", async () => {
    const { stdin, stdout, output } = createMockTTY()
    const handle = await run(<Text>hello</Text>, {
      stdin,
      stdout,
      profile: createTerminalProfile(),
      mouse: true,
    })

    expect(output()).toContain("\x1b[?1003h\x1b[?1006h\x1b[?1016h")
    handle.unmount()
  })

  test("startup negotiation keeps one uninterrupted stdin owner", async () => {
    const { stdin, stdout, send, stats } = createMockTTY()
    const received: string[] = []

    function App() {
      useInput((input) => {
        received.push(input)
      })
      return <Text>hello</Text>
    }

    using term = createTerm({ stdin, stdout })
    const handle = await run(<App />, term, {
      profile: createTerminalProfile(),
      mouse: true,
    })
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(stats.maxDataListeners).toBe(1)
    expect(stats.listenerlessWhileRaw).toBe(false)
    expect(received).toEqual([])

    const mouseEvents: Array<{ coordinateMode: string; x: number; y: number }> = []
    const unsubscribe = term.input!.onMouse((event) => mouseEvents.push(event))
    send("\x1b[<64;81;41M")
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(mouseEvents).toHaveLength(1)
    expect(mouseEvents[0]).toMatchObject({ coordinateMode: "pixel", x: 10, y: 2.5 })
    unsubscribe()
    handle.unmount()
  })

  test("Kitty detection shares the canonical stdin owner", async () => {
    const { stdin, stdout, stats } = createMockTTY()
    const received: string[] = []

    function App() {
      useInput((input) => {
        received.push(input)
      })
      return <Text>hello</Text>
    }

    const handle = await run(<App />, {
      stdin,
      stdout,
      profile: createTerminalProfile({ caps: { kittyKeyboard: false } }),
      kitty: true,
      mouse: false,
      textSizing: false,
      widthDetection: false,
    })
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(stats.maxDataListeners).toBe(1)
    expect(stats.listenerlessWhileRaw).toBe(false)
    expect(received).toEqual([])
    handle.unmount()
  })
})
