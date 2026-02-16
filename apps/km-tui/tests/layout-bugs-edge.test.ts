/**
 * Edge-case tests for P2 layout/rendering bugs to try to reproduce:
 * - Incremental rendering differences
 * - Multiple collapse/uncollapse cycles
 * - Body content columns
 * - Pre-collapsed columns
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("uncollapse header edge cases", () => {
  test("incremental render matches fresh render after collapse/uncollapse — km-tui.uncollapse-header", () => {
    const { board: incBoard } = testEnv(
      () =>
        item(
          "board",
          item("Alpha", item("a1"), item("a2")),
          item("Beta", item("b1")),
        ),
      { columns: 80, rows: 20, incremental: true },
    )

    // Collapse and uncollapse
    incBoard.press("c")
    incBoard.press("c")

    // Compare incremental buffer against fresh render
    const incBuffer = incBoard._result.lastBuffer()!
    const freshBuffer = incBoard._result.freshRender()

    for (let y = 0; y < incBuffer.height; y++) {
      for (let x = 0; x < incBuffer.width; x++) {
        const a = incBuffer.getCell(x, y)
        const b = freshBuffer.getCell(x, y)
        if (a.char !== b.char) {
          expect.fail(
            `Cell (${x},${y}): incremental='${a.char}' fresh='${b.char}'`,
          )
        }
      }
    }
  })

  test("multiple collapse/uncollapse cycles keep header visible", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Cycle", item("c1"), item("c2")),
          item("Other", item("o1")),
        ),
      { columns: 80, rows: 20 },
    )

    for (let i = 0; i < 5; i++) {
      board.press("c") // collapse
      board.press("c") // uncollapse
    }

    // Header should still be visible after many cycles
    board.expectScreen("Cycle")
    board.expectScreen("c1")
  })

  test("uncollapse column with collapse=true rule shows header", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("PreCollapsed collapse=true", item("p1"), item("p2")),
          item("Normal", item("n1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Pre-collapsed column should be collapsed
    expect(board.q("[data-collapsed]").count()).toBe(1)

    // Navigate to collapsed column and uncollapse
    board.press("h")
    board.press("c")

    // Header should be visible
    board.expectScreen("PreCollapsed")
  })

  test("uncollapse incremental buffer matches fresh after collapse/uncollapse — km-tui.uncollapse-header", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("TestCol", item("t1"), item("t2")),
          item("Other", item("o1")),
        ),
      { columns: 80, rows: 20, incremental: true },
    )

    board.press("c")
    board.press("c")

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

describe("collapsed column shift edge cases", () => {
  test("two collapsed columns side by side have correct positions", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("A", item("a1")),
          item("B", item("b1")),
          item("C", item("c1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse A
    board.press("c")
    // Navigate to B and collapse
    board.press("l")
    board.press("c")

    // Two collapsed columns
    expect(board.q("[data-collapsed]").count()).toBe(2)

    // Find both collapsed column boxes
    const aBox = board.screen.nodeBox("A")
    const bBox = board.screen.nodeBox("B")
    expect(aBox).not.toBeNull()
    expect(bBox).not.toBeNull()
    if (!aBox || !bBox) return

    // A should be at x=0
    expect(aBox.x).toBe(0)
    // B should be at A.x + A.width + 1 (separator)
    expect(bBox.x).toBe(aBox.x + aBox.width + 1)
  })

  test("collapsed column with 3+ columns: middle collapsed maintains position", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Left", item("l1")),
          item("Mid", item("m1")),
          item("Right", item("r1")),
        ),
      { columns: 120, rows: 20 },
    )

    // Navigate to Mid, collapse it
    board.press("l")
    board.press("c")

    // Find the Right column
    const rightBox = board.screen.nodeBox("Right")
    const midBox = board.screen.nodeBox("Mid")
    const leftBox = board.screen.nodeBox("Left")
    expect(leftBox).not.toBeNull()
    expect(midBox).not.toBeNull()
    expect(rightBox).not.toBeNull()
    if (!leftBox || !midBox || !rightBox) return

    // Left should be at x=0
    expect(leftBox.x).toBe(0)
    // Mid (collapsed) should be right after Left + separator
    expect(midBox.x).toBe(leftBox.x + leftBox.width + 1)
    // Right should be right after Mid + separator
    expect(rightBox.x).toBe(midBox.x + midBox.width + 1)
  })
})

describe("card border missing edge cases", () => {
  test("card right border present with content filling full width", () => {
    // Create a card whose content would be exactly the right length to potentially overflow
    const longContent = "X".repeat(35) // roughly fills a 40-char column
    const { board } = testEnv(
      () => item("board", item("Col1", item(longContent))),
      { columns: 40, rows: 20 },
    )

    const box = board.screen.nodeBox(longContent)
    expect(box).not.toBeNull()
    if (!box) return

    // Check that the border exists outside the content area
    const borderLeft = box.x - 1
    const borderRight = box.x + box.width
    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)

    if (borderLeft >= 0) {
      const leftCell = board.screen.cell(borderLeft, box.y)
      expect(
        isBorderChar(leftCell.char),
        `Left border at (${borderLeft},${box.y}) = '${leftCell.char}'`,
      ).toBe(true)
    }
    if (borderRight < 40) {
      const rightCell = board.screen.cell(borderRight, box.y)
      expect(
        isBorderChar(rightCell.char),
        `Right border at (${borderRight},${box.y}) = '${rightCell.char}'`,
      ).toBe(true)
    }
  })

  test("incremental render card borders match fresh render", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Col1", item("t1"), item("t2")),
          item("Col2", item("t3")),
        ),
      { columns: 80, rows: 20, incremental: true },
    )

    // Navigate to force re-render
    board.press("j")
    board.press("l")
    board.press("h")

    const incBuffer = board._result.lastBuffer()!
    const freshBuffer = board._result.freshRender()

    // Check border-specific cells - compare just border-relevant rows
    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)
    for (let y = 0; y < incBuffer.height; y++) {
      for (let x = 0; x < incBuffer.width; x++) {
        const a = incBuffer.getCell(x, y)
        const b = freshBuffer.getCell(x, y)
        // Only check mismatches where one has a border char and the other doesn't
        if (isBorderChar(a.char) !== isBorderChar(b.char)) {
          expect.fail(
            `Border mismatch at (${x},${y}): inc='${a.char}' fresh='${b.char}'`,
          )
        }
      }
    }
  })
})
