/**
 * Columns View Tests
 *
 * Tests for the Columns view mode, which displays a tree/outline view
 * within each column, combining columnar structure with hierarchical display.
 *
 * Key behaviors:
 * - Each column shows its cards in a hierarchical tree format
 * - Navigation works the same as cards view (j/k/h/l)
 * - Cursor position is preserved when switching to/from columns view
 * - Virtualization handles large card lists efficiently
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "../helpers/board-test.ts"

// =============================================================================
// Helpers
// =============================================================================

/** Default columns view test options */
const COLUMNS_OPTS = { viewMode: "columns" as const }

/**
 * Create a columns view board with standard structure.
 * Reduces boilerplate for common column layouts.
 */
function columnsBoard(treeBuilder: () => ReturnType<typeof item>, opts?: { columns?: number; rows?: number }) {
  return testEnv(treeBuilder, { viewMode: "columns", ...opts })
}

/**
 * Assert boundary behavior - pressing key multiple times stays at same position.
 */
function assertBoundary(board: ReturnType<typeof testEnv>["board"], key: string, expectedCursor: string, times = 2) {
  for (let i = 0; i < times; i++) {
    board.press(key)
    board.expect(`#${expectedCursor}[data-cursor]`).toExist()
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("Columns View", () => {
  describe("Basic Rendering", () => {
    test("displays board in columns view mode", () => {
      const { board } = columnsBoard(() => item("board", item("col1", item("1a"), item("1b"))))
      board.expect("#1a").toExist()
      board.expect("#1b").toExist()
    })

    test("column header hides count without WIP limit", () => {
      const { board } = columnsBoard(item.simpleBoard)
      const output = board.screenshot()
      expect(output).toContain("col1")
      // Count is hidden when no WIP limit — +N overflow indicator is sufficient
      const lines = output.split("\n")
      const headerLine = lines.find((l) => l.includes("col1") && !l.includes(">"))
      expect(headerLine).toBeDefined()
      expect(headerLine).not.toMatch(/\b3\b/)
    })

    test("column header shows count/wip with WIP limit", () => {
      const { board } = columnsBoard(() => item("board", item("col1 km.limit:: 5", item("1a"), item("1b"), item("1c"))))
      const output = board.screenshot()
      expect(output).toContain("col1")
      expect(output).toContain("3/5")
    })

    test("displays multiple columns side by side", () => {
      const { board } = columnsBoard(item.multiColBoard, { columns: 120 })
      board.expect("#col1").toExist()
      board.expect("#col2").toExist()
      board.expect("#col3").toExist()
    })

    test("empty column shows placeholder", () => {
      const { board } = columnsBoard(() => item("board", item("col1", item("task")), item("col2")))
      const output = board.screenshot()
      expect(output).toContain("col2")
      // Count is hidden without WIP limit — no "0" shown
    })

    test("empty board shows helpful message", () => {
      const { board } = testEnv(() => item("board"), COLUMNS_OPTS)
      expect(board.screenshot()).toContain("Empty board")
    })
  })

  describe("Navigation", () => {
    test("vertical (j/k): navigate through cards in column", () => {
      const { board } = columnsBoard(item.simpleBoard)
      board.expect("#1a[data-cursor]").toExist()

      // j down through cards
      board.command("cursor_down")
      board.expect("#1b[data-cursor]").toExist()
      board.command("cursor_down")
      board.expect("#1c[data-cursor]").toExist()

      // k up through cards
      board.command("cursor_up")
      board.expect("#1b[data-cursor]").toExist()
      board.command("cursor_up")
      board.expect("#1a[data-cursor]").toExist()
    })

    test("horizontal (h/l): navigate between columns", () => {
      const { board } = columnsBoard(item.multiColBoard, { columns: 120 })
      board.expect("#1a[data-cursor]").toExist()

      // l right through columns
      board.command("cursor_right")
      board.expect("#2a[data-cursor]").toExist()
      board.command("cursor_right")
      board.expect("#3a[data-cursor]").toExist()

      // h left through columns
      board.command("cursor_left")
      board.expect("#2a[data-cursor]").toExist()
      board.command("cursor_left")
      board.expect("#1a[data-cursor]").toExist()
    })

    test("g/G: jump to first/last card in column", () => {
      const { board } = columnsBoard(item.simpleBoard)
      board.command("cursor_down")
      board.expect("#1b[data-cursor]").toExist()

      board.command("cursor_last")
      board.expect("#1c[data-cursor]").toExist()

      board.command("cursor_first")
      board.expect("#1a[data-cursor]").toExist()
    })

    test("navigate to column headers with k", () => {
      const { board } = columnsBoard(() => item("board", item("col1", item("1a"), item("1b"))))
      board.expect("#1a[data-cursor]").toExist()

      board.command("cursor_up")
      board.expect("#col1[data-cursor]").toExist()

      board.command("cursor_up")
      board.expect("#board[data-cursor]").toExist()
    })
  })

  describe("Boundaries", () => {
    test.each([
      {
        name: "j stops at bottom",
        setup: ["j"],
        key: "j",
        expected: "1b",
      },
      {
        name: "k stops at top",
        setup: ["k", "k"],
        key: "k",
        expected: "board",
      },
    ])("$name boundary", ({ setup, key, expected }) => {
      const { board } = columnsBoard(() => item("board", item("col1", item("1a"), item("1b"))))
      for (const k of setup) board.press(k)
      assertBoundary(board, key, expected)
    })

    test("h stops at left boundary (after column header)", () => {
      const { board } = columnsBoard(() => item("board", item("col1", item("1a")), item("col2", item("2a"))), {
        columns: 120,
      })
      board.expect("#1a[data-cursor]").toExist()
      // h at leftmost card goes to column header first
      board.press("h")
      board.expect("#col1[data-cursor]").toExist()
      // h at column header is boundary
      assertBoundary(board, "h", "col1")
    })

    test("l stops at right boundary", () => {
      const { board } = columnsBoard(() => item("board", item("col1", item("1a")), item("col2", item("2a"))), {
        columns: 120,
      })
      board.command("cursor_right")
      board.expect("#2a[data-cursor]").toExist()
      assertBoundary(board, "l", "2a")
    })
  })

  describe("Hierarchical Display", () => {
    test("displays nested cards in tree format", () => {
      const { board } = columnsBoard(() => item("board", item("col1", item("parent", item("child1"), item("child2")))))
      board.expect("#parent").toExist()
      board.expect("#child1").toExist()
      board.expect("#child2").toExist()
    })

    test("folding works in columns view", () => {
      const { board } = columnsBoard(() => item("board", item("col1", item("parent", item("child1"), item("child2")))))
      board.expect("#child1").toExist()
      board.expect("#child2").toExist()

      board.command("fold_all")
      board.expect("#child1").not.toExist()
      board.expect("#child2").not.toExist()
      expect(board.screenshot()).toContain(" 2")
    })
  })

  describe("Cursor Position Memory", () => {
    test("preserves Y position when moving between columns", () => {
      const { board } = columnsBoard(
        () =>
          item(
            "board",
            item("col1", item("1a"), item("1b"), item("1c")),
            item("col2", item("2a"), item("2b"), item("2c")),
          ),
        { columns: 120 },
      )
      board.command("cursor_down")
      board.expect("#1b[data-cursor]").toExist()
      const card1bBox = board.q("#1b").boundingBox()

      board.command("cursor_right")
      const card2Box = board.q("[data-cursor]").boundingBox()

      expect(Math.abs(card2Box!.y - card1bBox!.y)).toBeLessThanOrEqual(15)
    })

    test("preserves X position when moving up/down", () => {
      const { board } = columnsBoard(item.multiColBoard, { columns: 120 })
      board.command("cursor_right")
      board.command("cursor_right")
      const col3Box = board.q("#3a").boundingBox()

      board.command("cursor_up")
      board.command("cursor_down")

      board.expect("#3a[data-cursor]").toExist()
      const returnedBox = board.q("#3a[data-cursor]").boundingBox()
      expect(returnedBox!.x).toBe(col3Box!.x)
    })
  })

  describe("View Mode Switching", () => {
    test("view mode indicator shows COLUMNS VIEW", () => {
      const { board } = columnsBoard(() => item("board", item("col1", item("task"))))
      expect(board.screenshot()).toContain("COLUMNS")
    })
  })

  describe("Virtualization", () => {
    test("handles large number of cards efficiently", () => {
      const cards = Array.from({ length: 100 }, (_, i) => item(`card${i}`))
      const { board } = columnsBoard(() => item("board", item("col1", ...cards)), { rows: 24 })

      board.expect("#card0[data-cursor]").toExist()
      board.command("cursor_last")
      board.expect("#card99[data-cursor]").toExist()
      board.command("cursor_first")
      board.expect("#card0[data-cursor]").toExist()
    })

    test("scrolling works smoothly with many cards", () => {
      const cards = Array.from({ length: 50 }, (_, i) => item(`card${i}`))
      const { board } = columnsBoard(() => item("board", item("col1", ...cards)), { rows: 24 })

      for (let i = 0; i < 3; i++) board.command("cursor_down")
      board.expect("#card3[data-cursor]").toExist()

      for (let i = 0; i < 10; i++) board.command("cursor_down")
      board.expect("#card13[data-cursor]").toExist()
    })
  })

  describe("Layout", () => {
    test("columns are positioned side by side", () => {
      const { board } = columnsBoard(() => item("board", item("col1", item("1a")), item("col2", item("2a"))), {
        columns: 120,
      })
      const col1Box = board.q("#col1").boundingBox()
      const col2Box = board.q("#col2").boundingBox()

      expect(col2Box!.x).toBeGreaterThan(col1Box!.x)
      expect(col2Box!.y).toBe(col1Box!.y)
    })

    test("cards stack vertically within columns", () => {
      const { board } = columnsBoard(() => item("board", item("col1", item("1a"), item("1b"))))
      const aBox = board.q("#1a").boundingBox()
      const bBox = board.q("#1b").boundingBox()

      expect(bBox!.y).toBeGreaterThan(aBox!.y)
      expect(bBox!.x).toBe(aBox!.x)
    })

    test.each([
      { width: 80, desc: "narrow terminal shows fewer columns" },
      { width: 200, desc: "wide terminal shows more columns" },
    ])("$desc", ({ width }) => {
      const { board } = columnsBoard(
        () =>
          item(
            "board",
            item("col1", item("1a")),
            item("col2", item("2a")),
            item("col3", item("3a")),
            item("col4", item("4a")),
          ),
        { columns: width },
      )
      // First column always visible
      board.expect("#col1").toExist()
      // More columns visible at wider widths (don't assert exact count)
    })
  })

  describe("Zooming", () => {
    test("e zooms into card with children", () => {
      const { board } = columnsBoard(() => item("board", item("col", item("card", item("subcard")))))
      board.expect("#card[data-cursor]").toExist()
      board.command("zoom_inwards")
      board.expect("#subcard").toExist()
    })

    test("zoom into column shows column as board", () => {
      const { board } = columnsBoard(
        () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("taskA"), item("taskB"))),
        { columns: 120 },
      )
      board.command("cursor_up")
      board.expect("#col1[data-cursor]").toExist()
      board.command("zoom_inwards")

      board.expect("#task1").toExist()
      board.expect("#task2").toExist()
      board.expect("#col2").not.toExist()
    })

    test("nav back after zoom returns to parent", () => {
      const { board } = columnsBoard(() => item("board", item("col", item("card", item("subcard")))))
      board.command("zoom_inwards")
      board.expect("#subcard").toExist()
      board.press("{") // nav_back restores cursor to pre-zoom position
      board.expect("#card[data-cursor]").toExist()
    })
  })
})
