/**
 * Regression tests for P2 layout/rendering bugs:
 * 1. km-tui.uncollapse-header — After uncollapsing, column header doesn't show
 * 2. km-tui.collapsed-shift — Collapsed columns shifted right, broken right border
 * 3. km-tui.card-border-missing — Left/right card borders sometimes missing
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

// =============================================================================
// Bug 1: km-tui.uncollapse-header
// =============================================================================

describe("km-tui.uncollapse-header", () => {
  test("header row has column name text (not card content) after uncollapse", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Alpha", item("a1"), item("a2")),
          item("Beta", item("b1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse
    board.press("c")

    // Uncollapse
    board.press("c")

    // Get the Alpha column box
    const colBox = board.screen.nodeBox("Alpha")
    expect(colBox, "Alpha column should be rendered").not.toBeNull()
    if (!colBox) return

    // The first row of the column should contain the header name, not a card
    const headerRow = board.screen.row(colBox.y)
    expect(headerRow, "Header row should contain 'Alpha'").toContain("Alpha")

    // Second row should be separator (dashes)
    const separatorRow = board.screen.row(colBox.y + 1)
    expect(separatorRow, "Row below header should be separator").toContain("─")
  })

  test("header is not rendered as card (no card border chars) after uncollapse", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("MyCol", item("task1"), item("task2")),
          item("Other", item("task3")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse and uncollapse
    board.press("c")
    board.press("c")

    // Get column position
    const colBox = board.screen.nodeBox("MyCol")
    expect(colBox).not.toBeNull()
    if (!colBox) return

    // Header row should NOT start with card border (╭)
    const headerRow = board.screen.row(colBox.y)
    const firstNonSpace = headerRow.trimStart()[0]
    expect(firstNonSpace, "Header should not start with card border char").not.toBe("╭")

    // Should contain the column name
    expect(headerRow).toContain("MyCol")
  })

  test("cards are rendered below separator after uncollapse", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Col1", item("task-x"), item("task-y")),
          item("Col2", item("task-z")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse and uncollapse
    board.press("c")
    board.press("c")

    // Card content should be visible
    board.expectScreen("task-x")
    board.expectScreen("task-y")

    // Find the separator and card rows
    const colBox = board.screen.nodeBox("Col1")
    expect(colBox).not.toBeNull()
    if (!colBox) return

    // First card should be below the header + separator (at least y+2)
    const taskBox = board.screen.nodeBox("task-x")
    expect(taskBox, "task-x should be rendered").not.toBeNull()
    if (!taskBox) return
    expect(taskBox.y).toBeGreaterThanOrEqual(colBox.y + 2)
  })

  test("uncollapse works after navigating to another column and back", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Left", item("l1"), item("l2")),
          item("Right", item("r1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse Left
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(1)

    // Navigate to Right column
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("r1")

    // Navigate back to collapsed Left
    board.press("h")

    // Uncollapse
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(0)

    // Header should be visible
    board.expectScreen("Left")

    // Navigate down to first card
    board.press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("l1")
  })
})

// =============================================================================
// Bug 2: km-tui.collapsed-shift
// =============================================================================

describe("km-tui.collapsed-shift", () => {
  test("collapsed column starts at x=0 (no left margin shift) in 2-column board", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("First", item("f1"), item("f2")),
          item("Second", item("s1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse first column
    board.press("c")

    // The collapsed column should start at x=0
    const collapsedBox = board.q("[data-collapsed]").boundingBox()
    expect(collapsedBox).not.toBeNull()
    expect(collapsedBox!.x, "Collapsed column should start at x=0").toBe(0)
  })

  test("collapsed column width is exactly COLLAPSED_WIDTH=3", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Todo", item("t1")),
          item("Done", item("d1")),
        ),
      { columns: 80, rows: 20 },
    )

    board.press("c")

    const collapsedBox = board.q("[data-collapsed]").boundingBox()
    expect(collapsedBox).not.toBeNull()
    expect(collapsedBox!.width, "Collapsed column width should be 3").toBe(3)
  })

  test("expanded column starts right after collapsed column + separator", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("a1")),
          item("ColB", item("b1")),
        ),
      { columns: 80, rows: 20 },
    )

    board.press("c")

    // ColA collapsed at x=0, width=3
    // Separator at x=3, width=1
    // ColB should start at x=4
    const colBBox = board.screen.nodeBox("ColB")
    expect(colBBox).not.toBeNull()
    expect(colBBox!.x, "Expanded column should start at collapsed_width + separator = 4").toBe(4)
  })

  test("collapsed column in middle position has symmetric borders", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Left", item("l1")),
          item("Middle", item("m1")),
          item("Right", item("r1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Navigate to middle column and collapse
    board.press("l").press("c")

    // Find collapsed column
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBe(1)
    const collapsedBox = collapsed.boundingBox()
    expect(collapsedBox).not.toBeNull()
    if (!collapsedBox) return

    // Check borders on all rows
    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)
    for (let y = collapsedBox.y; y < collapsedBox.y + collapsedBox.height; y++) {
      const leftCell = board.screen.cell(collapsedBox.x, y)
      const rightCell = board.screen.cell(collapsedBox.x + collapsedBox.width - 1, y)
      expect(
        isBorderChar(leftCell.char),
        `Row ${y}: left border at x=${collapsedBox.x} should be border char, got '${leftCell.char}'`,
      ).toBe(true)
      expect(
        isBorderChar(rightCell.char),
        `Row ${y}: right border at x=${collapsedBox.x + collapsedBox.width - 1} should be border char, got '${rightCell.char}'`,
      ).toBe(true)
    }
  })
})

// =============================================================================
// Bug 3: km-tui.card-border-missing
// =============================================================================

describe("km-tui.card-border-missing", () => {
  test("selected body card has border, unselected body cards are borderless", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Col1", item("task1"), item("task2"), item("task3")),
          item("Col2", item("task4"), item("task5")),
        ),
      { columns: 80, rows: 24 },
    )

    // task1 is selected — should have border
    board.expectNodeBorder("task1")
    // All other body cards are unselected — should be borderless
    board.expectNodeNoBorder("task2")
    board.expectNodeNoBorder("task3")
    board.expectNodeNoBorder("task4")
    board.expectNodeNoBorder("task5")
  })

  test("selected body card has border in narrow terminal (40 cols)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Col1", item("narrow-task")),
        ),
      { columns: 40, rows: 20 },
    )

    // narrow-task is selected — should have border
    board.expectNodeBorder("narrow-task")
  })

  test("selected card visible after scrolling through many cards", () => {
    const items = Array.from({ length: 10 }, (_, i) => item(`card-${i}`))
    const { board } = testEnv(
      () => item("board", item("BigCol", ...items)),
      { columns: 80, rows: 15 },
    )

    // Navigate to a card near the middle
    for (let i = 0; i < 5; i++) board.press("j")

    // card-5 is now selected and should have [data-cursor]
    board.expect("#card-5[data-cursor]").toExist()
    board.expectScreen("card-5")
  })

  test("structural cards always have borders regardless of selection", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Work",
            item.section("Section A", item("task-a")),
            item.section("Section B", item("task-b")),
          ),
        ),
      { columns: 80, rows: 20 },
    )

    // Structural cards (oi type, created with item.section()) always have borders
    board.expectNodeBorder("Section A")
    board.expectNodeBorder("Section B")
  })

  test("unselected body cards are borderless after cursor movement", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Col1", item("a1"), item("a2")),
          item("Col2", item("b1"), item("b2")),
        ),
      { columns: 80, rows: 20 },
    )

    // Move between columns
    board.press("l")  // to Col2
    board.press("h")  // back to Col1
    board.press("j")  // down to a2

    // Cursor should be on a2
    board.expect("#a2[data-cursor]").toExist()
    // Unselected body cards should not have borders
    board.expectNodeNoBorder("a1")
    board.expectNodeNoBorder("b1")
    board.expectNodeNoBorder("b2")
  })

  test("cursor movement transfers selection between body cards", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Col1", item("selected-task"), item("other-task")),
        ),
      { columns: 80, rows: 20 },
    )

    // First card is selected
    board.expect("#selected-task[data-cursor]").toExist()
    // Other card is not selected — no border
    board.expectNodeNoBorder("other-task")

    // Navigate to second card
    board.press("j")
    // Now other-task is selected
    board.expect("#other-task[data-cursor]").toExist()
    // First card is now unselected — no border
    board.expectNodeNoBorder("selected-task")
  })
})
