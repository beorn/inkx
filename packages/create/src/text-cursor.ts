/**
 * Text Cursor Utilities
 *
 * Pure functions for mapping between flat character offsets and visual
 * (row, col) positions in word-wrapped text. Uses the same wrapText()
 * function as the rendering pipeline, guaranteeing cursor positions
 * match what's displayed on screen.
 *
 * Architecture layer 0 — no state, no hooks, no components.
 * Used by: TextArea (layer 3), useTextEdit (layer 1), and apps
 * that need cursor math without the full component stack.
 *
 * @example
 * ```ts
 * import { cursorToRowCol, cursorMoveDown } from '@silvery/ag-react'
 *
 * const { row, col } = cursorToRowCol("hello world", 5, 8)
 * // row=0, col=5 (fits in 8-wide line)
 *
 * const next = cursorMoveDown("hello world\nfoo", 3, 8)
 * // next = 12 (moved to row 1, col 3 → "foo"[3] = end)
 * ```
 */
import { type Measurer, displayWidth as measureWidth, wrapText } from "@silvery/ag-term/unicode"
import { ANSI_REGEX, stripAnsi } from "@silvery/ansi"

// =============================================================================
// Types
// =============================================================================

export interface WrappedLine {
  /** The text content of this visual line */
  line: string
  /** Character offset in the original text where this line starts */
  startOffset: number
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Convert a flat cursor offset to visual (row, col) in word-wrapped text.
 *
 * Uses wrapText() from unicode.ts — the same function the render pipeline
 * uses — so cursor positions always match what's displayed on screen.
 */
export function cursorToRowCol(
  text: string,
  cursor: number,
  wrapWidth: number,
  measurer?: Measurer,
): { row: number; col: number } {
  if (wrapWidth <= 0) return { row: 0, col: 0 }
  return cursorToRowColFromLines(
    getWrappedLines(text, wrapWidth, measurer),
    cursor,
    wrapWidth,
    measurer,
  )
}

/** Internal: compute row/col from pre-computed wrapped lines. */
function cursorToRowColFromLines(
  lines: WrappedLine[],
  cursor: number,
  wrapWidth: number,
  measurer?: Measurer,
): { row: number; col: number } {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const lineEnd = line.startOffset + line.line.length
    const isLast = i === lines.length - 1

    if (cursor < lineEnd || isLast) {
      if (
        cursor === lineEnd &&
        isLast &&
        line.line.length > 0 &&
        displayWidth(line.line, measurer) >= wrapWidth
      ) {
        return { row: i + 1, col: 0 }
      }
      const col = Math.max(0, Math.min(cursor - line.startOffset, line.line.length))
      return { row: i, col }
    }

    const nextLine = lines[i + 1]
    if (cursor === lineEnd && nextLine) {
      // Wrap boundary: next visual line starts at the same offset (no
      // separator char in the buffer) → cursor jumps to start of next.
      // \n boundary: next visual line starts AFTER cursor (the \n char
      // occupies the offset between them) → cursor sits at end of THIS
      // line, just before the \n. Without this branch, position == \n-offset
      // got pushed into the next line at col 0, breaking Up/Down arithmetic
      // for buffers like "line1\nline2" where every Up-from-row-1 landed
      // back on row 1. See @km/silvery/14763-textarea-onedge-fires.
      if (nextLine.startOffset === cursor) {
        return { row: i + 1, col: 0 }
      }
      return { row: i, col: line.line.length }
    }
  }

  return { row: Math.max(0, lines.length - 1), col: 0 }
}

/**
 * Width as the RENDERER measures it — the one home, not a local re-derivation.
 *
 * This used to sum `graphemeWidth` over every grapheme without stripping ANSI,
 * so a styled line's SGR bytes counted as visible cells. `wrapText` (which this
 * module already uses for the wrapping itself) treats ANSI as zero-width, so
 * the two disagreed by exactly the escape bytes and a visibly short line could
 * read as full. Cursor math and rendering must measure identically or the caret
 * sits on a row the renderer never draws.
 */
function displayWidth(text: string, measurer?: Measurer): number {
  return measurer ? measurer.displayWidth(text) : measureWidth(text)
}

