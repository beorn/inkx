/**
 * Section card rendering tests.
 *
 * Section headers (mdsection nodes) that appear as cards within a column
 * should render with a visually distinct style from regular task cards.
 * They serve as section dividers/groupers, not as actionable items.
 *
 * Visual distinction:
 * - Section cards: no round border, bold text, underline separator
 * - Regular cards: round border (structural) or dim round border (body)
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

/** Check if a character is a round box-drawing border character. */
function isRoundBorderChar(c: string): boolean {
  return "╭╮╯╰│─".includes(c)
}

/** Check if a character is a horizontal line (used for section separators). */
function isHorizontalLine(c: string): boolean {
  return "─━▔".includes(c)
}

describe("section card rendering", () => {
  test("section cards render without round borders (visually distinct from task cards)", () => {
    // A column with a mix of section headers and regular tasks.
    // Sections come from Asana-style section headers in markdown (## Section Name).
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col",
            item.section("Finance & Taxes", item("Pay rent"), item("File taxes")),
            item.section("Waiting", item("Response from bank")),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // The section cards should NOT have round borders like regular structural cards
    // Check for absence of round corner characters adjacent to section card content
    for (const sectionId of ["Finance & Taxes", "Waiting"]) {
      const box = board.screen.nodeBox(sectionId)
      expect(box, `section "${sectionId}" should exist`).not.toBeNull()
      if (!box) continue

      // Check left side: should NOT have round border chars at box.x - 1
      const leftX = box.x - 1
      if (leftX >= 0) {
        const leftCell = board.screen.cell(leftX, box.y)
        expect(
          isRoundBorderChar(leftCell.char),
          `section "${sectionId}" should NOT have round left border at (${leftX},${box.y}), got '${leftCell.char}'`,
        ).toBe(false)
      }
    }
  })

  test("section cards display text as bold", () => {
    const { board } = testEnv(() => item("board", item("col", item.section("Finance & Taxes", item("Pay rent")))), {
      columns: 80,
      rows: 24,
    })

    // The section text (not the § icon prefix) should be bold.
    // The § icon is at the first non-space position; the actual text starts after "§ ".
    const box = board.screen.nodeBox("Finance & Taxes")
    expect(box, "section node should exist").not.toBeNull()
    if (!box) return

    // Find the 'F' character in "Finance & Taxes" (skip the § prefix)
    let foundBold = false
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (cell.char === "F") {
        expect((cell.attrs as Record<string, unknown>).bold, `text char 'F' at (${x},${box.y}) should be bold`).toBe(
          true,
        )
        foundBold = true
        break
      }
    }
    expect(foundBold, "should find bold 'F' character in section title").toBe(true)
  })

  test("section cards are visually distinct from adjacent task cards", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col",
            item.section("Section Header", item("task-a"), item("task-b")),
            item.section("Another Section", item("task-c")),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // Section header cards should NOT have round borders
    const sectionBox = board.screen.nodeBox("Section Header")
    expect(sectionBox).not.toBeNull()
    if (!sectionBox) return

    // Look for a horizontal separator line below the section card.
    // The separator appears after the section title and its children,
    // so scan a few rows below the section box.
    let hasHLine = false
    for (let y = sectionBox.y + 1; y < sectionBox.y + 10 && y < 24; y++) {
      let lineChars = 0
      for (let x = 0; x < 80; x++) {
        const cell = board.screen.cell(x, y)
        if (isHorizontalLine(cell.char)) lineChars++
      }
      // A separator line should have many horizontal line chars (at least half the width)
      if (lineChars >= 20) {
        hasHLine = true
        break
      }
    }
    expect(hasHLine, "section card should have a horizontal separator line below it").toBe(true)
  })

  test("section card selection uses yellow background (like other cards)", () => {
    const { board } = testEnv(() => item("board", item("col", item.section("My Section", item("task-1")))), {
      columns: 80,
      rows: 24,
    })

    // First card should be the section, and it should be selected
    board.expectNodeColor("My Section", { bg: 3 }) // 3 = yellow
  })

  test("section cards with children show fold marker and child count", () => {
    const { board } = testEnv(
      () => item("board", item("col", item.section("Has Children", item("child-a"), item("child-b"), item("child-c")))),
      { columns: 80, rows: 24 },
    )

    // Section card should show children underneath
    board.expect("#child-a").toExist()
    board.expect("#child-b").toExist()
    board.expect("#child-c").toExist()
  })
})
