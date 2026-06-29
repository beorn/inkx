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
import { computeManagedFrame } from "../../packages/ag-term/src/managed-caret"
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

// ============================================================================
// Provenance suite — the suppression decision must come from the SAME walk that
// produces the cursor rect. A non-focused DECLARATIVE fallback is suppressed;
// a FOCUSED declarer and a `cursorActive` ISLAND are composited. (Regression
// guard for the inner no-parallel-derivation bug: the focus-gate used a second,
// island-blind `findActiveCursorNode` walk that diverged from the rect-walk on
// islands and clipping, vanishing island host-carets — @km/silvery/19426.)
// ============================================================================

const VIEWPORT: Rect = { x: 0, y: 0, width: 40, height: 12 }

function rootWith(children: AgNode[]): AgNode {
  const root = {
    type: "silvery-root",
    props: {},
    children,
    parent: null,
    scrollRect: VIEWPORT,
    boxRect: VIEWPORT,
  } as unknown as AgNode
  for (const c of children) (c as { parent: AgNode }).parent = root
  return root
}

/** A FOCUSED declarative editable — its caret MUST composite. */
function focusedEditableNode(x: number, y: number): AgNode {
  return {
    type: "silvery-box",
    props: { focused: true, cursorOffset: { col: 0, row: 0, visible: true } },
    children: [],
    parent: null,
    scrollRect: { x, y, width: 20, height: 1 },
    boxRect: { x, y, width: 20, height: 1 },
    interactiveState: { focused: true },
  } as unknown as AgNode
}

/** A NON-focused declarative editable — its caret MUST be suppressed. */
function unfocusedEditableNode(x: number, y: number): AgNode {
  return {
    type: "silvery-box",
    props: { cursorOffset: { col: 0, row: 0, visible: true } },
    children: [],
    parent: null,
    scrollRect: { x, y, width: 20, height: 1 },
    boxRect: { x, y, width: 20, height: 1 },
    interactiveState: { focused: false },
  } as unknown as AgNode
}

/**
 * A `cursorActive` island — its guest cursor MUST composite as the host caret,
 * INDEPENDENT of input focus (the island is NOT silvery-focused). Mirrors the
 * shape `findActiveCursorRect`'s island branch reads (layout-signals.ts):
 * `node.type === "silvery-island"`, `islandState.cursorActive`,
 * `islandState.handle.output.{cursor,cursorVisible}`, `screenRect ?? boxRect`.
 */
function cursorActiveIslandNode(
  rect: Rect,
  cursor: { col: number; row: number },
  visible = true,
): AgNode {
  return {
    type: "silvery-island",
    props: {},
    children: [],
    parent: null,
    scrollRect: rect,
    boxRect: rect,
    screenRect: rect,
    islandState: {
      cursorActive: true,
      handle: {
        output: {
          cursor: { col: cursor.col, row: cursor.row, style: "block" },
          cursorVisible: visible,
        },
      },
    },
  } as unknown as AgNode
}

function freshViewportBuffer(): TerminalBuffer {
  const tb = new TerminalBuffer(VIEWPORT.width, VIEWPORT.height)
  writeLine(tb, 0, "host chrome")
  writeLine(tb, VIEWPORT.height - 1, "status bar")
  return tb
}

