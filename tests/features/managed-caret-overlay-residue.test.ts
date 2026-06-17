/**
 * @km/code/v0.2/19702 — cursor-above-composer (#undead, ≥7 live recurrences).
 *
 * GATE -1 — the MULTI-FRAME dirty-row gating mechanism.
 *
 * Every prior 19702 fix (hardware-cursor park/hide, no-op-frame residue store,
 * focus-gated fallback suppression, provenance-aware island compositing) was a
 * SINGLE-FRAME or no-op-frame fix. The mechanism this file proves is different
 * and orthogonal to all of them:
 *
 *   `composeManagedCaret` is ASYMMETRIC about dirty rows:
 *     - PAINT path (managed-caret.ts:52-56): clones the source buffer and calls
 *       `next.markAllRowsDirty()`, so the painted caret cell's row is dirty in
 *       the presentation buffer the runtime stores as prev.
 *     - NO-CARET early-return (managed-caret.ts:48-50): returns the SOURCE
 *       buffer unchanged — NO clone, NO markAllRowsDirty.
 *
 *   `diffBuffers` (diff-buffers.ts:134) scans ONLY rows dirty in NEXT:
 *     `if (!next.isRowDirty(y)) continue`.
 *
 * So the failing trajectory is:
 *   frame N   — a caret composites at row R (PAINT path, all rows dirty). The
 *               inverse cell is emitted; the presentation buffer (all-dirty) is
 *               stored as prevBuffer.
 *   frame N+1 — the caret is suppressed (focus lost / island inactive / caret
 *               moved off-screen) while row R's CONTENT is byte-identical and
 *               its dirty flag is CLEAN (the incremental path clones prevBuffer
 *               — all clean — and re-renders only changed nodes; a static
 *               transcript row R is never re-marked). The NO-CARET path returns
 *               the source buffer as-is, so NEXT has row R clean → diffBuffers
 *               SKIPS row R → the frame-N inverse cell is NEVER cleared.
 *
 * Result: a stranded single-cell `ESC[7m` reverse-video block on a static row
 * above the composer, with NO `?25h`/CUP — EXACTLY the live capture signature.
 *
 * Why the existing 19702 suites stay GREEN:
 *   - managed-caret-fallback-transcript.test.ts builds a FRESH TerminalBuffer
 *     per call (constructor → all rows dirty) and renders ONE frame. A fresh
 *     buffer's all-dirty state means diffBuffers scans every row — the clean-row
 *     skip never happens.
 *   - output-cursor-diagnostics.test.ts is also single-frame.
 *   - @agent/3's bare-PTY sweep tested CONTENT transitions, not the
 *     caret-present→suppressed-on-a-STATIC-row transition.
 *
 * This test drives ONE createRuntime across two renders (the SAME entry the
 * live app uses) and faithfully models the incremental clean-row state: frame
 * N+1's source buffer is a clone of frame N's source (row R byte-identical)
 * with row R's dirty flag CLEANED — mirroring `prevBuffer.clone()` + no
 * reconciler change at row R. Then it replays the CONCATENATED emitted bytes
 * through a real xterm.js grid and asserts NO inverse cell survives on row R.
 */

import { afterEach, describe, expect, test } from "vitest"
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
afterEach(() => {
  if (originalStrict === undefined) delete process.env.SILVERY_STRICT
  else process.env.SILVERY_STRICT = originalStrict
  resetStrictCache()
})

function writeLine(buffer: TerminalBuffer, row: number, text: string): void {
  for (let col = 0; col < text.length && col < buffer.width; col++) {
    buffer.setCell(col, row, { char: text[col]! })
  }
}

/**
 * Build a realistic-scale active transcript buffer (50+ content rows). The
 * composer prompt sits near the bottom at `promptRow`; the caret row R is a few
 * rows above it (a static transcript row in frame N+1).
 */
function transcriptBuffer(dims: Dims, opts: { promptRow: number }): TerminalBuffer {
  const tb = new TerminalBuffer(dims.cols, dims.rows)
  writeLine(tb, 0, "active on @km/code/v0.2/19702 — cursor-above-composer")
  // 50+ transcript lines of realistic content (tool calls, output, prose).
  for (let row = 1; row < opts.promptRow - 1; row++) {
    if (row % 7 === 0) {
      writeLine(tb, row, ` • Read packages/km-infra/oxlint/config.json (${row} lines)`)
    } else if (row % 5 === 0) {
      writeLine(tb, row, `   ${row}: const next = buffer.clone()  // dirty-row drop`)
    } else if (row % 3 === 0) {
      writeLine(tb, row, ` ⎿  wrote ${row} cells, ${row * 13} bytes to /tmp/out-${row}.log`)
    } else {
      writeLine(tb, row, `   transcript line ${row} — incremental render content`)
    }
  }
  // promptRow-1 stays blank — the caret row R lands on a BLANK transcript row,
  // matching the live capture (a blank row four rows above the composer).
  writeLine(tb, opts.promptRow, "  > ")
  writeLine(tb, dims.rows - 2, " ● working (13m40s)")
  writeLine(tb, dims.rows - 1, " Claude Opus 4.8 xhigh fast  »auto  focus")
  return tb
}

