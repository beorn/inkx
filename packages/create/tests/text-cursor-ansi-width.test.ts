/**
 * Cursor math must measure width the way the renderer does
 * (@si/apportion-consolidation, item 2 — the width-measurement consolidation).
 *
 * `getWrappedLines` documents its own contract at the wrap call: "the renderer
 * uses wrapText(text, width, true, true), so cursor math must produce the same
 * visual lines to keep positions synchronized." The wrapping itself honors that
 * — it calls the same `wrapText`. The width comparisons that decide whether a
 * line is FULL did not: they went through a package-private `displayWidth` that
 * summed `graphemeWidth` over every grapheme without stripping ANSI, so a
 * styled line's SGR bytes counted as visible cells.
 *
 * `wrapText` treats ANSI as zero-width. Measured: the renderer wraps
 * "\x1b[31mred\x1b[0m and more text here" exactly like "red and more text here",
 * while the private width function called the same string 7 cells wider. A
 * final line only 9 cells wide therefore read as "full", and cursor math
 * appended a visual row the renderer never draws.
 *
 * The invariant these tests pin: **styling must not move the caret.** Two
 * buffers that differ only by SGR codes must produce the same visual row
 * geometry, because they render identically.
 */

import { describe, expect, test } from "vitest"
import { getWrappedLines, cursorToRowCol } from "../src/text-cursor"
import { displayWidth } from "@silvery/ag-term/unicode"

