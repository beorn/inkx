/**
 * @km/code/v0.2/20082 — focus-aware caret shape (filled focused / hollow unfocused).
 *
 * FEATURE: the Silver Code managed caret renders as a FILLED inverse BLOCK only
 * when the terminal/window is FOCUSED. When the window is UNFOCUSED, it renders a
 * HOLLOW RECTANGLE at the same caret cell — not hidden, not filled — so focus
 * state stays visible.
 *
 * DESIGN (grounded in the existing 19702 managed-caret policy + silvery's own
 * "fake cursor when unfocused" convention, docs/architecture.md:118):
 *
 *   - The hollow caret is a COMPOSITED buffer overlay (overline + underline on
 *     the caret cell → top+bottom box edges, interior unfilled), NOT the native
 *     hollow HARDWARE cursor. The hardware cursor stays parked-and-HIDDEN in BOTH
 *     focus states — byte-identical to the 19702 fix. Showing the hardware cursor
 *     when unfocused would re-introduce the 19702 strand class (a dropped/over-
 *     ridden `?25l` from cmux/Ghostty would leave a VISIBLE hardware cursor
 *     stranded in transcript/chrome).
 *   - Focus state is a SINGLE param threaded into computeManagedFrame
 *     (`windowFocused`). Default/unknown → FOCUSED (filled block) — never regress
 *     to hidden/hollow when focus is simply unknown (a single user with a focused
 *     terminal must see the filled block).
 *
 * INVARIANT under test:
 *   - FOCUSED frame  → compositorCaret.style === "block", the caret cell carries
 *     `inverse` (and NOT overline/underline), hardware cursor hidden.
 *   - UNFOCUSED frame → compositorCaret.style === "hollow", the caret cell carries
 *     `overline` + `underline` (and NOT `inverse`), hardware cursor STILL hidden,
 *     and the caret is STILL present (not suppressed).
 *
 * These tests run at SILVERY_STRICT=2,cursor.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { TerminalBuffer } from "../../packages/ag-term/src/buffer"
import { createOutputPhase } from "../../packages/ag-term/src/pipeline/output-phase"
import { createRuntime } from "../../packages/ag-term/src/runtime/create-runtime"
import { computeManagedFrame } from "../../packages/ag-term/src/managed-caret"
import { resetStrictCache } from "../../packages/ag-term/src/strict-mode"
import { createTerminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import type { Buffer, Dims } from "../../packages/ag-term/src/runtime/types"
import type { AgNode, Rect } from "../../packages/ag/src/types"

const originalStrict = process.env.SILVERY_STRICT
beforeEach(() => {
  process.env.SILVERY_STRICT = "2,cursor"
  resetStrictCache()
})
afterEach(() => {
  if (originalStrict === undefined) delete process.env.SILVERY_STRICT
  else process.env.SILVERY_STRICT = originalStrict
  resetStrictCache()
})

const SMALL: Rect = { x: 0, y: 0, width: 30, height: 12 }

function writeLine(buffer: TerminalBuffer, row: number, text: string): void {
  for (let col = 0; col < text.length && col < buffer.width; col++) {
    buffer.setCell(col, row, { char: text[col]! })
  }
}

/**
 * A FOCUSED editable owning the caret at (x,y). A focused declarer composites
 * unconditionally (NOT suppressed by the 19702 focus-gate), so this is the
 * normal "show the caret" tree.
 */
function focusedComposerAt(x: number, y: number, viewport: Rect = SMALL): AgNode {
  const composer = {
    type: "silvery-box",
    props: { focused: true, cursorOffset: { col: 0, row: 0, visible: true } },
    children: [],
    parent: null,
    scrollRect: { x, y, width: 10, height: 1 },
    boxRect: { x, y, width: 10, height: 1 },
    interactiveState: { focused: true },
  } as unknown as AgNode
  const root = {
    type: "silvery-root",
    props: {},
    children: [composer],
    parent: null,
    scrollRect: viewport,
    boxRect: viewport,
  } as unknown as AgNode
  ;(composer as { parent: AgNode }).parent = root
  return root
}

// ============================================================================
// Unit level — computeManagedFrame focus-shape policy (no xterm).
// ============================================================================

