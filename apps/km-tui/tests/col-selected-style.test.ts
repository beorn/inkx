/**
 * Column selected style tests (km-tui.col-selected-style)
 *
 * When cursor is at column level (header), the column should have a visible
 * selected style throughout. The column header already gets yellow bg + black
 * text, and the separator is yellow. But the column body area
 * (cards region) should also have a visible distinction -- a yellow left border
 * or similar treatment consistent with the overall "this column is selected" feel.
 */

import { describe, it, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("km-tui.col-selected-style: column selected style at column level", () => {
  it("column header has yellow bg when cursor is at column level", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
      { columns: 100, rows: 20 },
    )

    // Initially cursor is at card level on first card
    board.expect('[id="task1"][data-cursor]').toExist()

    // Press k to go up from first card to column header
    board.press("k")

    // Now cursor should be at column level
    board.expect('[data-cursor][data-card-index="-1"]').toExist()

    // Find col1's column element to get its bounding box
    const colLoc = board.q('[id="col1"][data-view="column"]')
    expect(colLoc.count()).toBeGreaterThan(0)
    const colBox = colLoc.boundingBox()
    expect(colBox).not.toBeNull()
    if (!colBox) return

    // The first row of the column bounding box is the header.
    // Find the "col1" text within that row.
    const headerY = colBox.y
    const row = board.screen.row(headerY)
    const colTextX = row.indexOf("col1")
    expect(colTextX, "'col1' should be visible in header row").toBeGreaterThan(-1)

    // When cursor is at column level, header text should have
    // yellow bg (3) and black fg (0) -- the "inverse selected" style
    const cell = board.screen.cell(colTextX, headerY)
    expect(cell.bg, "column header bg should be yellow (3) when at column level").toEqual(3)
    expect(cell.fg, "column header fg should be black (0) when at column level").toEqual(0)
  })

  it("separator line is yellow when cursor is at column level", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
      { columns: 100, rows: 20 },
    )

    // Go to column level
    board.press("k")

    // Find col1's column element
    const colLoc = board.q('[id="col1"][data-view="column"]')
    const colBox = colLoc.boundingBox()
    expect(colBox).not.toBeNull()
    if (!colBox) return

    // The separator line is one row below the header (header is at colBox.y)
    const separatorY = colBox.y + 1

    // Find the first line-drawing char in the separator row within the column's x range
    let sepX = -1
    for (let x = colBox.x; x < colBox.x + colBox.width; x++) {
      if (board.screen.cell(x, separatorY).char === "\u2500") {
        sepX = x
        break
      }
    }
    expect(sepX, "separator char should be found").toBeGreaterThanOrEqual(0)

    const sepCell = board.screen.cell(sepX, separatorY)
    expect(sepCell.fg, "separator fg should be yellow (3) when column selected").toEqual(3)
    expect(sepCell.attrs.dim, "separator should NOT be dim when column selected").toBeFalsy()
  })

  it("column card area has visible yellow left border when cursor is at column level", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
      { columns: 100, rows: 20 },
    )

    // Go to column level
    board.press("k")

    // Find col1's column element
    const colLoc = board.q('[id="col1"][data-view="column"]')
    const colBox = colLoc.boundingBox()
    expect(colBox).not.toBeNull()
    if (!colBox) return

    // The card area starts after header + separator (colBox.y + 2).
    // Check multiple rows in the card area for a selected-color left-side indicator.
    // With the fix, there should be a yellow (selected) vertical border/bar running
    // down the left edge of the column body when isColumnSelected.
    const cardAreaStartY = colBox.y + 2

    // Check several rows in the card area
    for (let dy = 0; dy < 3; dy++) {
      const y = cardAreaStartY + dy
      if (y >= colBox.y + colBox.height) break

      // The leftmost cell of the column should be yellow (border or indicator)
      const leftCell = board.screen.cell(colBox.x, y)
      // Accept either a border character with yellow color, or a space with yellow bg
      const isYellowBorder = leftCell.fg === 3 // yellow foreground for border chars
      const isYellowBg = leftCell.bg === 3 // yellow background

      expect(
        isYellowBorder || isYellowBg,
        `column left edge at (${colBox.x}, ${y}) should have yellow styling ` +
          `(fg=${leftCell.fg}, bg=${leftCell.bg}, char="${leftCell.char}")`,
      ).toBe(true)
    }
  })

  it("non-selected column does NOT have yellow header styling", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1")), item("col2", item("task3"))), {
      columns: 100,
      rows: 20,
    })

    // Go to column level on col1
    board.press("k")

    // Find col2's column element
    const col2Loc = board.q('[id="col2"][data-view="column"]')
    expect(col2Loc.count()).toBeGreaterThan(0)
    const col2Box = col2Loc.boundingBox()
    expect(col2Box).not.toBeNull()
    if (!col2Box) return

    // col2 header should NOT have yellow bg
    const headerY = col2Box.y
    const row = board.screen.row(headerY)
    const col2Idx = row.indexOf("col2")
    expect(col2Idx).toBeGreaterThan(-1)

    const cell = board.screen.cell(col2Idx, headerY)
    expect(cell.bg, "non-selected column header should NOT have yellow bg").not.toEqual(3)
  })

  it("returning to card level removes column-level yellow border", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
      { columns: 100, rows: 20 },
    )

    // Go to column level
    board.press("k")
    board.expect('[data-cursor][data-card-index="-1"]').toExist()

    // Go back to card level
    board.press("j")
    board.expect('[id="task1"][data-cursor]').toExist()

    // Find col1's column element
    const colLoc = board.q('[id="col1"][data-view="column"]')
    const colBox = colLoc.boundingBox()
    expect(colBox).not.toBeNull()
    if (!colBox) return

    // The separator should now be dim (not bright yellow)
    const separatorY = colBox.y + 1
    let sepX = -1
    for (let x = colBox.x; x < colBox.x + colBox.width; x++) {
      if (board.screen.cell(x, separatorY).char === "\u2500") {
        sepX = x
        break
      }
    }
    expect(sepX).toBeGreaterThanOrEqual(0)

    const sepCell = board.screen.cell(sepX, separatorY)
    // When back at card level, separator should use muted color ($text3 = gray = 8), not selection color
    expect(sepCell.fg, "separator should use muted color when back at card level").toBe(8)
  })
})
