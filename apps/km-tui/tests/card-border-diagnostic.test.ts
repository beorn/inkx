/**
 * Card border rendering tests.
 *
 * Verifies that Card borders (│ on left/right, ╭╮╰╯ corners) render
 * correctly across various scenarios: scrolling, narrow terminals,
 * overflow indicators, multi-column layouts, and collapsed columns.
 *
 * NOTE: board.screen.nodeBox("id") returns the TreeNode content area
 * INSIDE the Card's border. The Card border is 1 cell outside:
 * - Left border: box.x - 1
 * - Right border: box.x + box.width
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

/** Check if a character is a box-drawing border character. */
function isBorderChar(c: string): boolean {
  return "│┌┐└┘├┤┬┴╭╮╯╰─".includes(c)
}

/**
 * Assert that the Card border has proper border chars at correct positions.
 * Checks 1 cell outside the nodeBox (where the Card's Box border renders).
 */
function expectCardBorder(
  board: ReturnType<typeof testEnv>["board"],
  nodeId: string,
  termWidth: number,
) {
  const box = board.screen.nodeBox(nodeId)
  expect(box, `node "${nodeId}" should exist`).not.toBeNull()
  if (!box) return

  const borderLeft = box.x - 1
  const borderRight = box.x + box.width

  for (let y = box.y; y < box.y + box.height; y++) {
    if (borderLeft >= 0) {
      const leftCell = board.screen.cell(borderLeft, y)
      expect(
        isBorderChar(leftCell.char),
        `node "${nodeId}" left border at (${borderLeft},${y}): got '${leftCell.char}'`,
      ).toBe(true)
    }
    if (borderRight < termWidth) {
      const rightCell = board.screen.cell(borderRight, y)
      expect(
        isBorderChar(rightCell.char),
        `node "${nodeId}" right border at (${borderRight},${y}): got '${rightCell.char}'`,
      ).toBe(true)
    }
  }
}

describe("card border: basic", () => {
  test("all cards in single column have borders", () => {
    const { board } = testEnv(
      () => item("board", item("col", item("1a"), item("1b"), item("1c"))),
      { columns: 80, rows: 24 },
    )
    expectCardBorder(board, "1a", 80)
    expectCardBorder(board, "1b", 80)
    expectCardBorder(board, "1c", 80)
  })

  test("borders persist after cursor navigation", () => {
    const { board } = testEnv(
      () => item("board", item("col", item("1a"), item("1b"), item("1c"))),
      { columns: 80, rows: 24 },
    )
    board.press("j")
    expectCardBorder(board, "1a", 80)
    expectCardBorder(board, "1b", 80)
    expectCardBorder(board, "1c", 80)
  })
})

describe("card border: scrolling", () => {
  test("borders present after scrolling down", () => {
    const cards = Array.from({ length: 15 }, (_, i) => item(`card-${i}`))
    const { board } = testEnv(() => item("board", item("col", ...cards)), { rows: 20 })

    for (let i = 0; i < 10; i++) board.press("j")

    const box = board.screen.nodeBox("card-10")
    if (box) expectCardBorder(board, "card-10", 80)
  })

  test("borders present after scrolling back up", () => {
    const cards = Array.from({ length: 20 }, (_, i) => item(`card-${i}`))
    const { board } = testEnv(() => item("board", item("col", ...cards)), { rows: 20 })

    for (let i = 0; i < 15; i++) board.press("j")
    for (let i = 0; i < 15; i++) board.press("k")

    expectCardBorder(board, "card-0", 80)
    expectCardBorder(board, "card-1", 80)
  })
})

describe("card border: terminal widths", () => {
  test("narrow terminal (30 cols)", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("1a"))),
      { columns: 30 },
    )
    expectCardBorder(board, "1a", 30)
  })

  test("narrow terminal with two columns (80 cols)", () => {
    // At 80 cols, both columns fit side-by-side (maxExpandedCols=2).
    // Verifies card borders render correctly in a multi-column narrow layout.
    const { board } = testEnv(
      () => item("board", item("col1", item("1a")), item("col2", item("2a"))),
      { columns: 80 },
    )
    expectCardBorder(board, "1a", 80)
    board.press("l")
    expectCardBorder(board, "2a", 80)
  })

  test("wide terminal (200 cols)", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("1a"))),
      { columns: 200 },
    )
    expectCardBorder(board, "1a", 200)
  })
})

