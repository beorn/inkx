import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Box, Text } from "../../src/index.js"
import { TerminalBuffer } from "../../packages/ag-term/src/buffer"
import { createOutputPhase } from "../../packages/ag-term/src/pipeline/output-phase"
import { createRuntime } from "../../packages/ag-term/src/runtime/create-runtime"
import type { Buffer, Dims } from "../../packages/ag-term/src/runtime/types"
import { run } from "../../packages/ag-term/src/runtime/run"
import type { AgNode } from "../../packages/ag/src/types"

const settle = (ms = 60) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const waitForResize = () => settle(260)

function rootNode(): AgNode {
  return {
    type: "silvery-root",
    props: {},
    children: [],
    parent: null,
  } as unknown as AgNode
}

function buffer(width: number, height: number, label: string): Buffer {
  const terminalBuffer = new TerminalBuffer(width, height)
  for (let i = 0; i < label.length && i < width; i++) {
    terminalBuffer.setCell(i, 0, { char: label[i]! })
  }
  return {
    text: label,
    ansi: label,
    nodes: rootNode(),
    _buffer: terminalBuffer,
  }
}

function StableFullscreenApp() {
  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Text>stable top</Text>
      <Box flexGrow={1}>
        <Text>stable body</Text>
      </Box>
      <Text>stable bottom</Text>
    </Box>
  )
}

function TickingFullscreenApp() {
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 30)
    return () => clearInterval(interval)
  }, [])

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Text>live transcript row</Text>
      <Box flexGrow={1}>
        <Text>ongoing tool output</Text>
      </Box>
      <Text>tick {tick}</Text>
    </Box>
  )
}

describe("fullscreen reflow residue", () => {
  test("runtime clears fullscreen output after a same-size resize notification", () => {
    let dims: Dims = { cols: 24, rows: 6 }
    let onResize: ((dims: Dims) => void) | undefined
    const writes: string[] = []

    using runtime = createRuntime({
      mode: "fullscreen",
      target: {
        write(frame) {
          writes.push(frame)
        },
        getDims() {
          return dims
        },
        onResize(handler) {
          onResize = handler
          return () => {
            onResize = undefined
          }
        },
      },
    })

    runtime.render(buffer(dims.cols, dims.rows, "before"))
    writes.length = 0

    onResize?.(dims)
    runtime.render(buffer(dims.cols, dims.rows, "after"))

    const frame = writes.at(-1) ?? ""
    expect(frame).toContain("\x1b[2J\x1b[H")
  })

  test("runtime clear-screen repaint does not use DEC 2026 sync markers", () => {
    let dims: Dims = { cols: 24, rows: 6 }
    let onResize: ((dims: Dims) => void) | undefined
    const writes: string[] = []

    using runtime = createRuntime({
      mode: "fullscreen",
      target: {
        write(frame) {
          writes.push(frame)
        },
        getDims() {
          return dims
        },
        onResize(handler) {
          onResize = handler
          return () => {
            onResize = undefined
          }
        },
      },
    })

    runtime.render(buffer(dims.cols, dims.rows, "before"))
    writes.length = 0

    onResize?.(dims)
    runtime.render(buffer(dims.cols, dims.rows, "after"))

    const frame = writes.at(-1) ?? ""
    expect(frame).toContain("\x1b[2J\x1b[H")
    expect(frame).toContain("afte")
    expect(frame).not.toContain("\x1b[?2026h")
    expect(frame).not.toContain("\x1b[?2026l")
  })

  test("runtime syncUpdate option wraps fullscreen repaint in DEC 2026 markers", () => {
    let dims: Dims = { cols: 24, rows: 6 }
    let onResize: ((dims: Dims) => void) | undefined
    const writes: string[] = []

    using runtime = createRuntime({
      mode: "fullscreen",
      syncUpdate: true,
      target: {
        write(frame) {
          writes.push(frame)
        },
        getDims() {
          return dims
        },
        onResize(handler) {
          onResize = handler
          return () => {
            onResize = undefined
          }
        },
      },
    })

    runtime.render(buffer(dims.cols, dims.rows, "before"))
    writes.length = 0

    onResize?.(dims)
    runtime.render(buffer(dims.cols, dims.rows, "after"))

    const frame = writes.at(-1) ?? ""
    expect(frame).toContain("\x1b[2J\x1b[H")
    expect(frame.startsWith("\x1b[?2026h")).toBe(true)
    expect(frame.endsWith("\x1b[?2026l")).toBe(true)
  })

  test("termless resize-residue backend is cleared by the next fullscreen paint", async () => {
    using term = createTermless({ cols: 40, rows: 8, reflowResidue: true })
    const handle = await run(<StableFullscreenApp />, term)

    expect(term.screen).toContainText("stable top")
    expect(term.screen.getText()).not.toContain(term.reflowResidue!.marker)
    term.out.clear()

    term.resize!(32, 8)
    await waitForResize()

    const outputAfterResize = term.out.getText()
    expect(outputAfterResize).toContain("\x1b[2J")
    expect(term.screen.getText()).not.toContain(term.reflowResidue!.marker)

    handle.unmount()
  })

  test("same-size resize notification clears fullscreen residue without focus-in", async () => {
    using term = createTermless({ cols: 40, rows: 8, reflowResidue: true })
    const handle = await run(<StableFullscreenApp />, term)

    expect(term.screen).toContainText("stable top")
    term.out.clear()

    term.reflowResidue!.arm()
    term.resize!(40, 8)
    await waitForResize()

    const outputAfterResize = term.out.getText()
    expect(outputAfterResize).toContain("\x1b[2J")

    handle.unmount()
  })

  test("same-size workspace restore residue is cleared on focus-in", async () => {
    using term = createTermless({ cols: 40, rows: 8, reflowResidue: true })
    const handle = await run(<StableFullscreenApp />, term)

    expect(term.screen).toContainText("stable top")
    term.out.clear()

    term.reflowResidue!.arm()
    ;(term as unknown as { sendInput(data: string): void }).sendInput("\x1b[I")
    await settle()

    const outputAfterFocus = term.out.getText()
    expect(outputAfterFocus).toContain("\x1b[2J")
    expect(term.screen.getText()).not.toContain(term.reflowResidue!.marker)

    handle.unmount()
  })

  test("focus-out damage risk clears fullscreen residue on the next live render if focus-in is missed", async () => {
    using term = createTermless({ cols: 40, rows: 8, reflowResidue: true })
    const handle = await run(<TickingFullscreenApp />, term)

    try {
      expect(term.screen).toContainText("live transcript row")

      ;(term as unknown as { sendInput(data: string): void }).sendInput("\x1b[O")
      await settle()

      term.out.clear()
      term.reflowResidue!.arm()
      await settle(650)

      const outputAfterTick = term.out.getText()
      expect(outputAfterTick).toContain("\x1b[2J")
      expect(term.screen.getText()).not.toContain(term.reflowResidue!.marker)
    } finally {
      handle.unmount()
    }
  })

  test("focus-out damage repair is one-shot while live output continues", async () => {
    using term = createTermless({ cols: 40, rows: 8, reflowResidue: true })
    const handle = await run(<TickingFullscreenApp />, term)

    try {
      expect(term.screen).toContainText("live transcript row")

      ;(term as unknown as { sendInput(data: string): void }).sendInput("\x1b[O")
      await settle()

      term.out.clear()
      term.reflowResidue!.arm()
      await settle(650)

      const firstRepair = term.out.getText()
      expect(firstRepair).toContain("\x1b[2J")
      expect(term.screen.getText()).not.toContain(term.reflowResidue!.marker)

      term.out.clear()
      await settle(650)

      const continuedOutput = term.out.getText()
      expect(continuedOutput).not.toContain("\x1b[2J")
      expect(continuedOutput.length).toBeGreaterThan(0)
    } finally {
      handle.unmount()
    }
  })
})