describe("managed-caret provenance — suppress only non-focused declarative fallback", () => {
  test("cursorActive island: guest cursor IS published as the host HARDWARE caret (19426 intent / 20398)", () => {
    const islandRect: Rect = { x: 4, y: 3, width: 20, height: 5 }
    const root = rootWith([cursorActiveIslandNode(islandRect, { col: 3, row: 1 })])
    const managed = computeManagedFrame(freshViewportBuffer(), root, "fullscreen")

    const expectedX = islandRect.x + 3
    const expectedY = islandRect.y + 1
    const inverse = bufferInverseCells(managed.presentationBuffer)
    const report =
      `compositorCaret=${JSON.stringify(managed.compositorCaret)}\n` +
      `cursorSuffix=${JSON.stringify(managed.cursorSuffix)}\n` +
      `expectedTerminal=${JSON.stringify(managed.expectedTerminal)}\n` +
      `expectedCaret={x:${expectedX},y:${expectedY}}\n` +
      `inverseCells=${JSON.stringify(inverse)}`

    // @hab/.../20398: an island is a REAL guest terminal (a shell PTY) — its guest
    // cursor renders as the host HARDWARE caret (a real, VISIBLE cursor at the
    // guest cell), NOT a composited inverse block. So NOTHING is composited into
    // the presentation buffer...
    expect(
      managed.compositorCaret,
      `island host-caret must NOT composite an inverse block — it is shown as the real hardware cursor\n${report}`,
    ).toBeNull()
    expect(inverse, `no inverse cell may be painted for an island host-caret\n${report}`).toEqual(
      [],
    )
    // ...and the hardware cursor is SHOWN (`?25h`), parked on the guest cell.
    expect(
      managed.cursorSuffix,
      `island host-caret must SHOW the hardware cursor at the guest cell (?25h)\n${report}`,
    ).toContain(`\x1b[${expectedY + 1};${expectedX + 1}H\x1b[?25h`)
    expect(
      managed.expectedTerminal,
      `the terminal cursor must end VISIBLE at the guest cell\n${report}`,
    ).toMatchObject({
      x: expectedX,
      y: expectedY,
      visible: true,
    })
  })

  test("cursorActive island in an UNFOCUSED window: hardware cursor stays HIDDEN (20398 gating)", () => {
    // The island host-caret is shown as a real hardware cursor ONLY when the
    // terminal WINDOW is focused. An unfocused window shows nothing — the cursor
    // is parked-and-hidden like any other managed frame, so it can't strand a
    // visible cursor in a backgrounded pane.
    const islandRect: Rect = { x: 4, y: 3, width: 20, height: 5 }
    const root = rootWith([cursorActiveIslandNode(islandRect, { col: 3, row: 1 })])
    const managed = computeManagedFrame(freshViewportBuffer(), root, "fullscreen", {
      windowFocused: false,
    })
    const report =
      `compositorCaret=${JSON.stringify(managed.compositorCaret)}\n` +
      `cursorSuffix=${JSON.stringify(managed.cursorSuffix)}\n` +
      `expectedTerminal=${JSON.stringify(managed.expectedTerminal)}`
    expect(managed.compositorCaret, `unfocused window composites nothing\n${report}`).toBeNull()
    expect(
      bufferInverseCells(managed.presentationBuffer),
      `unfocused window paints no caret cell\n${report}`,
    ).toEqual([])
    expect(
      managed.cursorSuffix,
      `unfocused window must HIDE the hardware cursor (?25l), never show it\n${report}`,
    ).toContain("\x1b[?25l")
    expect(
      managed.cursorSuffix,
      `unfocused window must NOT show the hardware cursor\n${report}`,
    ).not.toContain("\x1b[?25h")
  })

  test("focused declarative editable: caret IS composited", () => {
    const root = rootWith([focusedEditableNode(6, 5)])
    const managed = computeManagedFrame(freshViewportBuffer(), root, "fullscreen")
    expect(managed.compositorCaret, "focused declarative caret must composite").toMatchObject({
      x: 6,
      y: 5,
      visible: true,
    })
  })

  test("non-focused declarative fallback: caret is SUPPRESSED (19702)", () => {
    const root = rootWith([unfocusedEditableNode(6, 5)])
    const managed = computeManagedFrame(freshViewportBuffer(), root, "fullscreen")
    expect(
      managed.compositorCaret,
      "a non-focused declarative fallback must NOT composite a caret",
    ).toBeNull()
    expect(
      bufferInverseCells(managed.presentationBuffer),
      "no inverse cell may be painted",
    ).toEqual([])
  })

  test("island wins even when an unfocused declarative fallback also exists (hardware caret, no residue)", () => {
    const islandRect: Rect = { x: 4, y: 3, width: 20, height: 5 }
    const root = rootWith([
      unfocusedEditableNode(2, 9), // a passive declarative fallback below
      cursorActiveIslandNode(islandRect, { col: 2, row: 0 }),
    ])
    const managed = computeManagedFrame(freshViewportBuffer(), root, "fullscreen")
    const expectedX = islandRect.x + 2
    const expectedY = islandRect.y + 0
    // The island is shown as the hardware cursor; the unfocused fallback is
    // suppressed — so NOTHING is composited (no island inverse, no fallback residue).
    expect(
      managed.compositorCaret,
      "island host-caret shows as the hardware cursor, not a composited block",
    ).toBeNull()
    expect(
      bufferInverseCells(managed.presentationBuffer),
      "no composited caret residue (island shown as hardware cursor, fallback suppressed)",
    ).toEqual([])
    // The hardware cursor is shown on the island's guest cell.
    expect(managed.cursorSuffix, "hardware cursor shown on the island guest cell").toContain(
      `\x1b[${expectedY + 1};${expectedX + 1}H\x1b[?25h`,
    )
    expect(managed.expectedTerminal).toMatchObject({ x: expectedX, y: expectedY, visible: true })
  })
})

/** Inverse-attribute cells read directly off a TerminalBuffer. */
function bufferInverseCells(buffer: TerminalBuffer): Array<{ row: number; col: number }> {
  const out: Array<{ row: number; col: number }> = []
  for (let row = 0; row < buffer.height; row++) {
    for (let col = 0; col < buffer.width; col++) {
      if (buffer.getCell(col, row).attrs.inverse) out.push({ row, col })
    }
  }
  return out
}
