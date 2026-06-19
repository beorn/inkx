/**
 * @km/code/v0.2/19702 — managed-frame hardware-cursor parking.
 *
 * The composited-caret policy paints the visible caret into the presentation
 * buffer and hides the hardware cursor. For that to be safe on a real terminal
 * / multiplexer, every managed fullscreen frame must MOVE the hardware cursor
 * to a deterministic safe cell BEFORE hiding it. A multiplexer (cmux) can drop
 * or override `?25l` — it re-shows the focused pane's cursor, and an unfocused
 * pane renders a hollow cursor. If a frame hides WITHOUT moving, the hardware
 * cursor stays wherever the diff's last content write landed — the bottom-most
 * painted row — so a dropped hide strands a visible cursor in
 * transcript/activity/chrome content.
 *
 * Live signature (user screenshot 2026-06-14): a reverse-video block on the
 * bottom status row, e.g. "Codex Done xhigh fast █", while no caret belongs
 * there. The fix parks the hardware cursor (the editable's DECLARED input-cell
 * `parkOffset` via `findActiveParkRect`, else home for an editable-less frame)
 * before hiding, so a dropped hide can only ever surface at a benign,
 * predictable cell — never in dynamic chrome, and never the composer box-origin
 * row above the prompt (the deleted @km/code/v0.2/19702 fallback).
 *
 * This in-process repro models a hide-ignoring terminal by stripping `?25l`
 * from the emitted stream and asserting the hardware cursor's resting row is
 * not a chrome/transcript row.
 */