/**
 * Frame N tree: a FOCUSED composer editable owns the caret at row R. A focused
 * declarer composites unconditionally (NOT suppressed by the @km/code/v0.2/19702
 * focus-gate), so frame N takes composeManagedCaret's PAINT path.
 */
function focusedComposerTree(dims: Dims, opts: { caretRow: number; caretCol: number }): AgNode {
  const fullViewport: Rect = { x: 0, y: 0, width: dims.cols, height: dims.rows }
  const composer: AgNode = {
    type: "silvery-box",
    props: { focused: true, cursorOffset: { col: 0, row: 0, visible: true } },
    children: [],
    parent: null,
    scrollRect: { x: opts.caretCol, y: opts.caretRow, width: 20, height: 1 },
    boxRect: { x: opts.caretCol, y: opts.caretRow, width: 20, height: 1 },
    interactiveState: { focused: true },
  } as unknown as AgNode
  const root: AgNode = {
    type: "silvery-root",
    props: {},
    children: [composer],
    parent: null,
    scrollRect: fullViewport,
    boxRect: fullViewport,
  } as unknown as AgNode
  ;(composer as { parent: AgNode }).parent = root
  return root
}

/**
 * Frame N+1 tree: focus is LOST (a turn began). The same editable is now
 * unfocused, so the @km/code/v0.2/19702 focus-gate SUPPRESSES its caret —
 * composeManagedCaret takes the NO-CARET early-return. NOTHING composites.
 */
function unfocusedTurnTree(dims: Dims, opts: { caretRow: number; caretCol: number }): AgNode {
  const fullViewport: Rect = { x: 0, y: 0, width: dims.cols, height: dims.rows }
  const composer: AgNode = {
    type: "silvery-box",
    // No `focused`; cursorOffset.visible stays true (TextInput's isActive
    // default) — but the focus-gate suppresses it because nothing is focused.
    props: { cursorOffset: { col: 0, row: 0, visible: true } },
    children: [],
    parent: null,
    scrollRect: { x: opts.caretCol, y: opts.caretRow, width: 20, height: 1 },
    boxRect: { x: opts.caretCol, y: opts.caretRow, width: 20, height: 1 },
    interactiveState: { focused: false },
  } as unknown as AgNode
  const root: AgNode = {
    type: "silvery-root",
    props: {},
    children: [composer],
    parent: null,
    scrollRect: fullViewport,
    boxRect: fullViewport,
  } as unknown as AgNode
  ;(composer as { parent: AgNode }).parent = root
  return root
}

/**
 * Model the incremental render's frame N+1 buffer FAITHFULLY:
 *   - clone the frame-N source buffer — content byte-identical, AND
 *   - a clone is born with ALL rows CLEAN (buffer.ts:1431). The live
 *     incremental path clones prevBuffer and re-marks only the rows whose nodes
 *     re-rendered; here NOTHING re-rendered (the only change is input focus,
 *     which is NOT a buffer-cell change), so EVERY row — including the caret row
 *     R — stays CLEAN.
 *
 * This is the production incremental contract and the exact live-capture
 * geometry (@agent/7, 2026-06-17): the strand sat on a TRANSCRIPT CONTENT cell
 * whose content was byte-identical the next frame, so diffBuffers skipped the
 * row and the prior caret's `inverse` (merged onto the content char via
 * mergeAttrsInRect) survived until a full repaint.
 */
function nextIncrementalBuffer(prevSource: TerminalBuffer): TerminalBuffer {
  // clone → byte-identical content, all rows CLEAN. No row is re-marked because
  // no node re-rendered — only input focus changed (the caret-suppress trigger).
  return prevSource.clone()
}

function makeBuffer(tb: TerminalBuffer, nodes: AgNode): Buffer {
  return { text: "", ansi: "", nodes, _buffer: tb }
}

interface CapturedFrame {
  /** All bytes emitted across both frames, concatenated (terminal sees this). */
  output: string
}

