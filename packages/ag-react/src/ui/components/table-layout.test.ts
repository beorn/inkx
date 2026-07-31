/**
 * @failure Table columns sized with String.length mis-pad emoji / CJK so a
 * row with an emoji cell is off-by-one in painted width.
 * @level l1
 * @consumer @si/app/22734-maddoc-emoji-table-width
 */
import { describe, expect, test } from "vitest"
import { displayWidth } from "@silvery/ag-term/unicode"
import {
  padCellLine,
  tableFrameWidth,
  tableNaturalWidths,
  wrapCell,
} from "./table-layout.ts"

describe("table-layout — terminal columns, not code units", () => {
  test("emoji cell is measured as two columns, not string length 2 / grapheme 1", () => {
    // 🚀 is one grapheme, typically two UTF-16 units, two terminal columns.
    const emoji = "🚀"
    expect(emoji.length).toBeGreaterThanOrEqual(1)
    expect(displayWidth(emoji)).toBe(2)

    const widths = tableNaturalWidths(["Name", "Icon"], [["rocket", emoji]])
    // Column width is max(header, cells) measured in display columns.
    expect(widths[0]).toBe(Math.max(displayWidth("Name"), displayWidth("rocket")))
    expect(widths[1]).toBe(Math.max(displayWidth("Icon"), displayWidth(emoji)))
    // Emoji column must be ≥ 2 (header "Icon" is 4; emoji alone is 2).
    expect(widths[1]).toBeGreaterThanOrEqual(2)
    // Regression: sizing is NOT grapheme count (1) for a wide emoji.
    expect(displayWidth(emoji)).toBe(2)
  })

  test("padCellLine pads by display columns so emoji + spaces fill the cell", () => {
    const cell = padCellLine("🚀", 4, "left")
    expect(displayWidth(cell)).toBe(4)
    // Two pad spaces after a 2-col emoji → total 4 columns.
    expect(cell).toBe("🚀  ")
  })

  test("CJK and combining-accent cells size and pad to display width", () => {
    const cjk = "中文"
    const accent = "e\u0301" // e + combining acute
    expect(displayWidth(cjk)).toBe(4)
    expect(displayWidth(accent)).toBe(1)

    const widths = tableNaturalWidths(["A", "B"], [[cjk, accent]])
    expect(widths[0]).toBe(4)
    expect(widths[1]).toBe(1)

    expect(displayWidth(padCellLine(cjk, 6, "left"))).toBe(6)
    expect(displayWidth(padCellLine(accent, 3, "right"))).toBe(3)
  })

  test("ZWJ-sequence emoji (family) is wide and does not underflow padding", () => {
    // Family: man + ZWJ + woman + ZWJ + girl (common multi-codepoint emoji)
    const family = "👨‍👩‍👧"
    const w = displayWidth(family)
    expect(w).toBeGreaterThanOrEqual(2)
    const padded = padCellLine(family, w + 2, "left")
    expect(displayWidth(padded)).toBe(w + 2)
  })

  test("wrapCell wraps on display columns, not code-unit length", () => {
    // Two emoji = 4 columns; width 2 → two lines of one emoji each.
    const lines = wrapCell("🚀🚀", 2)
    expect(lines.every((line) => displayWidth(line) <= 2)).toBe(true)
    expect(lines.join("")).toContain("🚀")
  })

  test("frame width accounts for display-column cell widths", () => {
    // One column of width 2 (emoji) + pad 1*2 + borders 2 = 6
    expect(tableFrameWidth([2], 1)).toBe(2 + 2 + 2)
  })
})
