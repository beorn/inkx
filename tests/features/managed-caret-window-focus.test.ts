/**
 * @km/code/v0.2/20082 + @km/code/v0.2/19702 — focus-aware caret
 * (filled focused / HIDDEN unfocused).
 *
 * FEATURE: the Silver Code managed caret renders as a FILLED inverse BLOCK only
 * when the terminal/window is FOCUSED. When the window is UNFOCUSED, NO caret is
 * composited at all — the pane shows nothing.
 *
 * CONTRACT REFRAME (2026-06-18, user-explicit): the earlier 20082 design painted
 * a HOLLOW box when unfocused. The product contract is now hide-the-cursor-
 * COMPLETELY: a freshly-spawned, unfocused agent pane must show no caret. The
 * `"hollow"` shape is removed so it cannot reassert.
 *
 * DESIGN:
 *   - The hardware cursor stays parked-and-HIDDEN in BOTH focus states — byte-
 *     identical to the 19702 fix. With no composited caret either, an unfocused
 *     pane shows nothing, and a dropped/overridden `?25l` from cmux/Ghostty
 *     cannot strand a visible hardware cursor (the 19702 strand class).
 *   - Focus state is a SINGLE param threaded into computeManagedFrame
 *     (`windowFocused`, sourced from standard DEC `?1004` focus reporting).
 *     Default/unknown → FOCUSED (filled block) — never vanish the caret when
 *     focus is simply unknown (a single user with a focused terminal that never
 *     emits focusIn must still see the caret). Making an unfocused MULTIPLEXED
 *     pane report windowFocused=false is the host's job (deliver standard
 *     focusOut), not a bespoke protocol — see @km/code/v0.2/19702.
 *
 * INVARIANT under test:
 *   - FOCUSED frame  → compositorCaret.style === "block", the caret cell carries
 *     `inverse` (and NOT overline/underline), hardware cursor hidden.
 *   - UNFOCUSED frame → compositorCaret === null, the caret cell carries NO
 *     overlay attrs (not inverse, not box edges), hardware cursor STILL hidden.
 *
 * These tests run at SILVERY_STRICT=2,cursor.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest"
import { TerminalBuffer } from "../../packages/ag-term/src/buffer"
import { createOutputPhase } from "../../packages/ag-term/src/pipeline/output-phase"
import { createRuntime } from "../../packages/ag-term/src/runtime/create-runtime"
import { computeManagedFrame } from "../../packages/ag-term/src/managed-caret"
import { resetStrictCache } from "../../packages/ag-term/src/strict-mode"
import { preloadStrictTerminalBackends } from "../../packages/ag-term/src/strict-terminal-backends"
import { createTerminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import type { Buffer, Dims } from "../../packages/ag-term/src/runtime/types"
import type { AgNode, Rect } from "../../packages/ag/src/types"

// The cursor verifier replays output through xterm.js synchronously; its
// @termless ESM-graph load (post wave-3, not createRequire) must be preloaded.
beforeAll(async () => {
  await preloadStrictTerminalBackends()
})

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

  test("WINDOW UNFOCUSED → NO caret composited (hidden completely, not hollow)", () => {
    const src = new TerminalBuffer(SMALL.width, SMALL.height)
    writeLine(src, 5, "the composer prompt > ")

    const unfocused = computeManagedFrame(src, focusedComposerAt(3, 5), "fullscreen", {
      windowFocused: false,
    })
    // @km/code/v0.2/19702 (reframed 2026-06-18): an unfocused agent pane HIDES
    // the caret completely — no composited overlay at all (was 20082's hollow).
    expect(unfocused.compositorCaret, "unfocused window → no composited caret").toBeNull()

    // The caret cell carries NO overlay attrs — not inverse, not the old hollow
    // box edges. The pane shows nothing.
    const cellAttrs = unfocused.presentationBuffer.getCell(3, 5).attrs
    expect(cellAttrs.inverse ?? false, "no filled block").toBe(false)
    expect(cellAttrs.overline ?? false, "no top box edge (no hollow)").toBe(false)
    expect(cellAttrs.underline ?? false, "no bottom box edge (no hollow)").toBe(false)
  })

  test("UNFOCUSED still parks + HIDES the hardware cursor (no caret AND no 19702 strand)", () => {
    const src = new TerminalBuffer(SMALL.width, SMALL.height)
    writeLine(src, 5, "the composer prompt > ")

    const unfocused = computeManagedFrame(src, focusedComposerAt(3, 5), "fullscreen", {
      windowFocused: false,
    })
    // The hardware cursor MUST stay hidden in the unfocused state too. Showing it
    // would let a dropped `?25l` strand a visible hardware cursor (the 19702
    // class). With no composited caret either, the unfocused pane shows nothing.
    expect(unfocused.cursorSuffix, "unfocused frame must STILL hide the hardware cursor").toContain(
      "\x1b[?25l",
    )
    expect(
      unfocused.cursorSuffix,
      "unfocused frame must NOT show the hardware cursor",
    ).not.toContain("\x1b[?25h")
    // Parked at the editable locus, exactly like the focused path.
    expect(unfocused.cursorSuffix).toContain("\x1b[6;4H") // 1-indexed (x=3,y=5)
  })

  test("focus toggle reuses the overlay-clear path — no stranded inverse when block→hidden on a static row", () => {
    // Frame N: focused (block) at (3,5) → PAINT path, all rows dirty.
    const srcN = new TerminalBuffer(SMALL.width, SMALL.height)
    writeLine(srcN, 5, "the composer prompt > ")
    const frameN = computeManagedFrame(srcN, focusedComposerAt(3, 5), "fullscreen", {
      windowFocused: true,
    })
    expect(frameN.compositorCaret!.style).toBe("block")

    // Frame N+1: window blurs → the caret is SUPPRESSED (hidden) on a CLONED
    // (all-clean) buffer. The prior caret cell's row must be dirty so diffBuffers
    // re-emits the cell WITHOUT the inverse — the 19702 overlay-residue machinery,
    // exercised by suppression rather than a move.
    const srcN1 = srcN.clone()
    expect(srcN1.isRowDirty(5)).toBe(false)
    const frameN1 = computeManagedFrame(srcN1, focusedComposerAt(3, 5), "fullscreen", {
      windowFocused: false,
      prevCaret: frameN.compositorCaret,
    })
    expect(frameN1.compositorCaret, "blur suppresses the caret entirely").toBeNull()
    expect(
      frameN1.presentationBuffer.isRowDirty(5),
      "the prior caret row must be dirty so the inverse→hidden change is diffed",
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

  test("UNFOCUSED frame paints NO caret cell — not filled, not a box edge (hidden)", () => {
    const { output } = renderFrames(
      dims,
      [{ tree: focusedComposerAt(caret.x, caret.y, viewport), windowFocused: false }],
      buildSource,
    )
    const scanned = scanCaretCell(output, dims, caret)
    // @km/code/v0.2/19702 (reframed): an unfocused pane composites NO caret, so
    // the cell is plain — not a filled inverse block AND not the old hollow box
    // (no underline edge). xterm.js reads inverse + underline; both must be off.
    expect(scanned.inverse, "unfocused caret cell must NOT be a filled inverse block").toBe(false)
    expect(
      scanned.underline,
      "unfocused caret cell must NOT carry a box edge (hidden, not hollow)",
    ).toBe(false)
    // And the hardware cursor stays hidden (no ?25h emitted).
    expect(output, "unfocused frame must not show the hardware cursor").not.toContain("\x1b[?25h")
  })
})
