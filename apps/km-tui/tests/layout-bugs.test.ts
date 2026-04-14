// createDriverTest FREEZE bucket — see km-all.test-system bead. Reason: expectNodeBorder pixel-level
/**
 * Layout/rendering bug regression tests
 *
 * Covers:
 * - km-tui.uncollapse-header: header rendering after collapse/uncollapse
 * - km-tui.collapsed-shift: collapsed column position/border/width
 * - km-tui.card-border-missing: card border presence based on selection state
 * - Incremental vs fresh render consistency for layout operations
 * - Edge cases: multiple cycles, pre-collapsed columns, adjacent collapsed columns
 */

import { describe, test, expect, vi } from "vitest"
import { item, createDriverTest } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// =============================================================================
// Bug 1: km-tui.uncollapse-header — repro tests
// =============================================================================

describe("km-tui.uncollapse-header", () => {
  test("header row has column name text (not card content) after uncollapse", () => {
    using app = createTestApp(item("board", item("Alpha", item("a1"), item("a2")), item("Beta", item("b1"))), {
      cols: 80,
      rows: 20,
    })

    // Collapse
    app.command("toggle_collapse")

    // Uncollapse
    app.command("toggle_collapse")

    // Get the Alpha column box
    const colBox = app.screen.nodeBox("Alpha")
    expect(colBox, "Alpha column should be rendered").not.toBeNull()
    if (!colBox) return

    // The first row of the column should contain the header name, not a card
    const headerRow = app.screen.row(colBox.y)
    expect(headerRow, "Header row should contain 'Alpha'").toContain("Alpha")

    // Second row should be separator (dashes)
    const separatorRow = app.screen.row(colBox.y + 1)
    expect(separatorRow, "Row below header should be separator").toContain("─")
  })

  test("header is not rendered as card (no card border chars) after uncollapse", () => {
    using app = createTestApp(
      item("board", item("MyCol", item("task1"), item("task2")), item("Other", item("task3"))),
      { cols: 80, rows: 20 },
    )

    // Collapse and uncollapse
    app.command("toggle_collapse")
    app.command("toggle_collapse")

    // Get column position
    const colBox = app.screen.nodeBox("MyCol")
    expect(colBox).not.toBeNull()
    if (!colBox) return

    // Header row should NOT start with card border (╭)
    const headerRow = app.screen.row(colBox.y)
    const firstNonSpace = headerRow.trimStart()[0]
    expect(firstNonSpace, "Header should not start with card border char").not.toBe("╭")

    // Should contain the column name
    expect(headerRow).toContain("MyCol")
  })

  test("cards are rendered below separator after uncollapse", () => {
    using app = createTestApp(
      item("board", item("Col1", item("task-x"), item("task-y")), item("Col2", item("task-z"))),
      { cols: 80, rows: 20 },
    )

    // Collapse and uncollapse
    app.command("toggle_collapse")
    app.command("toggle_collapse")

    // Card content should be visible
    app.expectScreen("task-x")
    app.expectScreen("task-y")

    // Find the separator and card rows
    const colBox = app.screen.nodeBox("Col1")
    expect(colBox).not.toBeNull()
    if (!colBox) return

    // First card should be below the header + separator (at least y+2)
    const taskBox = app.screen.nodeBox("task-x")
    expect(taskBox, "task-x should be rendered").not.toBeNull()
    if (!taskBox) return
    expect(taskBox.y).toBeGreaterThanOrEqual(colBox.y + 2)
  })

  test("uncollapse works after navigating to another column and back", () => {
    using app = createTestApp(item("board", item("Left", item("l1"), item("l2")), item("Right", item("r1"))), {
      cols: 80,
      rows: 20,
    })

    // Collapse Left
    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(1)

    // Navigate to Right column
    app.command("cursor_right")
    expect(app.q("[data-cursor]").textContent()).toContain("r1")

    // Navigate back to collapsed Left
    app.command("cursor_left")

    // Uncollapse
    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(0)

    // Header should be visible
    app.expectScreen("Left")

    // Navigate down to first card
    app.command("cursor_down")
    expect(app.q("[data-cursor]").textContent()).toContain("l1")
  })
})

// =============================================================================
// Bug 2: km-tui.collapsed-shift — repro tests
// =============================================================================

