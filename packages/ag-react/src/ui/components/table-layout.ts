/**
 * Markdown table grid geometry — column sizing and cell padding in TERMINAL
 * COLUMNS, not JS string length.
 *
 * @si/app/22734 — emoji (and CJK / wide graphemes) are two columns; using
 * `.length` / `padEnd` under-pads by one column per wide grapheme so the row
 * border is off-by-one. Always measure and pad through `displayWidth` /
 * `padText` / `wrapText` from `@silvery/ag-term/unicode`.
 */
import { displayWidth, padText, truncateText, wrapText } from "@silvery/ag-term/unicode"

export type TableAlignment = "left" | "right" | "center" | null

export const TABLE_CELL_PADDING_X = 1

/** Max display-column width of header and body cells for each column. */
export function tableNaturalWidths(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): number[] {
  return headers.map((header, col) => {
    const maxRow = rows.reduce((w, row) => Math.max(w, displayWidth(row[col] ?? "")), 0)
    return Math.max(displayWidth(header), maxRow)
  })
}

export function tableFrameWidth(widths: readonly number[], separatorWidth: number): number {
  const paddedCells = widths.reduce((sum, width) => sum + width + TABLE_CELL_PADDING_X * 2, 0)
  return paddedCells + separatorWidth * Math.max(0, widths.length - 1) + 2
}

/**
 * Shrink column widths until the framed table fits `targetWidth`. Returns null
 * when even the minimum widths cannot fit.
 */
export function shrinkTableWidths(
  widths: readonly number[],
  targetWidth: number,
  separatorWidth: number,
): number[] | null {
  if (widths.length === 0) return []
  const separatorTotal = separatorWidth * Math.max(0, widths.length - 1)
  const paddingTotal = widths.length * TABLE_CELL_PADDING_X * 2
  const availableCells = targetWidth - separatorTotal - paddingTotal - 2
  const minimums = widths.map((width) => Math.min(width, 8))
  const minimumTotal = minimums.reduce((sum, width) => sum + width, 0)
  if (availableCells < minimumTotal) return null

  const out = [...widths]
  let total = out.reduce((sum, width) => sum + width, 0)
  let overflow = total - availableCells
  while (overflow > 0) {
    const candidates = out
      .map((width, index) => ({ width, index, reducible: width - (minimums[index] ?? 0) }))
      .filter((candidate) => candidate.reducible > 0)
      .sort((a, b) => b.width - a.width)
    const candidate = candidates[0]
    if (!candidate) return null
    out[candidate.index] = (out[candidate.index] ?? 0) - 1
    overflow -= 1
    total -= 1
  }
  return out
}

/** Wrap cell text to `width` terminal columns (wide graphemes count as 2). */
export function wrapCell(text: string, width: number): string[] {
  if (width <= 0) return [""]
  // Do not pass truncateAtomicOverflow — that replaces a fitting wide emoji
  // with "…" when a multi-emoji cell wraps (wrapText treats the second wide
  // grapheme as atomic overflow on the same line). padCellLine clips any
  // residual oversize grapheme when the cell is narrower than the emoji.
  const lines = wrapText(text, width, true, false, false)
  return lines.length > 0 ? lines : [""]
}

/**
 * Clip and pad one cell line to exactly `width` terminal columns.
 * Uses padText so emoji/CJK pad correctly; never String.padEnd/padStart.
 */
export function padCellLine(text: string, width: number, align: TableAlignment | undefined): string {
  if (width <= 0) return ""
  const clipped = displayWidth(text) > width ? truncateText(text, width, "") : text
  const alignment = align === "right" ? "right" : align === "center" ? "center" : "left"
  return padText(clipped, width, alignment)
}