// Densely-filled buffer so a near-total content change produces a large output
// patch — the streaming/scroll flicker shape from km bead 19633.
function denseBuffer(width: number, height: number, seed: number): Buffer {
  const terminalBuffer = new TerminalBuffer(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      terminalBuffer.setCell(x, y, {
        char: String.fromCharCode(33 + ((seed * 7 + y * 5 + x * 3) % 90)),
      })
    }
  }
  return { text: "", ansi: "", nodes: rootNode(), _buffer: terminalBuffer }
}

function fullscreenCaptureRuntime(dims: Dims, writes: string[]) {
  return createRuntime({
    mode: "fullscreen",
    // Mirror the real createApp path, which always threads the optimized
    // incremental output phase (pipelineConfig.outputPhaseFn) — the bare diff
    // fallback over-emits on dense buffers and isn't representative.
    outputPhaseFn: createOutputPhase({}),
    target: {
      write(frame) {
        writes.push(frame)
      },
      getDims() {
        return dims
      },
      onResize() {
        return () => {}
      },
    },
  })
}

const SYNC_BEGIN = "\x1b[?2026h"
const SYNC_END = "\x1b[?2026l"

describe("auto sync-wrap for large fullscreen frames (km bead 19633)", () => {
  test("a large fullscreen diff frame is auto-wrapped in DEC 2026 markers without the env flag", () => {
    const dims: Dims = { cols: 120, rows: 40 }
    const writes: string[] = []
    using runtime = fullscreenCaptureRuntime(dims, writes)

    runtime.render(denseBuffer(dims.cols, dims.rows, 1))
    writes.length = 0
    // Near-total content change: most cells differ → large output patch, the
    // shape that visibly tears/flickers when written un-synchronized.
    runtime.render(denseBuffer(dims.cols, dims.rows, 2))

    const frame = writes.at(-1) ?? ""
    expect(Buffer.byteLength(frame)).toBeGreaterThan(2048)
    expect(frame.startsWith(SYNC_BEGIN), "large frame should open a sync region").toBe(true)
    expect(frame.endsWith(SYNC_END), "large frame should close a sync region").toBe(true)
  })

  test("a small fullscreen diff frame is left unwrapped (avoids the older-Ghostty incremental caveat)", () => {
    const dims: Dims = { cols: 120, rows: 40 }
    const writes: string[] = []
    using runtime = fullscreenCaptureRuntime(dims, writes)

    const base = denseBuffer(dims.cols, dims.rows, 1)
    runtime.render(base)
    writes.length = 0
    // Clone the prior buffer (clone clears dirty rows) and change exactly one
    // cell — a tiny incremental cursor-positioned diff touching only row 0.
    const tiny = { ...base, _buffer: base._buffer.clone() }
    tiny._buffer.setCell(0, 0, { char: "@" })
    runtime.render(tiny)

    const frame = writes.at(-1) ?? ""
    expect(frame.length, "a one-cell change should still emit output").toBeGreaterThan(0)
    expect(Buffer.byteLength(frame)).toBeLessThan(2048)
    expect(frame.includes(SYNC_BEGIN), "small frame should not open a sync region").toBe(false)
    expect(frame.includes(SYNC_END)).toBe(false)
  })
})
