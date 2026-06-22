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

// @ag/code/20297-pane-flicker-on-resize: a resize/focus/reflow frame must NOT
// blank the screen. The old behavior emitted a bare destructive `\x1b[2J`
// prefix OUTSIDE the DEC 2026 sync region; DEC 2026 only makes the REPAINT
// atomic, so the preceding un-synced `2J` flashed the screen blank for one
// composited frame on every resize (the user-visible flicker). The fix drops
// the `2J` entirely — the full `bufferToAnsi` repaint (forced on a clear frame)
// overwrites every cell itself, so it IS the clear (and overwrites multiplexer
// residue, the 19604 heal). The durable invariant these tests now assert: a
// resize/clear frame carries NO `\x1b[2J` that sits outside a sync region. With
// the fix there is no `\x1b[2J` at all, which trivially satisfies it.
const SYNC_H = "\x1b[?2026h"
const SYNC_L = "\x1b[?2026l"
function expectNoUnsyncedClear(frame: string, label: string): void {
  const idx2J = frame.indexOf("\x1b[2J")
  if (idx2J < 0) return // no destructive clear at all — the flicker-free shape
  const begin = frame.indexOf(SYNC_H)
  const end = frame.indexOf(SYNC_L)
  const insideSync = begin >= 0 && end > begin && idx2J > begin && idx2J < end
  expect(insideSync, `${label}: bare un-synced \\x1b[2J (blank flash) at ${idx2J}`).toBe(true)
}

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
  test("runtime repaints fullscreen output after a same-size resize notification (no blank flash)", () => {
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
    // @ag/code/20297: the resize frame is a FULL repaint that homes the cursor
    // (\x1b[H) and rewrites every cell — that repaint IS the clear, no bare
    // destructive `2J` is emitted (which would blank-flash). Intent preserved:
    // the frame still homes and repaints the (new) content.
    expect(frame, "repaint homes the cursor").toContain("\x1b[H")
    expect(frame, "repaint paints the new content").toContain("afte")
    expectNoUnsyncedClear(frame, "same-size resize")
  })

  // The shadow⇄terminal desync at the heart of 19604: a same-size reflow
  // delivers an IDENTICAL buffer (the React tree didn't change), so a diff
  // against the shadow prevBuffer is empty. Pre-fix the runtime emitted the 2J
  // clear with no repaint body → blank screen. The frame must carry a FULL
  // repaint of the (unchanged) content. Post-20297 that full repaint is the
  // ONLY thing emitted (no separate `2J`) — it homes + rewrites every cell, so
  // it both heals residue and shows content. Bead: @km/code/v0.2/19604-focus-blank.
  test("same-size resize with an IDENTICAL buffer repaints content (no blank, no 2J flash)", () => {
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
    // empty and (pre-20297) only 2J was emitted → blank. The fix forces a full
    // repaint instead, which homes + rewrites every cell.
    onResize?.(dims)
    runtime.render(buffer(dims.cols, dims.rows, "STABLE"))

    const frame = writes.at(-1) ?? ""
    expect(frame, "must home the cursor for the full repaint").toContain("\x1b[H")
    expect(frame, "must repaint the content, not emit an empty/blank frame").toContain("STABLE")
    expectNoUnsyncedClear(frame, "same-size identical-buffer reflow")
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

    // First post-resize render writes the full repaint and disarms the latch.
    runtime.render(buffer(dims.cols, dims.rows, "ROW"))
    const latchFrame = writes.at(-1) ?? ""
    expect(latchFrame, "full repaint emitted (homes + paints content)").toContain("\x1b[H")
    expect(latchFrame, "full repaint paints content").toContain("ROW")
    expectNoUnsyncedClear(latchFrame, "resize-paint latch")
    expect(runtime.isResizePending(), "latch cleared only after a real write").toBe(false)
  })

  // @ag/code/20297: a small clear-screen repaint emits NO destructive `2J` and
  // (being small) is left unwrapped. The old assertion "contains 2J, no sync
  // markers" becomes "no 2J at all, no sync markers, still repaints content".
  // Intent preserved: a small clear frame is not sync-wrapped (avoids the
  // older-Ghostty incremental caveat, 19633) and shows the content.
  test("runtime clear-screen repaint emits no destructive 2J and no DEC 2026 markers (small frame)", () => {
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
    expect(frame, "repaint homes the cursor").toContain("\x1b[H")
    expect(frame, "repaint paints content").toContain("afte")
    expect(frame, "no destructive clear — the full repaint is the clear").not.toContain("\x1b[2J")
    expect(frame).not.toContain("\x1b[?2026h")
    expect(frame).not.toContain("\x1b[?2026l")
  })

  // @ag/code/20297 + 19633: with syncUpdate the full clear repaint is wrapped in
  // DEC 2026 so the whole-viewport overwrite is atomic. There is no longer any
  // `2J` (the repaint itself clears), so the old "2J before sync" ordering check
  // becomes "no 2J anywhere; the frame is fully sync-wrapped". Ghostty intent
  // preserved trivially: with no `ED`/`2J`, the clear-in-sync corruption mode
  // cannot occur, so the body is free to be wrapped.
  test("runtime syncUpdate option wraps the full clear repaint in DEC 2026 markers (no 2J)", () => {
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
    // The whole repaint body is sync-wrapped (syncUpdate=true). No destructive
    // `2J` is emitted — the homed full repaint is the clear, and it lives
    // entirely inside the sync region so the swap is atomic.
    expect(frame.startsWith("\x1b[?2026h"), "frame opens the sync region").toBe(true)
    expect(frame.endsWith("\x1b[?2026l"), "frame closes the sync region").toBe(true)
    expect(frame, "repaint paints content inside sync").toContain("afte")
    expect(frame, "no destructive 2J anywhere").not.toContain("\x1b[2J")
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
    // @ag/code/20297: residue is healed by the FULL repaint (which rewrites
    // every cell incl. the residue marker), not by a destructive `2J`. The
    // repaint homes the cursor; assert that, the marker gone, and the content
    // present. No bare un-synced `2J` may flash.
    expect(outputAfterResize).toContain("\x1b[H")
    expectNoUnsyncedClear(outputAfterResize, "reflow residue (resize)")
    expect(term.screen.getText()).not.toContain(term.reflowResidue!.marker)
    // (c) Content-present — the assertion the 19604 cluster was missing. A
    // clear-WITHOUT-repaint left the screen blank (the bug). Assert the
    // transcript content is actually on the emulator after the reflow.
    // @km/code/v0.2/19604-focus-blank.
    expect(term.screen, "content must survive the reflow, not just clear").toContainText(
      "stable top",
    )
    expect(term.screen).toContainText("stable bottom")

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
    // @ag/code/20297: same-size heal is a full repaint, no destructive `2J`.
    expect(outputAfterResize).toContain("\x1b[H")
    expectNoUnsyncedClear(outputAfterResize, "reflow residue (same-size)")
    // (c) Content-present after the same-size heal — see note above.
    expect(term.screen, "content must survive the same-size resize heal").toContainText(
      "stable top",
    )
    expect(term.screen).toContainText("stable bottom")

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
    // @ag/code/20297: focus-in restore is a full repaint, no destructive `2J`.
    expect(outputAfterFocus).toContain("\x1b[H")
    expectNoUnsyncedClear(outputAfterFocus, "focus-in restore")
    expect(term.screen.getText()).not.toContain(term.reflowResidue!.marker)
    // (c) Content-present after the focus-in restore — see note above.
    expect(term.screen, "content must survive the focus-in restore").toContainText("stable top")
    expect(term.screen).toContainText("stable bottom")

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
      // @ag/code/20297: damage repair is a full repaint, no destructive `2J`.
      expect(outputAfterTick).toContain("\x1b[H")
      expectNoUnsyncedClear(outputAfterTick, "focus-out damage repair")
      expect(term.screen.getText()).not.toContain(term.reflowResidue!.marker)
      // (c) Content-present after the focus-out damage repair — the live
      // transcript must remain on the emulator, not just the clear fired.
      expect(term.screen, "live content must survive the damage repair").toContainText(
        "live transcript row",
      )
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

      // @ag/code/20297: the one-shot damage repair is now a full repaint (no
      // `2J`). A full clear-repaint is uniquely signalled by a bare `\x1b[H`
      // home — `bufferToAnsi` (full render) is the only path that emits it;
      // incremental tick diffs use parameterized CUP (`\x1b[row;colH`). So the
      // one-shot invariant becomes: the repair window contains a homed full
      // repaint, and the continued window does NOT (no second full clear).
      const firstRepair = term.out.getText()
      expect(firstRepair, "damage repair fired a full repaint").toContain("\x1b[H")
      expectNoUnsyncedClear(firstRepair, "one-shot damage repair")
      expect(term.screen.getText()).not.toContain(term.reflowResidue!.marker)

      term.out.clear()
      await settle(650)

      const continuedOutput = term.out.getText()
      expect(
        continuedOutput,
        "continued output must not re-fire a full clear-repaint",
      ).not.toContain("\x1b[H")
      expect(continuedOutput, "no destructive clear in continued output").not.toContain("\x1b[2J")
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

  test("a large clearFullscreen repaint is fully sync-wrapped with NO destructive 2J (km beads 19604 + 20297)", () => {
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
    // A focus-in / resize forces a clearFullscreen full repaint. The invariants
    // that must hold (km beads 19604-focus-blank + 20297-pane-flicker):
    //   1. NO destructive `2J` is emitted — the homed full `bufferToAnsi`
    //      repaint overwrites every cell itself, so it IS the clear. A bare
    //      un-synced `2J` would blank-flash before the repaint (20297); a `2J`
    //      inside sync corrupts older Ghostty (19604). Emitting none avoids both.
    //   2. The large repaint body is STILL delivered atomically (sync-wrapped) —
    //      a large repaint written un-synchronized tears/drops cells under
    //      compositor load and settles blank with residue (19604 recurrence).
    onResize?.(dims)
    runtime.render(denseBuffer(dims.cols, dims.rows, 2))

    const frame = writes.at(-1) ?? ""
    expect(frame, "frame should be a full clear repaint (homes the cursor)").toContain("\x1b[H")
    expect(Buffer.byteLength(frame), "clear repaint should be large").toBeGreaterThan(2048)
    // The whole repaint is wrapped: the frame opens and closes one sync region...
    expect(frame.startsWith(SYNC_BEGIN), "large clear repaint should open with sync").toBe(true)
    expect(frame.endsWith(SYNC_END), "large clear repaint should close with sync").toBe(true)
    // ...and there is no destructive `2J` anywhere (so neither the unsynced
    // flash nor the clear-in-sync corruption can occur).
    expect(frame.includes("\x1b[2J"), "no destructive 2J anywhere").toBe(false)
  })

  test("focus-in invalidate({clearScreen}) large repaint: fully sync-wrapped, NO 2J (km beads 19604 + 20297)", () => {
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
    // refocuses the pane. The very next render must repaint atomically with no
    // destructive `2J` (20297).
    runtime.invalidate({ clearScreen: true })
    runtime.render(denseBuffer(dims.cols, dims.rows, 2))

    const frame = writes.at(-1) ?? ""
    expect(frame, "focus-in frame should be a full clear repaint (homes the cursor)").toContain(
      "\x1b[H",
    )
    expect(Buffer.byteLength(frame), "focus-in repaint should be large").toBeGreaterThan(2048)
    expect(frame.startsWith(SYNC_BEGIN), "focus-in repaint should open with sync").toBe(true)
    expect(frame.endsWith(SYNC_END), "focus-in repaint should close with sync").toBe(true)
    // No destructive `2J` anywhere — the homed full repaint is the clear, fully
    // inside the sync region so the swap is atomic (20297).
    expect(frame.includes("\x1b[2J"), "no destructive 2J anywhere").toBe(false)
  })
})