describe("computeManagedFrame focus-aware caret shape (20082)", () => {
  test("WINDOW FOCUSED → filled inverse block (byte-identical to the 19702 behavior)", () => {
    const src = new TerminalBuffer(SMALL.width, SMALL.height)
    writeLine(src, 5, "the composer prompt > ")

    // Explicitly focused.
    const focused = computeManagedFrame(src, focusedComposerAt(3, 5), "fullscreen", {
      windowFocused: true,
    })
    expect(focused.compositorCaret, "a caret must be composited when focused").not.toBeNull()
    expect(focused.compositorCaret!.style, "focused window → filled block").toBe("block")

    // The composited cell carries `inverse` (filled block) and NOT the hollow
    // box edges.
    const cellAttrs = focused.presentationBuffer.getCell(3, 5).attrs
    expect(cellAttrs.inverse, "focused caret cell must be inverse (filled)").toBe(true)
    expect(cellAttrs.overline, "focused caret must NOT have a top box edge").toBeFalsy()
    expect(cellAttrs.underline, "focused caret must NOT have a bottom box edge").toBeFalsy()

    // Hardware cursor parked-and-hidden (19702 hardware path).
    expect(focused.cursorSuffix, "focused frame hides the hardware cursor").toContain("\x1b[?25l")
    expect(focused.cursorSuffix, "focused frame must not show the hardware cursor").not.toContain(
      "\x1b[?25h",
    )
  })

  test("DEFAULT (windowFocused omitted) → filled block — never regress to hollow/hidden when focus is unknown", () => {
    const src = new TerminalBuffer(SMALL.width, SMALL.height)
    writeLine(src, 5, "the composer prompt > ")

    // No windowFocused param at all — the fail-safe default must be FOCUSED.
    const def = computeManagedFrame(src, focusedComposerAt(3, 5), "fullscreen")
    expect(def.compositorCaret, "default must still composite a caret").not.toBeNull()
    expect(def.compositorCaret!.style, "unknown focus defaults to filled block").toBe("block")
    expect(def.presentationBuffer.getCell(3, 5).attrs.inverse).toBe(true)
  })

  test("WINDOW UNFOCUSED → hollow rectangle (overline+underline), NOT hidden, NOT filled", () => {
    const src = new TerminalBuffer(SMALL.width, SMALL.height)
    writeLine(src, 5, "the composer prompt > ")

    const unfocused = computeManagedFrame(src, focusedComposerAt(3, 5), "fullscreen", {
      windowFocused: false,
    })
    // Still composited — focus state is VISIBLE, the caret is not hidden.
    expect(unfocused.compositorCaret, "unfocused caret must NOT be suppressed").not.toBeNull()
    expect(unfocused.compositorCaret!.style, "unfocused window → hollow rectangle").toBe("hollow")
    expect(unfocused.compositorCaret!.visible).toBe(true)

    // The composited cell carries the hollow-box edges (overline + underline)
    // and NOT inverse (it is not filled).
    const cellAttrs = unfocused.presentationBuffer.getCell(3, 5).attrs
    expect(cellAttrs.overline, "hollow caret must have a top box edge (overline)").toBe(true)
    expect(cellAttrs.underline, "hollow caret must have a bottom box edge (underline)").toBe(true)
    expect(cellAttrs.inverse, "hollow caret must NOT be filled (no inverse)").toBeFalsy()
  })

  test("UNFOCUSED still parks + HIDES the hardware cursor (does NOT show it — no 19702 strand)", () => {
    const src = new TerminalBuffer(SMALL.width, SMALL.height)
    writeLine(src, 5, "the composer prompt > ")

    const unfocused = computeManagedFrame(src, focusedComposerAt(3, 5), "fullscreen", {
      windowFocused: false,
    })
    // The hardware cursor MUST stay hidden in the unfocused state too. Showing it
    // would let a dropped `?25l` strand a visible hardware cursor (the 19702
    // class). The hollow shape comes from the COMPOSITED overlay, not the
    // hardware cursor.
    expect(unfocused.cursorSuffix, "unfocused frame must STILL hide the hardware cursor").toContain(
      "\x1b[?25l",
    )
    expect(
      unfocused.cursorSuffix,
      "unfocused frame must NOT show the hardware cursor",
    ).not.toContain("\x1b[?25h")
    // Parked at the caret cell (the editable locus), exactly like the focused path.
    expect(unfocused.cursorSuffix).toContain("\x1b[6;4H") // 1-indexed (x=3,y=5)
  })

  test("focus toggle reuses the overlay-clear path — no stranded inverse when block→hollow on a static row", () => {
    // Frame N: focused (block) at (3,5) → PAINT path, all rows dirty.
    const srcN = new TerminalBuffer(SMALL.width, SMALL.height)
    writeLine(srcN, 5, "the composer prompt > ")
    const frameN = computeManagedFrame(srcN, focusedComposerAt(3, 5), "fullscreen", {
      windowFocused: true,
    })
    expect(frameN.compositorCaret!.style).toBe("block")

    // Frame N+1: window blurs (hollow) at the SAME cell on a CLONED (all-clean)
    // buffer. The caret cell's row must be dirty so diffBuffers re-emits the cell
    // with the new (hollow) attrs and clears the prior inverse — the 19702
    // overlay-residue machinery, exercised by a shape change rather than a move.
    const srcN1 = srcN.clone()
    expect(srcN1.isRowDirty(5)).toBe(false)
    const frameN1 = computeManagedFrame(srcN1, focusedComposerAt(3, 5), "fullscreen", {
      windowFocused: false,
      prevCaret: frameN.compositorCaret,
    })
    expect(frameN1.compositorCaret!.style).toBe("hollow")
    expect(
      frameN1.presentationBuffer.isRowDirty(5),
      "the caret row must be dirty so the inverse→hollow shape change is diffed",
    ).toBe(true)
  })
})