import { afterEach, describe, expect, test } from "vitest"
import { TerminalBuffer } from "../../packages/ag-term/src/buffer"
import { createOutputPhase } from "../../packages/ag-term/src/pipeline/output-phase"
import { createRuntime } from "../../packages/ag-term/src/runtime/create-runtime"
import {
  managedCursorSuffix,
  verifyParkHonorsDeclaredTarget,
} from "../../packages/ag-term/src/managed-caret"
import { createTerminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import type { Buffer, Dims } from "../../packages/ag-term/src/runtime/types"
import type { AgNode } from "../../packages/ag/src/types"
import type { CursorRect } from "@silvery/ag/layout-signals"

const originalStrict = process.env.SILVERY_STRICT
afterEach(() => {
  if (originalStrict === undefined) delete process.env.SILVERY_STRICT
  else process.env.SILVERY_STRICT = originalStrict
})

function writeLine(buffer: TerminalBuffer, row: number, text: string): void {
  for (let col = 0; col < text.length; col++) buffer.setCell(col, row, { char: text[col]! })
}

function noCursorNode(dims: Dims): AgNode {
  return {
    type: "silvery-root",
    props: {},
    children: [],
    parent: null,
    scrollRect: { x: 0, y: 0, width: dims.cols, height: dims.rows },
  } as unknown as AgNode
}

/** A managed frame with NO active cursor, content painted down to a status row. */
function chromeOnlyBuffer(dims: Dims): Buffer {
  const tb = new TerminalBuffer(dims.cols, dims.rows)
  writeLine(tb, 0, "I am active on a task")
  writeLine(tb, 1, "@km/all/19702 cursor parking")
  writeLine(tb, dims.rows - 1, "Codex Done xhigh fast")
  return { text: "", ansi: "", nodes: noCursorNode(dims), _buffer: tb }
}

function renderOnce(dims: Dims): string {
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
  runtime.render(chromeOnlyBuffer(dims))
  return writes.join("")
}

/** Replay bytes into a fresh terminal and report the hardware cursor. */
function replayCursor(
  output: string,
  dims: Dims,
): { x: number; y: number; visible: boolean | null } {
  const terminal = createTerminal({
    backend: createXtermBackend(),
    cols: dims.cols,
    rows: dims.rows,
  })
  try {
    terminal.feed(output)
    const c = terminal.getCursor()
    return { x: c.x, y: c.y, visible: c.visible }
  } finally {
    void terminal.close()
  }
}

describe("managed-caret hardware cursor parking (19702)", () => {
  test("a no-caret managed frame parks the hardware cursor off the chrome row before hiding", () => {
    const dims: Dims = { cols: 28, rows: 6 }
    const frame = renderOnce(dims)

    // The frame must MOVE the cursor (to home, since there is no composer) and
    // hide it — not emit a bare hide.
    expect(frame, "managed frame must hide the hardware cursor").toContain("\x1b[?25l")
    expect(frame, "managed frame must not re-show the hardware cursor").not.toContain("\x1b[?25h")
    expect(frame, "managed frame must park at home before hiding").toContain("\x1b[1;1H\x1b[?25l")
  })

  test("a hide-ignoring multiplexer does not see a stranded cursor in the status row", () => {
    const dims: Dims = { cols: 28, rows: 6 }
    const frame = renderOnce(dims)

    // Model cmux/Ghostty dropping or overriding DECTCEM-hide: the cursor's
    // resting POSITION is wherever we last parked it.
    const hideIgnored = frame.replace(/\x1b\[\?25l/g, "")
    const cursor = replayCursor(hideIgnored, dims)

    // Never the bottom status/chrome row, never any dynamic content row below
    // the parked home cell.
    expect(
      cursor.y,
      `hardware cursor stranded on chrome row ${cursor.y} (status bar) when hide is ignored`,
    ).toBe(0)
    expect(cursor.x, "parked hardware cursor column").toBe(0)
  })

  test("managedCursorSuffix parks at the DECLARED park target when no caret is visible", () => {
    // No caret rect (unfocused/idle composer), but the editable declared its
    // input-cell park target (`parkOffset` → `findActiveParkRect` → parkRect).
    // The hardware cursor parks THERE — not at the box origin (the deleted 19702
    // fallback that stranded the cursor one row above the prompt) and not home.
    const parkRect = { x: 4, y: 9, width: 1, height: 1 }
    const controls = managedCursorSuffix(null as CursorRect | null, parkRect)
    expect(controls.parkTarget).not.toBeNull()
    expect(controls.parkTarget!.x).toBe(4)
    expect(controls.parkTarget!.y).toBe(9)
    expect(controls.suffix).toContain("\x1b[?25l")
  })

  test("managedCursorSuffix parks at home ONLY when there is no caret and no park declarer", () => {
    // An editable-less managed frame has no input locus, so home(0,0) is the
    // legitimate park (nothing to be "above") — this is the ONE remaining
    // home fallback, not a bug-masking degrade of a present editable.
    const controls = managedCursorSuffix(null as CursorRect | null, null)
    expect(controls.parkTarget).toEqual({ x: 0, y: 0 })
    expect(controls.suffix).toContain("\x1b[1;1H\x1b[?25l")
  })
})

describe("verifyParkHonorsDeclaredTarget — no-fallback park invariant (19702, STRICT=cursor)", () => {
  const parkRect = { x: 5, y: 9, width: 1, height: 1 }

  test("THROWS when a declared parkRect is not honored (simulated fallback to home) under STRICT=cursor", () => {
    process.env.SILVERY_STRICT = "cursor"
    // Simulated regression: park fell back to home(0,0) despite a declared park
    // target + no caret. The invariant must catch the @km/code/v0.2/19702 class.
    expect(() => verifyParkHonorsDeclaredTarget(null, parkRect, { x: 0, y: 0 })).toThrow(
      /no-fallback park/u,
    )
  })

  test("does NOT throw when the declared parkRect IS honored", () => {
    process.env.SILVERY_STRICT = "cursor"
    expect(() => verifyParkHonorsDeclaredTarget(null, parkRect, { x: 5, y: 9 })).not.toThrow()
  })

  test("does NOT throw when a caret owns the frame (park coincides with the caret)", () => {
    process.env.SILVERY_STRICT = "cursor"
    const cursor = { x: 3, y: 4, visible: true } as CursorRect
    expect(() => verifyParkHonorsDeclaredTarget(cursor, null, { x: 3, y: 4 })).not.toThrow()
  })

  test("does NOT throw for an editable-less frame (no parkRect → home is legitimate)", () => {
    process.env.SILVERY_STRICT = "cursor"
    expect(() => verifyParkHonorsDeclaredTarget(null, null, { x: 0, y: 0 })).not.toThrow()
  })

  test("is a NO-OP when STRICT=cursor is disabled, even on a violation", () => {
    delete process.env.SILVERY_STRICT
    expect(() => verifyParkHonorsDeclaredTarget(null, parkRect, { x: 0, y: 0 })).not.toThrow()
  })
})