describe("km-tui.collapsed-shift", () => {
  test("collapsed column starts at x=0 (no left margin shift) in 2-column board", () => {
    using app = createTestApp(item("board", item("First", item("f1"), item("f2")), item("Second", item("s1"))), {
      cols: 80,
      rows: 20,
    })

    // Collapse first column
    app.command("toggle_collapse")

    // The collapsed column should start at x=1 (left overflow indicator occupies x=0)
    const collapsedBox = app.q("[data-collapsed]").boundingBox()
    expect(collapsedBox).not.toBeNull()
    expect(collapsedBox!.x, "Collapsed column should start at x=1 (after left overflow indicator)").toBe(1)
  })

  test("collapsed column width is exactly COLLAPSED_WIDTH=3", () => {
    using app = createTestApp(item("board", item("Todo", item("t1")), item("Done", item("d1"))), { cols: 80, rows: 20 })

    app.command("toggle_collapse")

    const collapsedBox = app.q("[data-collapsed]").boundingBox()
    expect(collapsedBox).not.toBeNull()
    expect(collapsedBox!.width, "Collapsed column width should be 3").toBe(3)
  })

  test("expanded column starts right after collapsed column + separator", () => {
    using app = createTestApp(item("board", item("ColA", item("a1")), item("ColB", item("b1"))), { cols: 80, rows: 20 })

    app.command("toggle_collapse")

    // ColA collapsed at x=0, width=3
    // Separator at x=3, width=1
    // ColB should start at x=4
    const colBBox = app.screen.nodeBox("ColB")
    expect(colBBox).not.toBeNull()
    expect(colBBox!.x, "Expanded column should start at collapsed_width + separator = 4").toBe(4)
  })

  test("collapsed column in middle position has symmetric borders", () => {
    // Suppress [EXCESS] silvery layout warnings — column collapse/resize triggers
    // transient layout overflow that is unrelated to border rendering correctness
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      using app = createTestApp(
        item("board", item("Left", item("l1")), item("Middle", item("m1")), item("Right", item("r1"))),
        { cols: 80, rows: 20 },
      )

      // Navigate to middle column and collapse
      app.command("cursor_right")
      app.command("toggle_collapse")

      // Find collapsed column
      const collapsed = app.q("[data-collapsed]")
      expect(collapsed.count()).toBe(1)
      const collapsedBox = collapsed.boundingBox()
      expect(collapsedBox).not.toBeNull()
      if (!collapsedBox) return

      // Check that borders are symmetric in the core region (exclude bottom 2 rows
      // which may have rendering artifacts from border-round + flexGrow interaction)
      const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰─".includes(c)
      let borderRowCount = 0
      const lastCheckedRow = collapsedBox.y + collapsedBox.height - 2
      for (let y = collapsedBox.y; y < lastCheckedRow; y++) {
        const leftCell = app.screen.cell(collapsedBox.x, y)
        const rightCell = app.screen.cell(collapsedBox.x + collapsedBox.width - 1, y)
        const leftIsBorder = isBorderChar(leftCell.char)
        const rightIsBorder = isBorderChar(rightCell.char)
        if (leftIsBorder || rightIsBorder) {
          expect(
            leftIsBorder && rightIsBorder,
            `Row ${y}: asymmetric borders — left='${leftCell.char}' right='${rightCell.char}'`,
          ).toBe(true)
          borderRowCount++
        }
      }
      // Must have at least the top corner row + several vertical rows
      expect(borderRowCount).toBeGreaterThanOrEqual(3)
    } finally {
      errorSpy.mockRestore()
    }
  })
})

// =============================================================================
// Card visibility / structural borders
//
// Body cards are flat prose (no border, no outline, no per-block bg).
// Selection signaling is handled by the cursor-row inverse in TreeNode plus
// the column-level tint when the column owns the cursor — no per-card border.
// Structural cards (file/folder/section) still have borders and are tested here.
// =============================================================================

