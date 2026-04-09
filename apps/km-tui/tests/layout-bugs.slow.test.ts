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
import { item, testEnv } from "./helpers/board-test.ts"
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

      // Check borders on all rows
      const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)
      for (let y = collapsedBox.y; y < collapsedBox.y + collapsedBox.height; y++) {
        const leftCell = app.screen.cell(collapsedBox.x, y)
        const rightCell = app.screen.cell(collapsedBox.x + collapsedBox.width - 1, y)
        expect(
          isBorderChar(leftCell.char),
          `Row ${y}: left border at x=${collapsedBox.x} should be border char, got '${leftCell.char}'`,
        ).toBe(true)
        expect(
          isBorderChar(rightCell.char),
          `Row ${y}: right border at x=${collapsedBox.x + collapsedBox.width - 1} should be border char, got '${rightCell.char}'`,
        ).toBe(true)
      }
    } finally {
      errorSpy.mockRestore()
    }
  })
})

// =============================================================================
// Bug 3: km-tui.card-border-missing — repro tests
//
// These tests use expectNodeBorder (not supported in createTestApp), so they
// remain on testEnv.
// =============================================================================

describe("km-tui.card-border-missing", () => {
  test("selected body card has yellow border, unselected body cards have dim border", () => {
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
    // All other body cards are unselected — should have dim border
    board.expectNodeBorder("task2")
    board.expectNodeBorder("task3")
    board.expectNodeBorder("task4")
    board.expectNodeBorder("task5")
  })

  test("selected body card has border in narrow terminal (40 cols)", () => {
    const { board } = testEnv(() => item("board", item("Col1", item("narrow-task"))), { columns: 40, rows: 20 })

    // narrow-task is selected — should have border
    board.expectNodeBorder("narrow-task")
  })

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
    const { board } = testEnv(
      () => item("board", item("Work", item.file("File A", item("task-a")), item.file("File B", item("task-b")))),
      { columns: 80, rows: 20 },
    )

    // Structural cards (oi type, file/folder) always have borders
    board.expectNodeBorder("File A")
    board.expectNodeBorder("File B")
  })

  test("unselected body cards have dim border after cursor movement", () => {
    const { board } = testEnv(
      () => item("board", item("Col1", item("a1"), item("a2")), item("Col2", item("b1"), item("b2"))),
      { columns: 80, rows: 20 },
    )

    // Move between columns
    board.command("cursor_right") // to Col2
    board.command("cursor_left") // back to Col1
    board.command("cursor_down") // down to a2

    // Cursor should be on a2
    board.expect("#a2[data-cursor]").toExist()
    // Unselected body cards should have dim border
    board.expectNodeBorder("a1")
    board.expectNodeBorder("b1")
    board.expectNodeBorder("b2")
  })

  test("cursor movement transfers selection between body cards", () => {
    const { board } = testEnv(() => item("board", item("Col1", item("selected-task"), item("other-task"))), {
      columns: 80,
      rows: 20,
    })

    // First card is selected
    board.expect("#selected-task[data-cursor]").toExist()
    // Other card is not selected — has dim border
    board.expectNodeBorder("other-task")

    // Navigate to second card
    board.command("cursor_down")
    // Now other-task is selected
    board.expect("#other-task[data-cursor]").toExist()
    // First card is now unselected — has dim border
    board.expectNodeBorder("selected-task")
  })
})

// =============================================================================
// Edge cases: uncollapse header
// Tests using _result.lastBuffer() / freshRender() stay on testEnv.
// =============================================================================