/** ANSI escapes occupy source offsets but contribute no visible characters. */
const ANSI_AT = new RegExp(ANSI_REGEX.source, "y")

/** First visible (non-ANSI) character of a wrapped fragment, or "" if it has none. */
function firstVisibleChar(fragment: string): string {
  return stripAnsi(fragment).slice(0, 1)
}

/**
 * Advance past exactly the SOURCE characters that produced `fragment`'s visible
 * text, never past `limit` (the logical line's end).
 *
 * The subtle part, and the reason this cannot just be `offset += fragment.length`:
 * **a wrapped fragment is not a substring of the source.** `wrapText` runs
 * `fixSgrAcrossWrappedLines` whenever a styled logical line splits into more
 * than one fragment, re-opening the active colour/attr at the start of each
 * continuation and closing it at the end, so every fragment stands alone when
 * painted (@km/code/v0.2/19690-status-tuple-wrap-color). Those injected bytes
 * exist only in the output. Counting them as source characters walks the offset
 * past the end of the buffer.
 *
 * That injection is also the whole shape of the old drift: the fix runs only
 * under `lines.length > 1 && text.includes("\x1b[")`, so at a width where every
 * logical line still fits on one row nothing is injected and the offsets were
 * always exact — which is why the defect vanished at wide terminals and grew as
 * the wrap width shrank and more styled lines split.
 *
 * So: match the fragment's VISIBLE characters against the source, stepping over
 * source ANSI (which does occupy offsets) and ignoring injected ANSI (which
 * never matches because it is not there). Stop on divergence rather than
 * guessing — the caller's snap to the logical line end keeps a stop bounded.
 */
function consumeSource(text: string, from: number, fragment: string, limit: number): number {
  const visible = stripAnsi(fragment)
  let i = from
  let v = 0
  while (v < visible.length && i < limit) {
    ANSI_AT.lastIndex = i
    const m = ANSI_AT.exec(text)
    if (m !== null && m[0].length > 0) {
      i += m[0].length
      continue
    }
    if (text[i] !== visible[v]) break
    i++
    v++
  }
  // Claim any source ANSI sitting immediately after the matched text (a closing
  // reset at the fragment's tail belongs to this fragment, not the next one).
  while (i < limit) {
    ANSI_AT.lastIndex = i
    const m = ANSI_AT.exec(text)
    if (m === null || m[0].length === 0) break
    i += m[0].length
  }
  return i
}

/**
 * Get all wrapped display lines with their starting character offsets.
 *
 * Each entry represents one visual line on screen. The startOffset can be
 * used to convert a (row, col) back to a flat cursor position:
 * `flatOffset = lines[row].startOffset + col`
 */
export function getWrappedLines(
  text: string,
  wrapWidth: number,
  measurer?: Measurer,
): WrappedLine[] {
  if (wrapWidth <= 0) return [{ line: "", startOffset: 0 }]

  const logicalLines = text.split("\n")
  const result: WrappedLine[] = []
  let offset = 0
  // Use explicit measurer when available, fall back to module-level convenience function
  const wt = measurer ? measurer.wrapText.bind(measurer) : wrapText

  for (let li = 0; li < logicalLines.length; li++) {
    const line = logicalLines[li]!
    const logicalLineEnd = offset + line.length
    // Use trim=true to match the renderer's wrapping behavior.
    // The renderer uses wrapText(text, width, true, true), so cursor math
    // must produce the same visual lines to keep positions synchronized.
    const wrapped = wt(line, wrapWidth, false, true)
    const lines = wrapped.length === 0 ? [""] : wrapped

    for (const wLine of lines) {
      // Skip whitespace in the original text that was trimmed:
      // - Leading spaces on continuation lines (trimmed by renderer)
      // - Trailing space at break point (consumed as separator by renderer)
      while (
        offset < text.length &&
        text[offset] === " " &&
        wLine.length > 0 &&
        firstVisibleChar(wLine) !== " "
      ) {
        offset++
      }
      result.push({ line: wLine, startOffset: offset })
      offset = consumeSource(text, offset, wLine, logicalLineEnd)
    }
    // Text editing cannot drop trailing spaces the way prose rendering can:
    // the caret must advance through spaces typed at a soft-wrap boundary.
    // Materialize any spaces that wrapText consumed as editable cells.
    while (offset < logicalLineEnd && text[offset] === " ") {
      const last = result[result.length - 1]
      if (!last || displayWidth(last.line, measurer) >= wrapWidth) {
        result.push({ line: text[offset]!, startOffset: offset })
      } else {
        last.line += text[offset]!
      }
      offset++
    }
    const last = result[result.length - 1]
    if (li === logicalLines.length - 1 && last && displayWidth(last.line, measurer) >= wrapWidth) {
      result.push({ line: "", startOffset: offset })
    }
    // Snap to the logical line's known end before crossing the newline. Each
    // logical line's offsets are bounded by [lineStart, lineStart + line.length]
    // BY CONSTRUCTION, so a residue inside one line (trailing source ANSI the
    // last fragment did not claim, say) can never accumulate into the next.
    offset = logicalLineEnd
    offset++ // for \n
  }

  return result
}

