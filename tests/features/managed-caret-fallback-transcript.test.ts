/**
 * @km/code/v0.2/19702 — cursor-above-composer (#undead, ≥7 live recurrences).
 *
 * The four prior fixes (silvery 26616526, app anchor, composited-caret
 * 056b80046/7374849df, residue 01fab657b) each addressed a DIFFERENT mechanism
 * (hardware-cursor park/hide, no-op-frame inverse residue). None addressed the
 * SELECTION mechanism that strands a COMPOSITED inverse content cell in the
 * transcript.
 *
 * Live evidence (Gate -1, @agent/1 active Write-tool frame, agent1-recent.ansi):
 * the captured raw bytes silvery emitted contain exactly ONE `ESC[7m`
 * reverse-video space cell at a blank transcript row, FOUR rows above the
 * composer, and ZERO `?25h`/CUP escapes. So the artifact is NOT a leaked
 * hardware cursor — it is a Silvery-OWNED composited caret painted into the
 * presentation buffer at the wrong place. Every hardware-cursor park/hide fix
 * and the `SILVERY_STRICT=cursor` diagnostics stay GREEN while the live pane is
 * RED because they instrument a different subsystem.
 *
 * ROOT MECHANISM (H1): during an active turn the composer is unfocused, so
 * `findActiveCursorRect` (layout-signals) returns its FALLBACK track — ANY node
 * with `cursorOffset.visible !== false` that is not focused becomes the active
 * caret (`focusedSuppressesFallback` is false because nothing is focused).
 * `composeManagedCaret` then paints that fallback caret as an `inverse` cell at
 * the node's (transcript) position. silvery `TextInput` sets
 * `cursorOffset.visible = isActive`, and `isActive` defaults to `true` when the
 * input has no testID — so a mounted-but-unfocused editable anywhere in the
 * transcript region (or a still-`isActive` composer that lost input focus while
 * a turn runs) strands a reverse-video block several rows above the prompt.
 *
 * Live path: silvercode → run() → createApp → runtime.render() →
 * create-runtime.ts:350 (findActiveCursorRect → composeManagedCaret). This test
 * drives `createRuntime` directly — the SAME render entry the live app uses —
 * with an active-turn node tree, then replays the emitted bytes through a real
 * xterm.js grid and scans for stranded inverse cells. This is the assertion
 * class that goes RED on THIS artifact: the existing 19702 suites (parking,
 * no-op residue, idle process-harness) all stay GREEN.
 *
 * The four existing app-side 19702 regression tests pass because:
 *  - parking.test.ts only models no-cursor + focused-cursor frames;
 *  - inverse-blank-residue.spec.tsx focuses the composer (no fallback);
 *  - the process-harness idle test asserts on the cmux-rendered screen, not the
 *    raw emitted bytes through a clean emulator, and its scripts keep the
 *    composer focused or carry no visible transcript cursorOffset.
 */