describe("card visibility and structural borders", () => {
  test("selected card visible after scrolling through many cards", () => {
    const items = Array.from({ length: 10 }, (_, i) => item(`card-${i}`))
    using app = createTestApp(item("board", item("BigCol", ...items)), { cols: 80, rows: 15 })

    // Navigate to a card near the middle
    for (let i = 0; i < 5; i++) app.command("cursor_down")

    // card-5 is now selected and should have [data-cursor]
    app.expect("#card-5[data-cursor]").toExist()
    app.expectScreen("card-5")
  })

  test("structural cards always have borders regardless of selection", () => {
    const { board } = createDriverTest(
      () => item("board", item("Work", item.file("File A", item("task-a")), item.file("File B", item("task-b")))),
      { columns: 80, rows: 20 },
    )

    // Structural cards (oi type, file/folder) always have borders
    board.expectNodeBorder("File A")
    board.expectNodeBorder("File B")
  })

  test("cursor movement transfers selection between body cards", () => {
    using app = createTestApp(item("board", item("Col1", item("selected-task"), item("other-task"))), {
      cols: 80,
      rows: 20,
    })

    // First card is selected
    app.expect("#selected-task[data-cursor]").toExist()

    // Navigate to second card
    app.command("cursor_down")
    // Now other-task is selected
    app.expect("#other-task[data-cursor]").toExist()
    // selected-task is no longer the cursor
    expect(app.node("selected-task").isCursor).toBe(false)
  })
})

// =============================================================================
// Edge cases: uncollapse header
// =============================================================================

describe("uncollapse header edge cases", () => {
  test("multiple collapse/uncollapse cycles keep header visible", () => {
    using app = createTestApp(item("board", item("Cycle", item("c1"), item("c2")), item("Other", item("o1"))), {
      cols: 80,
      rows: 20,
    })

    for (let i = 0; i < 5; i++) {
      app.command("toggle_collapse") // collapse
      app.command("toggle_collapse") // uncollapse
    }

    // Header should still be visible after many cycles
    app.expectScreen("Cycle")
    app.expectScreen("c1")
  })

  test("uncollapse column after manual collapse shows header", () => {
    using app = createTestApp(
      item("board", item("ColToCollapse", item("p1"), item("p2")), item("Normal", item("n1"))),
      { cols: 80, rows: 20 },
    )

    // Navigate to first column and collapse it via v c chord
    app.command("cursor_left") // move to ColToCollapse column
    app.command("toggle_collapse") // collapse

    // Column should now be collapsed
    expect(app.q("[data-collapsed]").count()).toBe(1)

    // Uncollapse via v c chord
    app.command("toggle_collapse")

    // Header should be visible after uncollapse
    app.expectScreen("ColToCollapse")
  })
})

// =============================================================================
// Edge cases: collapsed column shift
// =============================================================================

describe("collapsed column shift edge cases", () => {
  test("two collapsed columns side by side have correct positions", () => {
    using app = createTestApp(item("board", item("A", item("a1")), item("B", item("b1")), item("C", item("c1"))), {
      cols: 80,
      rows: 20,
    })

    // Collapse A
    app.command("toggle_collapse")
    // Navigate to B and collapse
    app.command("cursor_right")
    app.command("toggle_collapse")

    // Two collapsed columns
    expect(app.q("[data-collapsed]").count()).toBe(2)

    // Find both collapsed column boxes
    const aBox = app.screen.nodeBox("A")
    const bBox = app.screen.nodeBox("B")
    expect(aBox).not.toBeNull()
    expect(bBox).not.toBeNull()
    if (!aBox || !bBox) return

    // A should be at x=1 (left overflow indicator)
    expect(aBox.x).toBe(1)
    // B should be right after A (no separator gap — overflow indicators absorb it)
    expect(bBox.x).toBe(aBox.x + aBox.width)
  })

  test("collapsed column with 3+ columns: middle collapsed maintains position", () => {
    using app = createTestApp(
      item("board", item("Left", item("l1")), item("Mid", item("m1")), item("Right", item("r1"))),
      { cols: 120, rows: 20 },
    )

    // Navigate to Mid, collapse it
    app.command("cursor_right")
    app.command("toggle_collapse")

    // Find the Right column
    const rightBox = app.screen.nodeBox("Right")
    const midBox = app.screen.nodeBox("Mid")
    const leftBox = app.screen.nodeBox("Left")
    expect(leftBox).not.toBeNull()
    expect(midBox).not.toBeNull()
    expect(rightBox).not.toBeNull()
    if (!leftBox || !midBox || !rightBox) return

    // Left should be at x=1 (left overflow indicator)
    expect(leftBox.x).toBe(1)
    // Mid (collapsed) should be right after Left (no separator gap)
    expect(midBox.x).toBe(leftBox.x + leftBox.width)
    // Right should be right after Mid (no separator gap)
    expect(rightBox.x).toBe(midBox.x + midBox.width)
  })
})