describe("card border: overflow indicator", () => {
  test("card with overflow still has left/right borders", () => {
    const children = Array.from({ length: 10 }, (_, i) => item(`c${i}`))
    const { board } = testEnv(
      () => item("board", item("col", item("parent", ...children))),
      { columns: 80, rows: 30 },
    )

    const box = board.screen.nodeBox("parent")
    expect(box, "parent node should exist").not.toBeNull()
    if (!box) return

    const borderLeft = box.x - 1
    const borderRight = box.x + box.width
    let failures = 0
    for (let y = box.y; y < box.y + box.height; y++) {
      if (borderLeft >= 0 && !isBorderChar(board.screen.cell(borderLeft, y).char)) failures++
      if (borderRight < 80 && !isBorderChar(board.screen.cell(borderRight, y).char)) failures++
    }
    expect(failures).toBe(0)
  })
})

describe("card border: multi-column", () => {
  test("borders in all columns of 3-column layout", () => {
    const cols = 120
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a"), item("2b")),
          item("col3", item("3a"), item("3b")),
        ),
      { columns: cols },
    )

    for (const id of ["1a", "1b", "2a", "2b", "3a", "3b"]) {
      expectCardBorder(board, id, cols)
    }
  })

  test("borders persist after navigating between columns", () => {
    const cols = 120
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a")),
          item("col2", item("2a")),
          item("col3", item("3a")),
        ),
      { columns: cols },
    )

    board.press("l")
    expectCardBorder(board, "2a", cols)
    board.press("l")
    expectCardBorder(board, "3a", cols)
    board.press("h").press("h")
    expectCardBorder(board, "1a", cols)
  })
})

describe("card border: edge cases", () => {
  test("many columns with narrow cards", () => {
    const cols = 120
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a")),
          item("col2", item("2a")),
          item("col3", item("3a")),
          item("col4", item("4a")),
          item("col5", item("5a")),
        ),
      { columns: cols },
    )
    expectCardBorder(board, "1a", cols)
    board.press("l")
    expectCardBorder(board, "2a", cols)
  })

  test("card adjacent to collapsed column", () => {
    const cols = 120
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1 collapse=true", item("1a")),
          item("col2", item("2a"), item("2b")),
        ),
      { columns: cols },
    )
    board.press("l")
    expectCardBorder(board, "2a", cols)
  })

  test("full border verification: corners and all sides", () => {
    const { board } = testEnv(
      () => item("board", item("col", item("task1"))),
      { columns: 80, rows: 24 },
    )

    const box = board.screen.nodeBox("task1")
    expect(box).not.toBeNull()
    if (!box) return

    const borderLeft = box.x - 1
    const borderRight = box.x + box.width
    const borderTop = box.y - 1
    const borderBottom = box.y + box.height

    // Left and right borders on content rows
    for (let y = box.y; y < box.y + box.height; y++) {
      if (borderLeft >= 0)
        {expect(isBorderChar(board.screen.cell(borderLeft, y).char)).toBe(true)}
      if (borderRight < 80)
        {expect(isBorderChar(board.screen.cell(borderRight, y).char)).toBe(true)}
    }

    // Top corners
    if (borderTop >= 0) {
      if (borderLeft >= 0)
        {expect(isBorderChar(board.screen.cell(borderLeft, borderTop).char)).toBe(true)}
      if (borderRight < 80)
        {expect(isBorderChar(board.screen.cell(borderRight, borderTop).char)).toBe(true)}
    }

    // Bottom corners
    if (borderBottom < 24) {
      if (borderLeft >= 0)
        {expect(isBorderChar(board.screen.cell(borderLeft, borderBottom).char)).toBe(true)}
      if (borderRight < 80)
        {expect(isBorderChar(board.screen.cell(borderRight, borderBottom).char)).toBe(true)}
    }
  })
})