/** Strip SGR so a styled buffer can be compared against its visible twin. */
const SGR = /\x1b\[[0-9;]*m/g
const plainOf = (styled: string): string => styled.replace(SGR, "")

/**
 * A realistic syntax-highlighted buffer: 24 logical lines of styled source,
 * the shape a TextArea actually holds. Several lines carry multiple SGR runs,
 * and their visible widths sit well under the wrap widths swept below — so any
 * row-count difference is the SGR bytes being counted as cells, nothing else.
 */
const STYLED_DOC = [
  "\x1b[1m\x1b[34mexport\x1b[0m function \x1b[33mapportion\x1b[0m(tracks, width) {",
  "  \x1b[90m// bands are total width, chrome included\x1b[0m",
  "  \x1b[1m\x1b[34mconst\x1b[0m lo = \x1b[33msum\x1b[0m(tracks.map((c) => c.min))",
  "  \x1b[1m\x1b[34mconst\x1b[0m hi = \x1b[33msum\x1b[0m(tracks.map((c) => c.max))",
  "  \x1b[1m\x1b[34mif\x1b[0m (width < lo) \x1b[1m\x1b[34mreturn\x1b[0m mins",
  "  \x1b[90m// short styled tail\x1b[0m",
  "  \x1b[31mthrow\x1b[0m err",
]
  .flatMap((line) => [line, `  \x1b[32m"${line.length}"\x1b[0m,`, "", `  plain ${line.length}`])
  .slice(0, 24)
  .join("\n")

const PLAIN_DOC = plainOf(STYLED_DOC)

/** Widths that bracket the styled lines' visible widths and their inflated ones. */
const WIDTHS = [14, 16, 18, 20, 24, 30, 40, 60]

describe("text-cursor width measurement", () => {
  test("SGR codes do not change the number of visual rows", () => {
    const mismatches: string[] = []
    for (const width of WIDTHS) {
      const styledRows = getWrappedLines(STYLED_DOC, width).length
      const plainRows = getWrappedLines(PLAIN_DOC, width).length
      if (styledRows !== plainRows) {
        mismatches.push(
          `width ${width}: styled produced ${styledRows} visual rows, its visible twin ${plainRows}`,
        )
      }
    }
    expect(mismatches, `\n${mismatches.join("\n")}`).toEqual([])
  })

  test("SGR codes do not change the visible content of each visual row", () => {
    const mismatches: string[] = []
    for (const width of WIDTHS) {
      const styled = getWrappedLines(STYLED_DOC, width).map((l) => plainOf(l.line))
      const plain = getWrappedLines(PLAIN_DOC, width).map((l) => l.line)
      for (let i = 0; i < Math.max(styled.length, plain.length); i++) {
        if (styled[i] !== plain[i]) {
          mismatches.push(
            `width ${width}, row ${i}: styled renders ${JSON.stringify(styled[i])}, ` +
              `visible twin ${JSON.stringify(plain[i])}`,
          )
          break
        }
      }
    }
    expect(mismatches, `\n${mismatches.join("\n")}`).toEqual([])
  })

  /**
   * Was skipped while the cause was open; fixed and un-skipped.
   *
   * `getWrappedLines` mapped each visual row back to a character offset with
   * `offset += wLine.length`, which assumes a wrapped fragment is a substring
   * of the source. It is not. When a STYLED logical line splits, `wrapText`
   * runs `fixSgrAcrossWrappedLines` — re-opening the active colour/attr at each
   * continuation and closing it at the fragment's end so every line stands
   * alone when painted (@km/code/v0.2/19690-status-tuple-wrap-color). Those
   * bytes exist only in the output, and counting them as source characters
   * walked the offset past the end of the buffer: +52 chars at width 14, +41 at
   * 16, +39 at 18 and 20, +12 at 30 and 40, and exactly 0 at 60.
   *
   * The zero at width 60 is the tell, and any correct account has to produce
   * it: the SGR fix is gated on `lines.length > 1 && text.includes("\x1b[")`,
   * so at a width where every logical line still fits on one row, nothing
   * splits, nothing is injected, and the offsets were always exact. Measured
   * injection tracked the drift across the whole curve (48 injected bytes
   * against 52 drift at width 14; 0 against 0 at width 60), the residue being
   * the separate trailing-space bookkeeping.
   *
   * An earlier note in this file claimed wrapText was NOT re-emitting SGR,
   * reasoning that its output is shorter than its input. That was wrong — the
   * measurement had been taken on a line whose styled span did not straddle a
   * break, so nothing was injected and the consumed separator spaces made the
   * total shorter. Both things happen at once: separators are consumed AND
   * codes are injected.
   */
  test("the caret at end-of-buffer lands on the same row with and without styling", () => {
    const mismatches: string[] = []
    for (const width of WIDTHS) {
      const styled = cursorToRowCol(STYLED_DOC, STYLED_DOC.length, width)
      const plain = cursorToRowCol(PLAIN_DOC, PLAIN_DOC.length, width)
      if (styled.row !== plain.row) {
        mismatches.push(
          `width ${width}: caret on row ${styled.row} in the styled buffer, ` +
            `row ${plain.row} in its visible twin`,
        )
      }
    }
    expect(mismatches, `\n${mismatches.join("\n")}`).toEqual([])
  })

  test("every visual row maps to a real span of the source buffer", () => {
    // The offset invariant the caret test above depends on, asserted directly.
    // A wrapped fragment is NOT a substring of the source — `wrapText` re-opens
    // and closes the active SGR on each fragment when a styled line splits, so
    // advancing offsets by fragment length walks past the end of the buffer.
    // The old drift was exactly the injected byte count: +52 at width 14 down
    // to 0 at width 60, where nothing splits and nothing is injected.
    const violations: string[] = []
    for (const width of WIDTHS) {
      const rows = getWrappedLines(STYLED_DOC, width)
      for (const row of rows) {
        if (row.startOffset < 0 || row.startOffset > STYLED_DOC.length) {
          violations.push(
            `width ${width}: startOffset ${row.startOffset} outside [0, ${STYLED_DOC.length}]`,
          )
          break
        }
      }
      const last = rows[rows.length - 1]!
      const end = last.startOffset + last.line.length
      if (end > STYLED_DOC.length) {
        violations.push(
          `width ${width}: last row ends at ${end}, past the ${STYLED_DOC.length}-char buffer ` +
            `(drift +${end - STYLED_DOC.length})`,
        )
      }
    }
    expect(violations, `\n${violations.join("\n")}`).toEqual([])
  })

  test("no phantom trailing row when a styled final line is visibly short", () => {
    // Final line is 9 visible cells; its SGR bytes inflate a raw grapheme sum
    // to ~19, which is what used to read as "full" at these widths.
    const styled = "first line here\n\x1b[1m\x1b[31mshort\x1b[0m end"
    for (const width of [16, 18, 20]) {
      const rows = getWrappedLines(styled, width)
      const last = rows[rows.length - 1]!
      expect(displayWidth(last.line), `width ${width}: last row is visibly short`).toBeLessThan(
        width,
      )
      expect(last.line, `width ${width}: no empty phantom row appended`).not.toBe("")
    }
  })
})
