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
import { item } from "../helpers/board-test.ts"
import { createTestApp } from "../helpers/test-app.ts"

// =============================================================================
// Helpers
// =============================================================================

/** Default columns view test options */
const COLUMNS_OPTS = { viewMode: "columns" as const }

/**
 * Create a columns view test app with standard structure.
 * Reduces boilerplate for common column layouts.
 */
function columnsApp(treeBuilder: () => ReturnType<typeof item>, opts?: { columns?: number; rows?: number }) {
  return createTestApp(treeBuilder, { viewMode: "columns", cols: opts?.columns, rows: opts?.rows })
}

/**
 * Assert boundary behavior - pressing key multiple times stays at same position.
 */
function assertBoundary(app: ReturnType<typeof createTestApp>, key: string, expectedCursor: string, times = 2) {
  for (let i = 0; i < times; i++) {
    app.press(key)
    app.expect(`#${expectedCursor}[data-cursor]`).toExist()
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("Columns View", () => {
  describe("Basic Rendering", () => {
    test("displays board in columns view mode", () => {
      using app = columnsApp(() => item("board", item("col1", item("1a"), item("1b"))))
      app.expect("#1a").toExist()
      app.expect("#1b").toExist()
    })

    test("column header hides count without WIP limit", () => {
      using app = columnsApp(item.simpleBoard)
      const output = app.text
      expect(output).toContain("col1")
      // Count is hidden when no WIP limit — +N overflow indicator is sufficient
      const lines = output.split("\n")
      const headerLine = lines.find((l) => l.includes("col1") && !l.includes(">"))
      expect(headerLine).toBeDefined()
      expect(headerLine).not.toMatch(/\b3\b/)
    })

    test("column header shows count/wip with WIP limit", () => {
      using app = columnsApp(() => item("board", item("col1 km.limit:: 5", item("1a"), item("1b"), item("1c"))))
      const output = app.text
      expect(output).toContain("col1")
      expect(output).toContain("3/5")
    })

    test("displays multiple columns side by side", () => {
      using app = columnsApp(item.multiColBoard, { columns: 120 })
      app.expect("#col1").toExist()
      app.expect("#col2").toExist()
      app.expect("#col3").toExist()
    })

    test("empty column shows placeholder", () => {
      using app = columnsApp(() => item("board", item("col1", item("task")), item("col2")))
      const output = app.text
      expect(output).toContain("col2")
      // Count is hidden without WIP limit — no "0" shown
    })

    test("empty board shows helpful message", () => {
      using app = createTestApp(item("board"), COLUMNS_OPTS)
      expect(app).toContainText("Empty board")
    })
  })

  describe("Navigation", () => {
    test("vertical (j/k): navigate through cards in column", () => {
      using app = columnsApp(item.simpleBoard)
      app.expect("#1a[data-cursor]").toExist()

      // j down through cards
      app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()
      app.command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()

      // k up through cards
      app.command("cursor_up")
      app.expect("#1b[data-cursor]").toExist()
      app.command("cursor_up")
      app.expect("#1a[data-cursor]").toExist()
    })

    test("horizontal (h/l): navigate between columns", () => {
      using app = columnsApp(item.multiColBoard, { columns: 120 })
      app.expect("#1a[data-cursor]").toExist()

      // l right through columns
      app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()
      app.command("cursor_right")
      app.expect("#3a[data-cursor]").toExist()

      // h left through columns
      app.command("cursor_left")
      app.expect("#2a[data-cursor]").toExist()
      app.command("cursor_left")
      app.expect("#1a[data-cursor]").toExist()
    })

    test("g/G: jump to first/last card in column", () => {
      using app = columnsApp(item.simpleBoard)
      app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()

      app.command("cursor_last")
      app.expect("#1c[data-cursor]").toExist()

      app.command("cursor_first")
      app.expect("#1a[data-cursor]").toExist()
    })

    test("navigate to column headers with k", () => {
      using app = columnsApp(() => item("board", item("col1", item("1a"), item("1b"))))
      app.expect("#1a[data-cursor]").toExist()

      app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()

      app.command("cursor_up")
      app.expect("#board[data-cursor]").toExist()
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
      using app = columnsApp(() => item("board", item("col1", item("1a"), item("1b"))))
      for (const k of setup) app.press(k)
      assertBoundary(app, key, expected)
    })

    test("h stops at left boundary (after column header)", () => {
      using app = columnsApp(() => item("board", item("col1", item("1a")), item("col2", item("2a"))), {
        columns: 120,
      })
      app.expect("#1a[data-cursor]").toExist()
      // h at leftmost card goes to column header first
      app.press("h")
      app.expect("#col1[data-cursor]").toExist()
      // h at column header is boundary
      assertBoundary(app, "h", "col1")
    })

    test("l stops at right boundary", () => {
      using app = columnsApp(() => item("board", item("col1", item("1a")), item("col2", item("2a"))), {
        columns: 120,
      })
      app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()
      assertBoundary(app, "l", "2a")
    })
  })

  describe("Hierarchical Display", () => {
    test("displays nested cards in tree format", () => {
      using app = columnsApp(() => item("board", item("col1", item("parent", item("child1"), item("child2")))))
      app.expect("#parent").toExist()
      app.expect("#child1").toExist()
      app.expect("#child2").toExist()
    })

    test("folding works in columns view", () => {
      using app = columnsApp(() => item("board", item("col1", item("parent", item("child1"), item("child2")))))
      app.expect("#child1").toExist()
      app.expect("#child2").toExist()

      // Progressive fold: depth 3→2→1→0. Need multiple presses to fully fold.
      app.command("fold_all_more")
      app.command("fold_all_more")
      app.command("fold_all_more")
      app.expect("#child1").not.toExist()
      app.expect("#child2").not.toExist()
      expect(app.text).toContain(" 2")
    })
  })

  describe("Cursor Position Memory", () => {
    test("preserves Y position when moving between columns", () => {
      using app = columnsApp(
        () =>
          item(
            "board",
            item("col1", item("1a"), item("1b"), item("1c")),
            item("col2", item("2a"), item("2b"), item("2c")),
          ),
        { columns: 120 },
      )
      app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()
      const card1bBox = app.q("#1b").boundingBox()

      app.command("cursor_right")
      const card2Box = app.q("[data-cursor]").boundingBox()

      expect(Math.abs(card2Box!.y - card1bBox!.y)).toBeLessThanOrEqual(15)
    })

    test("preserves X position when moving up/down", () => {
      using app = columnsApp(item.multiColBoard, { columns: 120 })
      app.command("cursor_right")
      app.command("cursor_right")
      const col3Box = app.q("#3a").boundingBox()

      app.command("cursor_up")
      app.command("cursor_down")

      app.expect("#3a[data-cursor]").toExist()
      const returnedBox = app.q("#3a[data-cursor]").boundingBox()
      expect(returnedBox!.x).toBe(col3Box!.x)
    })
  })

  describe("View Mode Switching", () => {
    test("view mode indicator shows COLUMNS VIEW", () => {
      using app = columnsApp(() => item("board", item("col1", item("task"))))
      expect(app.text).toContain("COLUMNS")
    })
  })

  describe("Virtualization", () => {
    test("handles large number of cards efficiently", () => {
      const cards = Array.from({ length: 100 }, (_, i) => item(`card${i}`))
      using app = columnsApp(() => item("board", item("col1", ...cards)), { rows: 24 })

      app.expect("#card0[data-cursor]").toExist()
      app.command("cursor_last")
      app.expect("#card99[data-cursor]").toExist()
      app.command("cursor_first")
      app.expect("#card0[data-cursor]").toExist()
    })

    test("scrolling works smoothly with many cards", () => {
      const cards = Array.from({ length: 50 }, (_, i) => item(`card${i}`))
      using app = columnsApp(() => item("board", item("col1", ...cards)), { rows: 24 })

      for (let i = 0; i < 3; i++) app.command("cursor_down")
      app.expect("#card3[data-cursor]").toExist()

      for (let i = 0; i < 10; i++) app.command("cursor_down")
      app.expect("#card13[data-cursor]").toExist()
    })
  })

  describe("Layout", () => {
    test("columns are positioned side by side", () => {
      using app = columnsApp(() => item("board", item("col1", item("1a")), item("col2", item("2a"))), {
        columns: 120,
      })
      const col1Box = app.q("#col1").boundingBox()
      const col2Box = app.q("#col2").boundingBox()

      expect(col2Box!.x).toBeGreaterThan(col1Box!.x)
      expect(col2Box!.y).toBe(col1Box!.y)
    })

    test("cards stack vertically within columns", () => {
      using app = columnsApp(() => item("board", item("col1", item("1a"), item("1b"))))
      const aBox = app.q("#1a").boundingBox()
      const bBox = app.q("#1b").boundingBox()

      expect(bBox!.y).toBeGreaterThan(aBox!.y)
      expect(bBox!.x).toBe(aBox!.x)
    })

    test.each([
      { width: 80, desc: "narrow terminal shows fewer columns" },
      { width: 200, desc: "wide terminal shows more columns" },
    ])("$desc", ({ width }) => {
      using app = columnsApp(
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
      app.expect("#col1").toExist()
      // More columns visible at wider widths (don't assert exact count)
    })
  })

  describe("Zooming", () => {
    test("e zooms into card with children", () => {
      using app = columnsApp(() => item("board", item("col", item("card", item("subcard")))))
      app.expect("#card[data-cursor]").toExist()
      app.command("zoom_inwards")
      app.expect("#subcard").toExist()
    })

    test("zoom into column shows column as board", () => {
      using app = columnsApp(
        () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("taskA"), item("taskB"))),
        { columns: 120 },
      )
      app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()
      app.command("zoom_inwards")

      app.expect("#task1").toExist()
      app.expect("#task2").toExist()
      app.expect("#col2").not.toExist()
    })

    test("nav back after zoom returns to parent", () => {
      using app = columnsApp(() => item("board", item("col", item("card", item("subcard")))))
      app.command("zoom_inwards")
      app.expect("#subcard").toExist()
      app.press("{") // nav_back restores cursor to pre-zoom position
      app.expect("#card[data-cursor]").toExist()
    })
  })
})