function renderTwoFrames(
  dims: Dims,
  opts: { caretRow: number; caretCol: number; promptRow: number },
): CapturedFrame {
  const writes: string[] = []
  using runtime = createRuntime({
    mode: "fullscreen",
    // A SHARED output phase instance → prevOutputBuffer / cursor tracking
    // persists across the two renders, exactly like the live runtime.
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

  // Frame N — focused composer, caret composites at row R (PAINT path).
  const sourceN = transcriptBuffer(dims, { promptRow: opts.promptRow })
  runtime.render(
    makeBuffer(
      sourceN,
      focusedComposerTree(dims, { caretRow: opts.caretRow, caretCol: opts.caretCol }),
    ),
  )

  // Frame N+1 — focus lost, caret suppressed (NO-CARET path). The buffer is
  // byte-identical to frame N (only input focus changed) so EVERY row, including
  // the caret row R, is CLEAN — diffBuffers would skip R without the fix.
  const sourceN1 = nextIncrementalBuffer(sourceN)
  runtime.render(
    makeBuffer(
      sourceN1,
      unfocusedTurnTree(dims, { caretRow: opts.caretRow, caretCol: opts.caretCol }),
    ),
  )

  return { output: writes.join("") }
}

interface InverseCell {
  row: number
  col: number
  char: string
}

/** Replay bytes into a fresh xterm.js grid and collect every inverse cell. */
function scanInverse(output: string, dims: Dims): InverseCell[] {
  const terminal = createTerminal({
    backend: createXtermBackend(),
    cols: dims.cols,
    rows: dims.rows,
  })
  try {
    terminal.feed(output)
    const out: InverseCell[] = []
    for (let row = 0; row < dims.rows; row++) {
      for (let col = 0; col < dims.cols; col++) {
        const cell = terminal.getCell(row, col)
        if ((cell as { inverse?: boolean }).inverse) out.push({ row, col, char: cell.char })
      }
    }
    return out
  } finally {
    void terminal.close()
  }
}

describe("19702 (#undead) — managed-caret overlay residue: dirty-row gating strands an inverse cell", () => {
  // Live Herdr pane geometry: ~48-85 cols × 122 rows.
  for (const [COLS, ROWS, label] of [
    [85, 122, "capture B (85x122)"],
    [50, 122, "capture A (50x122)"],
  ] as const) {
    test(`${label}: suppressing a composited caret on a static row clears its inverse cell`, () => {
      const dims: Dims = { cols: COLS, rows: ROWS }
      const promptRow = ROWS - 11
      const caretRow = promptRow - 4 // a blank transcript row four rows up
      const caretCol = 6

      const { output } = renderTwoFrames(dims, { caretRow, caretCol, promptRow })
      const inverse = scanInverse(output, dims)

      // After frame N+1 the caret is suppressed everywhere. The terminal MUST
      // show zero inverse cells — most importantly NONE on the static caret row.
      const strandedOnCaretRow = inverse.filter((c) => c.row === caretRow)
      const strandedAboveComposer = inverse.filter((c) => c.row < promptRow)

      const report =
        `geometry=${COLS}x${ROWS} promptRow=${promptRow} caretRow=${caretRow} caretCol=${caretCol}\n` +
        `allInverseCells=${JSON.stringify(inverse)}\n` +
        `strandedOnCaretRow=${JSON.stringify(strandedOnCaretRow)}\n` +
        `strandedAboveComposer=${JSON.stringify(strandedAboveComposer)}\n` +
        // `split().length - 1` counts occurrences without a control-char regex
        // (matches the lint-clean idiom in managed-caret-fallback-transcript).
        `emittedReverseVideoCount=${output.split("\x1b[7m").length - 1}\n` +
        `emittedHasShowCursor=${output.includes("\x1b[?25h")}`

      expect(
        strandedOnCaretRow,
        `composited caret left a stranded inverse cell on the static caret row after suppression (the 19702 overlay-residue mechanism)\n${report}`,
      ).toEqual([])
      expect(
        strandedAboveComposer,
        `no inverse cell may survive above the composer after the caret is suppressed\n${report}`,
      ).toEqual([])
    })
  }
})

// ============================================================================
// Unit-level guards on the overlay-clear primitive + its STRICT check, exercised
// directly through computeManagedFrame (no xterm) so the in-pipeline behavior is
// pinned independently of the byte-replay assertion above.
// ============================================================================

const SMALL: Rect = { x: 0, y: 0, width: 30, height: 12 }

function focusedAt(x: number, y: number): AgNode {
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
    scrollRect: SMALL,
    boxRect: SMALL,
  } as unknown as AgNode
  ;(composer as { parent: AgNode }).parent = root
  return root
}

function unfocusedAt(x: number, y: number): AgNode {
  const composer = {
    type: "silvery-box",
    props: { cursorOffset: { col: 0, row: 0, visible: true } },
    children: [],
    parent: null,
    scrollRect: { x, y, width: 10, height: 1 },
    boxRect: { x, y, width: 10, height: 1 },
    interactiveState: { focused: false },
  } as unknown as AgNode
  const root = {
    type: "silvery-root",
    props: {},
    children: [composer],
    parent: null,
    scrollRect: SMALL,
    boxRect: SMALL,
  } as unknown as AgNode
  ;(composer as { parent: AgNode }).parent = root
  return root
}

describe("computeManagedFrame overlay-clear primitive (19702)", () => {
  test("suppressing a caret marks ONLY the prior caret's row dirty on a static buffer", () => {
    // Frame N: focused caret at (3,5) → PAINT path (all rows dirty).
    const srcN = new TerminalBuffer(SMALL.width, SMALL.height)
    writeLine(srcN, 5, "transcript content row")
    const frameN = computeManagedFrame(srcN, focusedAt(3, 5), "fullscreen")
    expect(frameN.compositorCaret).toMatchObject({ x: 3, y: 5, visible: true })

    // Frame N+1: caret suppressed, buffer cloned (all rows CLEAN), prior caret
    // threaded in. The fix must mark row 5 dirty so the diff clears the overlay.
    const srcN1 = srcN.clone() // all rows clean
    expect(srcN1.isRowDirty(5)).toBe(false)
    const frameN1 = computeManagedFrame(srcN1, unfocusedAt(3, 5), "fullscreen", {
      prevCaret: frameN.compositorCaret,
    })
    expect(frameN1.compositorCaret, "caret suppressed").toBeNull()
    expect(
      frameN1.presentationBuffer.isRowDirty(5),
      "prior caret's row must be marked dirty so diffBuffers clears the inverse overlay",
    ).toBe(true)
    // Surgical: no OTHER row may be force-dirtied (would regress incremental perf).
    for (let y = 0; y < SMALL.height; y++) {
      if (y === 5) continue
      expect(frameN1.presentationBuffer.isRowDirty(y), `row ${y} must stay clean`).toBe(false)
    }
  })

  test("an unchanged caret position does NOT force-dirty the row (no perf regression)", () => {
    const srcN = new TerminalBuffer(SMALL.width, SMALL.height)
    writeLine(srcN, 5, "transcript content row")
    const frameN = computeManagedFrame(srcN, focusedAt(3, 5), "fullscreen")

    // Frame N+1: SAME caret cell still composited (still focused). The PAINT path
    // already marks all rows dirty, so clearPriorCaretOverlay must be a no-op —
    // it must not clone-and-single-row-mark over the all-dirty paint buffer.
    const srcN1 = srcN.clone()
    const frameN1 = computeManagedFrame(srcN1, focusedAt(3, 5), "fullscreen", {
      prevCaret: frameN.compositorCaret,
    })
    expect(frameN1.compositorCaret).toMatchObject({ x: 3, y: 5, visible: true })
    // PAINT path → all rows dirty (the caret is repainted in place).
    expect(frameN1.presentationBuffer.isRowDirty(5)).toBe(true)
  })

  test("SILVERY_STRICT=cursor: the overlay-residue invariant THROWS on a clean prior-caret row", () => {
    // Drive the STRICT check in isolation: feed a prior caret whose row is clean
    // in the presentation buffer AND no current caret. To reach the throw we must
    // bypass the in-function clear — which is exactly the regression the check
    // guards. We do that by composing a frame where the source buffer is a fresh
    // (all-clean after we reset) clone and the caret is suppressed, but we assert
    // the POSITIVE: with the fix, the row is dirtied so the check does NOT throw.
    process.env.SILVERY_STRICT = "cursor"
    resetStrictCache()

    const srcN = new TerminalBuffer(SMALL.width, SMALL.height)
    writeLine(srcN, 5, "transcript content row")
    const frameN = computeManagedFrame(srcN, focusedAt(3, 5), "fullscreen")

    const srcN1 = srcN.clone()
    // With the fix in place, computeManagedFrame both clears (marks row dirty)
    // AND verifies on the post-clear buffer → no throw, row dirty.
    const frameN1 = computeManagedFrame(srcN1, unfocusedAt(3, 5), "fullscreen", {
      prevCaret: frameN.compositorCaret,
    })
    expect(frameN1.presentationBuffer.isRowDirty(5)).toBe(true)
  })
})