// ============================================================================
// xterm byte-replay — what the terminal actually shows across a focus toggle.
// (xterm.js headless does not expose overline readback, but it DOES expose
//  inverse and underline; we assert the parts it can see + that the unfocused
//  caret is NOT a filled inverse block.)
// ============================================================================

interface RuntimeHarness {
  output: string
}

function renderFrames(
  dims: Dims,
  frames: Array<{ tree: AgNode; windowFocused: boolean }>,
  source: (dims: Dims) => TerminalBuffer,
): RuntimeHarness {
  const writes: string[] = []
  using runtime = createRuntime({
    mode: "fullscreen",
    outputPhaseFn: createOutputPhase({}),
    // Focus state read at render time by the runtime → computeManagedFrame.
    windowFocused: () => current.windowFocused,
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
  let current = frames[0]!
  for (const frame of frames) {
    current = frame
    // Fresh source buffer per frame (constructor → all rows dirty), so the
    // single-frame diff scans every row. The unit tests above pin the static-row
    // overlay-clear behavior.
    runtime.render({ text: "", ansi: "", nodes: frame.tree, _buffer: source(dims) })
  }
  return { output: writes.join("") }
}

function buildSource(dims: Dims): TerminalBuffer {
  const tb = new TerminalBuffer(dims.cols, dims.rows)
  writeLine(tb, 0, "active on @km/code/v0.2/20082 — focus-aware caret")
  for (let row = 1; row < dims.rows - 3; row++) {
    writeLine(tb, row, `   transcript line ${row} — focus shape content`)
  }
  writeLine(tb, dims.rows - 2, "  > ")
  return tb
}

interface ScannedCell {
  row: number
  col: number
  inverse: boolean
  underline: boolean
}

function scanCaretCell(output: string, dims: Dims, caret: { x: number; y: number }): ScannedCell {
  const terminal = createTerminal({
    backend: createXtermBackend(),
    cols: dims.cols,
    rows: dims.rows,
  })
  try {
    terminal.feed(output)
    const cell = terminal.getCell(caret.y, caret.x) as {
      inverse?: boolean
      underline?: string | boolean
    }
    return {
      row: caret.y,
      col: caret.x,
      inverse: cell.inverse === true,
      underline: cell.underline !== false && cell.underline !== undefined,
    }
  } finally {
    void terminal.close()
  }
}

describe("focus-aware caret — xterm byte-replay (20082)", () => {
  const dims: Dims = { cols: 50, rows: 16 }
  const viewport: Rect = { x: 0, y: 0, width: dims.cols, height: dims.rows }
  const caret = { x: 6, y: dims.rows - 2 }

  test("FOCUSED frame paints a filled inverse caret cell", () => {
    const { output } = renderFrames(
      dims,
      [{ tree: focusedComposerAt(caret.x, caret.y, viewport), windowFocused: true }],
      buildSource,
    )
    const scanned = scanCaretCell(output, dims, caret)
    expect(
      scanned.inverse,
      `focused caret cell must be inverse (filled).\n${output.length} bytes`,
    ).toBe(true)
  })

  test("UNFOCUSED frame paints a NON-filled caret cell (hollow box, underline edge visible to xterm)", () => {
    const { output } = renderFrames(
      dims,
      [{ tree: focusedComposerAt(caret.x, caret.y, viewport), windowFocused: false }],
      buildSource,
    )
    const scanned = scanCaretCell(output, dims, caret)
    // xterm.js cannot read overline, but it CAN read underline + inverse. The
    // hollow caret must NOT be a filled inverse block, and MUST carry the
    // underline (bottom) box edge.
    expect(scanned.inverse, "unfocused caret cell must NOT be a filled inverse block").toBe(false)
    expect(
      scanned.underline,
      "unfocused caret cell must carry the bottom box edge (underline)",
    ).toBe(true)
    // And the hardware cursor stays hidden (no ?25h emitted).
    expect(output, "unfocused frame must not show the hardware cursor").not.toContain("\x1b[?25h")
  })
})