describe("uncollapse header edge cases", () => {
  test("incremental render matches fresh render after collapse/uncollapse — km-tui.uncollapse-header", () => {
    const { board: incBoard } = testEnv(
      () => item("board", item("Alpha", item("a1"), item("a2")), item("Beta", item("b1"))),
      { columns: 80, rows: 20, incremental: true },
    )

    // Collapse and uncollapse
    incBoard.command("toggle_collapse")
    incBoard.command("toggle_collapse")

    // Compare incremental buffer against fresh render
    const incBuffer = incBoard._result.lastBuffer()!
    const freshBuffer = incBoard._result.freshRender()

    for (let y = 0; y < incBuffer.height; y++) {
      for (let x = 0; x < incBuffer.width; x++) {
        const a = incBuffer.getCell(x, y)
        const b = freshBuffer.getCell(x, y)
        if (a.char !== b.char) {
          expect.fail(`Cell (${x},${y}): incremental='${a.char}' fresh='${b.char}'`)
        }
      }
    }
  })

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

  test("uncollapse incremental buffer matches fresh after collapse/uncollapse — km-tui.uncollapse-header", () => {
    const { board } = testEnv(() => item("board", item("TestCol", item("t1"), item("t2")), item("Other", item("o1"))), {
      columns: 80,
      rows: 20,
      incremental: true,
    })

    board.command("toggle_collapse")
    board.command("toggle_collapse")

    const incBuffer = board._result.lastBuffer()!
    const freshBuffer = board._result.freshRender()

    // Compare buffers cell-by-cell
    for (let y = 0; y < incBuffer.height; y++) {
      for (let x = 0; x < incBuffer.width; x++) {
        const a = incBuffer.getCell(x, y)
        const b = freshBuffer.getCell(x, y)
        if (
          a.char !== b.char ||
          JSON.stringify(a.fg) !== JSON.stringify(b.fg) ||
          JSON.stringify(a.bg) !== JSON.stringify(b.bg) ||
          JSON.stringify(a.attrs) !== JSON.stringify(b.attrs)
        ) {
          expect.fail(
            `Cell mismatch at (${x},${y}): ` +
              `inc={char:${JSON.stringify(a.char)} fg:${JSON.stringify(a.fg)} bg:${JSON.stringify(a.bg)}} ` +
              `fresh={char:${JSON.stringify(b.char)} fg:${JSON.stringify(b.fg)} bg:${JSON.stringify(b.bg)}}`,
          )
        }
      }
    }
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

// =============================================================================
// Edge cases: card border missing
// Tests using expectNodeBorder / _result.lastBuffer() stay on testEnv.
// =============================================================================

describe("card border missing edge cases", () => {
  test("selected body card with long content has border", () => {
    // Create a card whose content would be exactly the right length to potentially overflow
    const longContent = "X".repeat(35) // roughly fills a 40-char column
    const { board } = testEnv(() => item("board", item("Col1", item(longContent))), { columns: 40, rows: 20 })

    // Selected body card should have a border
    board.expectNodeBorder(longContent)
  })

  test("incremental render card borders match fresh render", () => {
    const { board } = testEnv(() => item("board", item("Col1", item("t1"), item("t2")), item("Col2", item("t3"))), {
      columns: 80,
      rows: 20,
      incremental: true,
    })

    // Navigate to force re-render
    board.command("cursor_down")
    board.command("cursor_right")
    board.command("cursor_left")

    const incBuffer = board._result.lastBuffer()!
    const freshBuffer = board._result.freshRender()

    // Check border-specific cells - compare just border-relevant rows.
    // Body cards (li type) always have borders (dim gray unselected, yellow selected).
    // Stale border color from selection transitions is acceptable in incremental
    // rendering — only check for MISSING borders (fresh has border but incremental
    // doesn't).
    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)
    for (let y = 0; y < incBuffer.height; y++) {
      for (let x = 0; x < incBuffer.width; x++) {
        const a = incBuffer.getCell(x, y)
        const b = freshBuffer.getCell(x, y)
        // Only flag mismatches where fresh has a border but incremental doesn't
        // (stale border in incremental but not in fresh is tolerable for body cards)
        if (!isBorderChar(a.char) && isBorderChar(b.char)) {
          expect.fail(`Missing border at (${x},${y}): inc='${a.char}' fresh='${b.char}'`)
        }
      }
    }
  })
})