/**
 * Convert visual (row, col) to a flat cursor offset.
 *
 * Clamps col to the line length if the target column exceeds it
 * (important for stickyX behavior on short lines).
 */
export function rowColToCursor(
  text: string,
  row: number,
  col: number,
  wrapWidth: number,
  measurer?: Measurer,
): number {
  const lines = getWrappedLines(text, wrapWidth, measurer)
  if (row < 0) return 0
  if (row >= lines.length) return text.length
  const line = lines[row]!
  return line.startOffset + Math.min(col, line.line.length)
}

/**
 * Move cursor up one visual line.
 *
 * Returns the new cursor offset, or null if already on the first visual line
 * (indicating a boundary — the caller should handle cross-block navigation).
 *
 * @param stickyX - Preferred column position for vertical movement.
 *   When moving through lines of different lengths, the cursor tries to
 *   stay at this column. Pass the col from the original position before
 *   the first vertical move in a sequence.
 */
export function cursorMoveUp(
  text: string,
  cursor: number,
  wrapWidth: number,
  stickyX?: number,
  measurer?: Measurer,
): number | null {
  if (wrapWidth <= 0) return cursor > 0 ? 0 : null

  const lines = getWrappedLines(text, wrapWidth, measurer)
  const { row, col } = cursorToRowColFromLines(lines, cursor, wrapWidth, measurer)

  if (row === 0) return null // at first visual line — boundary

  const targetX = stickyX ?? col
  // Try successive lines upward: if the target position equals the current cursor
  // (happens at wrap boundaries), keep going up to make real progress.
  for (let prevRow = row - 1; prevRow >= 0; prevRow--) {
    const targetLine = lines[prevRow]!
    const next = targetLine.startOffset + Math.min(targetX, targetLine.line.length)
    if (next !== cursor) return next
  }
  return null // all preceding lines map to same position — boundary
}

/**
 * Move cursor down one visual line.
 *
 * Returns the new cursor offset, or null if already on the last visual line
 * (indicating a boundary — the caller should handle cross-block navigation).
 *
 * @param stickyX - Preferred column position for vertical movement.
 */
export function cursorMoveDown(
  text: string,
  cursor: number,
  wrapWidth: number,
  stickyX?: number,
  measurer?: Measurer,
): number | null {
  if (wrapWidth <= 0) return cursor < text.length ? text.length : null

  const lines = getWrappedLines(text, wrapWidth, measurer)
  const { row, col } = cursorToRowColFromLines(lines, cursor, wrapWidth, measurer)

  if (row >= lines.length - 1) return null // at last visual line — boundary

  const targetX = stickyX ?? col
  // Try successive lines: if the target position equals the current cursor
  // (happens at wrap boundaries where end-of-line-N == start-of-line-N+1),
  // advance to the next line to make real progress.
  for (let nextRow = row + 1; nextRow < lines.length; nextRow++) {
    const targetLine = lines[nextRow]!
    const next = targetLine.startOffset + Math.min(targetX, targetLine.line.length)
    if (next !== cursor) return next
  }
  return null // all remaining lines map to same position — boundary
}

/**
 * Count total visual lines after word wrapping.
 */
export function countVisualLines(text: string, wrapWidth: number, measurer?: Measurer): number {
  return getWrappedLines(text, wrapWidth, measurer).length
}
