/**
 * Red-first repro for the Silver Code output-flicker bug (km bead 19633).
 *
 * The native scroll-region optimization (`detectNativeScrollPlan` in
 * output-phase.ts) only recognizes a FULL-TERMINAL-WIDTH uniform vertical
 * scroll — `rowsEqualWithOffset` compares every column x in [0, width).
 *
 * Real apps scroll a SUB-COLUMN: a transcript pane on the left while a fixed
 * side panel (or a second pane) occupies the right columns. When the
 * transcript scrolls one line, the side-panel columns do NOT shift, so no
 * single delta makes all full-width rows match → the optimization bails and
 * the whole transcript height is repainted cell-by-cell. That full repaint is
 * the user-visible flicker.
 *
 * This test scrolls only the left 48 columns (transcript) by one row and
 * leaves the right 32 columns (side panel) byte-identical, then asserts the
 * output is bounded the way a real scroll would be. It is RED on current code
 * (full repaint, no scroll escape) and GREEN once sub-rectangle scroll
 * detection lands. See bead @km/code/v0.2/19633-output-flicker.
 */
import { describe, expect, test } from "vitest"
import { TerminalBuffer } from "../packages/ag-term/src/buffer.ts"
import { outputPhase } from "../packages/ag-term/src/pipeline/output-phase.ts"
import { replayAnsiWithStyles } from "../packages/ag-term/src/pipeline/output-verify.ts"

const WIDTH = 80
const HEIGHT = 30
const TRANSCRIPT_COLS = 48 // left pane
// columns 48..79 are a fixed side panel that must NOT shift when the
// transcript scrolls.

function writeRegionRow(buffer: TerminalBuffer, y: number, x0: number, text: string): void {
  for (let i = 0; i < text.length && x0 + i < buffer.width; i++) {
    buffer.setCell(x0 + i, y, { char: text[i] ?? " " })
  }
}

function seedTranscriptAndPanel(buffer: TerminalBuffer): void {
  for (let y = 0; y < buffer.height; y++) {
    // Left transcript content — diverse per row/col (like real chat/code), so a
    // one-row vertical shift makes nearly every cell in the region differ. This
    // is what makes the un-optimized full repaint expensive (the flicker).
    for (let x = 0; x < TRANSCRIPT_COLS; x++) {
      buffer.setCell(x, y, { char: String.fromCharCode(65 + ((y * 7 + x * 3 + 5) % 26)) })
    }
    // Right side panel content — FIXED across frames.
    writeRegionRow(buffer, y, TRANSCRIPT_COLS, `| panel row ${y % 7}`)
  }
}

function expectReplayMatches(buffer: TerminalBuffer, ansi: string): void {
  const replay = replayAnsiWithStyles(buffer.width, buffer.height, ansi)
  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      if (buffer.isCellContinuation(x, y)) continue
      expect(replay[y]?.[x]?.char ?? " ", `cell ${x},${y}`).toBe(buffer.getCellChar(x, y))
    }
  }
}

// SKIPPED pending the fix lever (km bead 19633): sub-rectangle scroll detection
// in output-phase.ts (DECSLRM left/right margins) is a pipeline change that
// routes through the silvery agent. Confirmed RED on 2026-06-02: a one-row
// sub-column transcript scroll beside a fixed side panel emits NO scroll op and
// repaints 2468 bytes (full per-cell repaint of the shifted region) instead of
// a ~12-byte scroll escape. Un-skip when implementing the sub-column scroll fix.
describe.skip("output native scroll optimization — sub-column", () => {
  test("a transcript-pane scroll beside a fixed side panel uses a scroll op, not a full repaint", () => {
    const prev = new TerminalBuffer(WIDTH, HEIGHT)
    seedTranscriptAndPanel(prev)

    // Stream one new transcript line: the left 48 columns scroll up by 1,
    // the right side panel stays byte-identical.
    const next = prev.clone()
    next.scrollRegion(0, 0, TRANSCRIPT_COLS, HEIGHT, 1)
    writeRegionRow(next, HEIGHT - 1, 0, "transcript line NEW ")

    const fullPrev = outputPhase(null, prev, "fullscreen")
    const patch = outputPhase(prev, next, "fullscreen")

    // Correctness must always hold regardless of strategy.
    expectReplayMatches(next, fullPrev + patch)

    // The side panel did not change — only one transcript line entered the
    // bottom of the left pane. A scroll-aware output phase emits a scroll op
    // (S/T) for the transcript region instead of repainting ~30 rows. Today
    // the full-width-only detector bails and repaints the whole transcript
    // height — that is the flicker this bead tracks.
    const scrolled = /\x1b\[\d+[ST]/.test(patch)
    expect(
      scrolled,
      `expected a terminal scroll op for the sub-column transcript scroll; patch was ${Buffer.byteLength(patch)} bytes (full repaint)`,
    ).toBe(true)
    expect(Buffer.byteLength(patch)).toBeLessThan(2500)
  })
})
