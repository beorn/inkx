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

  // The shadow⇄terminal desync at the heart of 19604: a same-size reflow
  // delivers an IDENTICAL buffer (the React tree didn't change), so a diff
  // against the shadow prevBuffer is empty. Pre-fix the runtime emitted the 2J
  // clear with no repaint body → blank screen. The clear must carry a FULL
  // repaint of the (unchanged) content. Bead: @km/code/v0.2/19604-focus-blank.
  test("same-size resize with an IDENTICAL buffer still clears AND repaints content (no blank)", () => {
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

    runtime.render(buffer(dims.cols, dims.rows, "STABLE"))
    writes.length = 0

    // Same dims, same content — the desync case. Without the fix the diff is
    // empty and only 2J is emitted.
    onResize?.(dims)
    runtime.render(buffer(dims.cols, dims.rows, "STABLE"))

    const frame = writes.at(-1) ?? ""
    expect(frame, "must clear").toContain("\x1b[2J\x1b[H")
    expect(frame, "must repaint the content, not just clear").toContain("STABLE")
  })

  // The latch must survive an intermediate no-output frame. After a resize, a
  // render() of a byte-identical buffer (pre-fix: zero-diff early-return that
  // consumed clearNextFullscreenRender) must NOT swallow the pending clear —
  // the resize repaint stays armed until a paint actually writes.
  test("resize-paint latch survives an intermediate identical-buffer frame", () => {
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

    const stable = buffer(dims.cols, dims.rows, "ROW")
    runtime.render(stable)
    writes.length = 0

    onResize?.(dims)
    expect(runtime.isResizePending(), "latch armed after resize").toBe(true)

    // First post-resize render writes the clear+repaint and disarms the latch.
    runtime.render(buffer(dims.cols, dims.rows, "ROW"))
    expect(writes.at(-1) ?? "", "clear+repaint emitted").toContain("\x1b[2J\x1b[H")
    expect(runtime.isResizePending(), "latch cleared only after a real write").toBe(false)
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
    // syncUpdate wraps the repaint body, but the 2J clear still stays OUTSIDE
    // the sync region (never clear inside sync — km bead 19604). So the frame
    // opens with the clear, THEN the sync region.
    expect(frame.startsWith("\x1b[2J\x1b[H")).toBe(true)
    expect(frame.indexOf("\x1b[2J\x1b[H")).toBeLessThan(frame.indexOf("\x1b[?2026h"))
    expect(frame.endsWith("\x1b[?2026l")).toBe(true)
    expect(frame.slice(frame.indexOf("\x1b[?2026h")).includes("\x1b[2J")).toBe(false)
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

  test("a large clearFullscreen repaint keeps the 2J clear OUTSIDE sync but wraps the repaint body (km bead 19604)", () => {
    const dims: Dims = { cols: 120, rows: 40 }
    let onResize: ((dims: Dims) => void) | undefined
    const writes: string[] = []
    using runtime = createRuntime({
      mode: "fullscreen",
      outputPhaseFn: createOutputPhase({}),
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

    runtime.render(denseBuffer(dims.cols, dims.rows, 1))
    writes.length = 0
    // A focus-in / resize forces a clearFullscreen repaint (2J + full repaint).
    // Two invariants must BOTH hold (km bead 19604-focus-blank):
    //   1. The destructive 2J clear stays OUTSIDE the DEC 2026 sync region —
    //      older Ghostty corrupts a clear performed inside sync (the original
    //      blank symptom).
    //   2. The large repaint body is STILL delivered atomically (sync-wrapped) —
    //      a large repaint written un-synchronized tears/drops cells under
    //      compositor load and settles blank with residue (the recurrence).
    onResize?.(dims)
    runtime.render(denseBuffer(dims.cols, dims.rows, 2))

    const frame = writes.at(-1) ?? ""
    expect(frame, "frame should be a clear repaint").toContain("\x1b[2J\x1b[H")
    expect(Buffer.byteLength(frame), "clear repaint should be large").toBeGreaterThan(2048)
    // The repaint body is wrapped: a sync region IS opened/closed...
    expect(frame.includes(SYNC_BEGIN), "large clear repaint should wrap its body in sync").toBe(
      true,
    )
    expect(frame.includes(SYNC_END)).toBe(true)
    // ...but the 2J clear is emitted BEFORE the sync region opens — never inside it.
    const clearIdx = frame.indexOf("\x1b[2J\x1b[H")
    const syncIdx = frame.indexOf(SYNC_BEGIN)
    expect(clearIdx, "2J clear must precede the sync region (clear outside sync)").toBeLessThan(
      syncIdx,
    )
    expect(
      frame.slice(syncIdx).includes("\x1b[2J"),
      "no 2J clear may appear inside the sync region",
    ).toBe(false)
  })

  test("focus-in invalidate({clearScreen}) large repaint: 2J outside sync, body wrapped (km bead 19604)", () => {
    const dims: Dims = { cols: 120, rows: 40 }
    const writes: string[] = []
    using runtime = createRuntime({
      mode: "fullscreen",
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

    runtime.render(denseBuffer(dims.cols, dims.rows, 1))
    writes.length = 0
    // This is the exact focus-in path: createApp's term:focus handler calls
    // runtime.invalidate({ clearScreen: true }) when a cmux workspace switch
    // refocuses the pane. The very next render must clear+repaint atomically.
    runtime.invalidate({ clearScreen: true })
    runtime.render(denseBuffer(dims.cols, dims.rows, 2))

    const frame = writes.at(-1) ?? ""
    expect(frame, "focus-in frame should be a clear repaint").toContain("\x1b[2J\x1b[H")
    expect(Buffer.byteLength(frame), "focus-in repaint should be large").toBeGreaterThan(2048)
    expect(frame.includes(SYNC_BEGIN), "focus-in repaint body should be sync-wrapped").toBe(true)
    const clearIdx = frame.indexOf("\x1b[2J\x1b[H")
    const syncIdx = frame.indexOf(SYNC_BEGIN)
    expect(clearIdx, "focus-in 2J clear must stay outside sync").toBeLessThan(syncIdx)
    expect(frame.slice(syncIdx).includes("\x1b[2J")).toBe(false)
  })
})