import { afterEach, describe, expect, test } from "vitest"
import { TerminalBuffer } from "../../packages/ag-term/src/buffer"
import { createOutputPhase } from "../../packages/ag-term/src/pipeline/output-phase"
import { createRuntime } from "../../packages/ag-term/src/runtime/create-runtime"
import { createTerminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import type { Buffer, Dims } from "../../packages/ag-term/src/runtime/types"
import type { AgNode, Rect } from "../../packages/ag/src/types"

const originalStrict = process.env.SILVERY_STRICT
afterEach(() => {
  if (originalStrict === undefined) delete process.env.SILVERY_STRICT
  else process.env.SILVERY_STRICT = originalStrict
})

function writeLine(buffer: TerminalBuffer, row: number, text: string): void {
  for (let col = 0; col < text.length && col < buffer.width; col++) {
    buffer.setCell(col, row, { char: text[col]! })
  }
}

/**
 * Build an active-turn node tree mirroring the live Herdr pane:
 *
 *   rows 0..(promptRow-2)  transcript / activity content
 *   transcriptCursorRow    a mounted-but-UNFOCUSED editable carrying a visible
 *                          cursorOffset (the live `TextInput` default state)
 *   promptRow              the composer prompt `>` (unfocused during the turn)
 *   rows below             status / chrome
 *
 * Critically NOTHING is focused — exactly the active-turn state. With no focused
 * cursor owner, findActiveCursorRect falls back to the transcript editable.
 */
function activeTurnTree(
  dims: Dims,
  opts: { transcriptCursorRow: number; promptRow: number },
): AgNode {
  const fullViewport: Rect = { x: 0, y: 0, width: dims.cols, height: dims.rows }

  // An UNFOCUSED editable sitting in the transcript region. visible: true
  // mirrors silvery TextInput's `cursorOffset.visible = isActive` default.
  const transcriptEditable: AgNode = {
    type: "silvery-box",
    props: { cursorOffset: { col: 0, row: 0, visible: true } },
    children: [],
    parent: null,
    scrollRect: { x: 5, y: opts.transcriptCursorRow, width: 20, height: 1 },
    boxRect: { x: 5, y: opts.transcriptCursorRow, width: 20, height: 1 },
    interactiveState: { focused: false },
  } as unknown as AgNode

  // The composer prompt — also unfocused while the turn runs.
  const composer: AgNode = {
    type: "silvery-box",
    props: { cursorOffset: { col: 0, row: 0, visible: false } },
    children: [],
    parent: null,
    scrollRect: { x: 2, y: opts.promptRow, width: dims.cols - 4, height: 1 },
    boxRect: { x: 2, y: opts.promptRow, width: dims.cols - 4, height: 1 },
    interactiveState: { focused: false },
  } as unknown as AgNode

  const root: AgNode = {
    type: "silvery-root",
    props: {},
    children: [transcriptEditable, composer],
    parent: null,
    scrollRect: fullViewport,
    boxRect: fullViewport,
  } as unknown as AgNode

  // Backref so any walk that reads `.parent` is consistent.
  ;(transcriptEditable as { parent: AgNode }).parent = root
  ;(composer as { parent: AgNode }).parent = root

  return root
}

function activeTurnBuffer(dims: Dims, promptRow: number): TerminalBuffer {
  const tb = new TerminalBuffer(dims.cols, dims.rows)
  writeLine(tb, 0, "active on @km/code/v0.2/19702")
  writeLine(tb, 2, " • Read packages/km-infra/oxlint/config.json (36 lines)")
  // promptRow-2 stays blank — the live artifact landed on a BLANK transcript row.
  writeLine(tb, promptRow, "  > ")
  writeLine(tb, dims.rows - 2, " ● working (13m40s)")
  writeLine(tb, dims.rows - 1, " Claude Opus 4.8 xhigh fast  »auto  focus")
  return tb
}

function renderActiveTurn(
  dims: Dims,
  opts: { transcriptCursorRow: number; promptRow: number },
): string {
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
  const tb = activeTurnBuffer(dims, opts.promptRow)
  const nodes = activeTurnTree(dims, opts)
  const buf: Buffer = { text: "", ansi: "", nodes, _buffer: tb }
  runtime.render(buf)
  return writes.join("")
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

describe("19702 (#undead) — active-turn fallback caret must not strand an inverse cell in transcript", () => {
  // Live Herdr pane rects: ~48-85 cols × 122 rows. Both widths from the captures.
  for (const [COLS, ROWS, label] of [
    [85, 122, "capture B (85x122)"],
    [50, 122, "capture A (50x122)"],
  ] as const) {
    test(`${label}: no composited inverse caret painted on a transcript row`, () => {
      const dims: Dims = { cols: COLS, rows: ROWS }
      // Composer near the bottom; a transcript editable 4 rows above it, on a
      // blank row — the exact live geometry (row 107 cell, composer row 111).
      const promptRow = ROWS - 11
      const transcriptCursorRow = promptRow - 4

      const frame = renderActiveTurn(dims, { transcriptCursorRow, promptRow })
      const inverse = scanInverse(frame, dims)

      // The artifact: any inverse cell ABOVE the composer prompt row. The
      // composer is unfocused during the turn, so the ONLY legitimate inverse
      // is a composer-bounds caret (and even that is hidden here — composer
      // cursorOffset.visible is false). Anything on a transcript row is the bug.
      const strandedAbove = inverse.filter((c) => c.row < promptRow)

      const report =
        `geometry=${COLS}x${ROWS} promptRow=${promptRow} transcriptCursorRow=${transcriptCursorRow}\n` +
        `allInverseCells=${JSON.stringify(inverse)}\n` +
        `strandedAboveComposer=${JSON.stringify(strandedAbove)}\n` +
        `emittedHasReverseVideo=${frame.includes("\x1b[7m")}\n` +
        `emittedHasShowCursor=${frame.includes("\x1b[?25h")}`

      expect(
        strandedAbove,
        `composited fallback caret stranded an inverse cell on a transcript row (the 19702 artifact)\n${report}`,
      ).toEqual([])
    })
  }
})
