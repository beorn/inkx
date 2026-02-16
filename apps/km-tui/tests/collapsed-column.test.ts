/**
 * Collapsed Column Tests
 *
 * Bug 1: km-tui.collapsed-shift — Collapsed columns render with shifted borders
 * (too much left margin, right border cut off)
 *
 * Bug 2: km-tui.uncollapse-header — After uncollapsing, header doesn't show
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

// =============================================================================
// Bug 1: Collapsed column borders shifted right
// =============================================================================

describe("collapsed column border symmetry", () => {
  test("collapsed column inner border fills allocated width exactly", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Todo", item("1a"), item("1b")),
          item("Done", item("2a")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse "Todo" column
    board.press("c")
    board.expect("[data-collapsed]").toExist()

    // Find the collapsed column box
    const box = board.screen.nodeBox("Todo")
    expect(box).not.toBeNull()
    if (!box) return

    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)

    // Scan the top row for border characters within the column area
    let firstBorderX = -1
    let lastBorderX = -1
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (isBorderChar(cell.char)) {
        if (firstBorderX === -1) firstBorderX = x
        lastBorderX = x
      }
    }

    // First border char should be at box.x (no left margin shift)
    expect(
      firstBorderX,
      `First border char at top should be at x=${box.x}, got ${firstBorderX}`,
    ).toBe(box.x)
    // Last border char should be at box.x + box.width - 1 (right border present)
    expect(
      lastBorderX,
      `Last border char at top should be at x=${box.x + box.width - 1}, got ${lastBorderX}`,
    ).toBe(box.x + box.width - 1)
  })

  test("collapsed column right border is not cut off", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Todo", item("1a"), item("1b")),
          item("Done", item("2a")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse "Todo" column
    board.press("c")

    const box = board.screen.nodeBox("Todo")
    expect(box).not.toBeNull()
    if (!box) return

    // Check a middle row — both left and right borders should be present
    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)
    const midY = box.y + Math.floor(box.height / 2)
    const leftCell = board.screen.cell(box.x, midY)
    const rightCell = board.screen.cell(box.x + box.width - 1, midY)
    expect(
      isBorderChar(leftCell.char),
      `Left border at (${box.x}, ${midY}) should be │ but got '${leftCell.char}'`,
    ).toBe(true)
    expect(
      isBorderChar(rightCell.char),
      `Right border at (${box.x + box.width - 1}, ${midY}) should be │ but got '${rightCell.char}'`,
    ).toBe(true)
  })

  test("collapsed column borders are symmetric (left and right present on all rows)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Todo", item("1a"), item("1b")),
          item("Done", item("2a")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse "Todo" column
    board.press("c")

    const box = board.screen.nodeBox("Todo")
    expect(box).not.toBeNull()
    if (!box) return

    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)
    for (let y = box.y; y < box.y + box.height; y++) {
      const leftCell = board.screen.cell(box.x, y)
      const rightCell = board.screen.cell(box.x + box.width - 1, y)
      const leftIsBorder = isBorderChar(leftCell.char)
      const rightIsBorder = isBorderChar(rightCell.char)
      expect(
        leftIsBorder && rightIsBorder,
        `Row y=${y}: left='${leftCell.char}' right='${rightCell.char}' — expected both to be border chars`,
      ).toBe(true)
    }
  })
})

describe("collapsed column after shift", () => {
  test("collapsed column borders intact after Meta+l shift right", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Todo", item("1a"), item("1b")),
          item("Done", item("2a")),
          item("Later", item("3a")),
        ),
      { columns: 80, rows: 20 },
    )

    // Navigate to column header level, collapse Todo
    board.press("k")
    board.expect("#Todo[data-cursor]").toExist()
    board.press("c")
    board.expect("[data-collapsed]").toExist()

    // Shift collapsed Todo column right (swap with Done)
    board.press("Meta+l")
    board.expect("#Todo[data-cursor]").toExist()

    // Find the collapsed column box after shift
    const box = board.screen.nodeBox("Todo")
    expect(box).not.toBeNull()
    if (!box) return

    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)

    // Verify borders on all rows — the bug is that left border is shifted right
    // (too much left margin) and right border is cut off
    for (let y = box.y; y < box.y + box.height; y++) {
      const leftCell = board.screen.cell(box.x, y)
      const rightCell = board.screen.cell(box.x + box.width - 1, y)
      expect(
        isBorderChar(leftCell.char),
        `Row y=${y}: left border at x=${box.x} should be border char but got '${leftCell.char}'`,
      ).toBe(true)
      expect(
        isBorderChar(rightCell.char),
        `Row y=${y}: right border at x=${box.x + box.width - 1} should be border char but got '${rightCell.char}'`,
      ).toBe(true)
    }
  })

  test("collapsed column width stays narrow after Meta+l shift", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Todo", item("1a"), item("1b")),
          item("Done", item("2a")),
          item("Later", item("3a")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse Todo and shift right
    board.press("k")
    board.press("c")
    board.press("Meta+l")

    // The collapsed column should still be narrow (COLLAPSED_WIDTH = 3)
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBe(1)
    const bbox = collapsed.boundingBox()
    expect(bbox).not.toBeNull()
    expect(bbox!.width).toBeLessThanOrEqual(5)
  })

  test("collapsed column has no extra left margin after shift", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Todo", item("1a"), item("1b")),
          item("Done", item("2a")),
          item("Later", item("3a")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse Todo and shift right
    board.press("k")
    board.press("c")
    board.press("Meta+l")

    const box = board.screen.nodeBox("Todo")
    expect(box).not.toBeNull()
    if (!box) return

    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)

    // Scan the top row: first border char should be at box.x (no left margin)
    let firstBorderX = -1
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (isBorderChar(cell.char)) {
        firstBorderX = x
        break
      }
    }
    expect(
      firstBorderX,
      `First border char should be at box.x=${box.x}, got ${firstBorderX}`,
    ).toBe(box.x)
  })

  test("incremental render matches fresh after collapse + shift", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Todo", item("1a"), item("1b")),
          item("Done", item("2a")),
          item("Later", item("3a")),
        ),
      { columns: 80, rows: 20, incremental: true },
    )

    // Collapse Todo and shift right
    board.press("k")
    board.press("c")
    board.press("Meta+l")

    const incBuffer = board._result.lastBuffer()!
    const freshBuffer = board._result.freshRender()

    // Compare buffers cell-by-cell
    for (let y = 0; y < incBuffer.height; y++) {
      for (let x = 0; x < incBuffer.width; x++) {
        const a = incBuffer.getCell(x, y)
        const b = freshBuffer.getCell(x, y)
        if (a.char !== b.char || JSON.stringify(a.fg) !== JSON.stringify(b.fg) || JSON.stringify(a.bg) !== JSON.stringify(b.bg) || JSON.stringify(a.attrs) !== JSON.stringify(b.attrs)) {
          expect.fail(
            `Cell mismatch at (${x},${y}): ` +
              `inc={char:${JSON.stringify(a.char)} fg:${JSON.stringify(a.fg)} bg:${JSON.stringify(a.bg)} attrs:${JSON.stringify(a.attrs)}} ` +
              `fresh={char:${JSON.stringify(b.char)} fg:${JSON.stringify(b.fg)} bg:${JSON.stringify(b.bg)} attrs:${JSON.stringify(b.attrs)}}`,
          )
        }
      }
    }
  })

  test("collapsed column at different positions renders correctly", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Alpha", item("a1")),
          item("Beta", item("b1")),
          item("Gamma", item("c1")),
          item("Delta", item("d1")),
        ),
      { columns: 120, rows: 20 },
    )

    // Navigate to Beta, collapse it
    board.press("l").press("k")
    board.expect("#Beta[data-cursor]").toExist()
    board.press("c")

    // Shift collapsed Beta right (past Gamma)
    board.press("Meta+l")
    board.expect("#Beta[data-cursor]").toExist()

    // Verify Beta is still narrow and has proper borders
    const betaBox = board.screen.nodeBox("Beta")
    expect(betaBox).not.toBeNull()
    if (!betaBox) return

    expect(betaBox.width).toBeLessThanOrEqual(5)

    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)
    for (let y = betaBox.y; y < betaBox.y + betaBox.height; y++) {
      const leftCell = board.screen.cell(betaBox.x, y)
      const rightCell = board.screen.cell(betaBox.x + betaBox.width - 1, y)
      expect(
        isBorderChar(leftCell.char),
        `Row y=${y}: left at x=${betaBox.x} got '${leftCell.char}'`,
      ).toBe(true)
      expect(
        isBorderChar(rightCell.char),
        `Row y=${y}: right at x=${betaBox.x + betaBox.width - 1} got '${rightCell.char}'`,
      ).toBe(true)
    }

    // Also check visual order: Alpha, Gamma, Beta(collapsed), Delta
    const alphaBox = board.screen.nodeBox("Alpha")
    const gammaBox = board.screen.nodeBox("Gamma")
    const deltaBox = board.screen.nodeBox("Delta")
    expect(alphaBox).not.toBeNull()
    expect(gammaBox).not.toBeNull()
    expect(deltaBox).not.toBeNull()
    if (alphaBox && gammaBox && deltaBox) {
      expect(alphaBox.x).toBeLessThan(gammaBox.x)
      expect(gammaBox.x).toBeLessThan(betaBox.x)
      expect(betaBox.x).toBeLessThan(deltaBox.x)
    }
  })
})

// =============================================================================
// Bug 2: After uncollapsing, header doesn't show
// =============================================================================

describe("uncollapse header rendering", () => {
  test("column header text visible after collapse/uncollapse round-trip", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Alpha", item("a1"), item("a2")),
          item("Beta", item("b1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Initially, header should be visible
    board.expectScreen("Alpha")

    // Collapse
    board.press("c")
    board.expect("#a1").not.toExist()

    // Uncollapse
    board.press("c")
    board.expect("#a1").toExist()

    // Header text should still be visible after round-trip
    board.expectScreen("Alpha")
  })

  test("separator line visible after uncollapsing", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Alpha", item("a1"), item("a2")),
          item("Beta", item("b1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse and uncollapse
    board.press("c")
    board.press("c")

    // Separator line (between header and cards) should be present
    board.expectScreen("\u2500")
  })

  test("header row contains column name after uncollapsing", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("MyColumn", item("task1"), item("task2")),
          item("Other", item("other1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse and uncollapse
    board.press("c")
    board.expect("#task1").not.toExist()
    board.press("c")
    board.expect("#task1").toExist()

    // The column box should contain the header name in its first row
    const colBox = board.screen.nodeBox("MyColumn")
    expect(colBox).not.toBeNull()
    if (!colBox) return

    const headerRow = board.screen.row(colBox.y)
    expect(headerRow).toContain("MyColumn")
  })

  test("card count visible in header after uncollapsing", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Alpha", item("a1"), item("a2"), item("a3")),
          item("Beta", item("b1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse and uncollapse
    board.press("c")
    board.press("c")

    // The header should show the card count
    const screenshot = board.screenshot()
    expect(screenshot).toContain("3") // 3 cards in Alpha column
  })
})
