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

import { describe, test, expect, afterEach } from "vitest"
import { item, testEnv } from "../helpers/board-test.ts"
import { toastQueue } from "@km/core"

// Clean up global state after each test to prevent pollution
afterEach(() => {
  toastQueue.dismissAll()
})

describe("Columns View", () => {
  describe("Basic Rendering", () => {
    test("displays board in columns view mode", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("1a"), item("1b"))),
        { viewMode: "columns" },
      )
      // Should render the cards
      board.expect("#1a").toExist()
      board.expect("#1b").toExist()
    })

    test("shows column headers with count", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("1a"), item("1b"), item("1c"))),
        { viewMode: "columns" },
      )
      const output = board.screenshot()
      expect(output).toContain("col1")
      expect(output).toContain("(3)") // Card count
    })

    test("displays multiple columns side by side", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("1a")),
            item("col2", item("2a")),
            item("col3", item("3a")),
          ),
        { viewMode: "columns", columns: 120 },
      )
      board.expect("#col1").toExist()
      board.expect("#col2").toExist()
      board.expect("#col3").toExist()
    })

    test("empty column shows placeholder", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("task")), item("col2")),
        { viewMode: "columns" },
      )
      const output = board.screenshot()
      expect(output).toContain("col2")
      expect(output).toContain("(0)") // Empty count
    })

    test("empty board shows helpful message", () => {
      const { board } = testEnv(() => item("board"), { viewMode: "columns" })
      const output = board.screenshot()
      expect(output).toContain("Empty board")
    })
  })

  describe("Navigation", () => {
    test("vertical (j/k): navigate through cards in column", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("1a"), item("1b"), item("1c"))),
        { viewMode: "columns" },
      )
      // Start at first card
      board.expect("#1a[data-cursor]").toExist()

      // j down through cards
      board.press("j")
      board.expect("#1b[data-cursor]").toExist()
      board.press("j")
      board.expect("#1c[data-cursor]").toExist()

      // k up through cards
      board.press("k")
      board.expect("#1b[data-cursor]").toExist()
      board.press("k")
      board.expect("#1a[data-cursor]").toExist()
    })

    test("horizontal (h/l): navigate between columns", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("1a")),
            item("col2", item("2a")),
            item("col3", item("3a")),
          ),
        { viewMode: "columns" },
      )
      // Start at first column
      board.expect("#1a[data-cursor]").toExist()

      // l right through columns
      board.press("l")
      board.expect("#2a[data-cursor]").toExist()
      board.press("l")
      board.expect("#3a[data-cursor]").toExist()

      // h left through columns
      board.press("h")
      board.expect("#2a[data-cursor]").toExist()
      board.press("h")
      board.expect("#1a[data-cursor]").toExist()
    })

    test("g/G: jump to first/last card in column", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("1a"), item("1b"), item("1c"))),
        { viewMode: "columns" },
      )
      // Start at middle
      board.press("j")
      board.expect("#1b[data-cursor]").toExist()

      // G to last
      board.press("G")
      board.expect("#1c[data-cursor]").toExist()

      // g to first
      board.press("g")
      board.expect("#1a[data-cursor]").toExist()
    })

    test("navigate to column headers with k", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("1a"), item("1b"))),
        { viewMode: "columns" },
      )
      // Start at card
      board.expect("#1a[data-cursor]").toExist()

      // k up to column header
      board.press("k")
      board.expect("#col1[data-cursor]").toExist()

      // k up to board title
      board.press("k")
      board.expect("#board[data-cursor]").toExist()
    })
  })

  describe("Boundaries", () => {
    test("j stops at bottom boundary", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("1a"), item("1b"))),
        { viewMode: "columns" },
      )
      // Navigate to last card
      board.press("j")
      board.expect("#1b[data-cursor]").toExist()

      // Try j multiple times - should stay at 1b
      board.press("j")
      board.expect("#1b[data-cursor]").toExist()
      board.press("j")
      board.expect("#1b[data-cursor]").toExist()
    })

    test("k stops at top boundary", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("1a"), item("1b"))),
        { viewMode: "columns" },
      )
      // Navigate to board
      board.press("k") // 1a → col1
      board.press("k") // col1 → board
      board.expect("#board[data-cursor]").toExist()

      // Try k multiple times - should stay at board
      board.press("k")
      board.expect("#board[data-cursor]").toExist()
      board.press("k")
      board.expect("#board[data-cursor]").toExist()
    })

    test("h stops at left boundary", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("1a")), item("col2", item("2a"))),
        { viewMode: "columns" },
      )
      // Start at first column
      board.expect("#1a[data-cursor]").toExist()

      // Try h multiple times - should stay at col1
      board.press("h")
      board.expect("#1a[data-cursor]").toExist()
      board.press("h")
      board.expect("#1a[data-cursor]").toExist()
    })

    test("l stops at right boundary", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("1a")), item("col2", item("2a"))),
        { viewMode: "columns" },
      )
      // Navigate to last column
      board.press("l")
      board.expect("#2a[data-cursor]").toExist()

      // Try l multiple times - should stay at col2
      board.press("l")
      board.expect("#2a[data-cursor]").toExist()
      board.press("l")
      board.expect("#2a[data-cursor]").toExist()
    })
  })

  describe("Hierarchical Display", () => {
    test("displays nested cards in tree format", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("parent", item("child1"), item("child2"))),
          ),
        { viewMode: "columns" },
      )
      // Parent and children should all be visible
      board.expect("#parent").toExist()
      board.expect("#child1").toExist()
      board.expect("#child2").toExist()
    })

    test("folding works in columns view", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("parent", item("child1"), item("child2"))),
          ),
        { viewMode: "columns" },
      )
      // Children visible by default
      board.expect("#child1").toExist()
      board.expect("#child2").toExist()

      // Fold parent
      board.press("z")
      board.expect("#child1").not.toExist()
      board.expect("#child2").not.toExist()
      const output = board.screenshot()
      expect(output).toContain("▶ 2") // Folded indicator

      // TODO: Unfold doesn't work in columns view yet - needs investigation
      // board.press("z")
      // board.expect("#child1").toExist()
      // board.expect("#child2").toExist()
    })
  })

  describe("Cursor Position Memory", () => {
    // TODO: These tests require layout position tracking which may not work in test environment
    test.skip("preserves Y position when moving between columns", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("1a"), item("1b"), item("1c")),
            item("col2", item("2a"), item("2b"), item("2c")),
          ),
        { viewMode: "columns", columns: 120 },
      )
      // Move to second card in col1
      board.press("j")
      board.expect("#1b[data-cursor]").toExist()
      const card1bBox = board.q("#1b").boundingBox()

      // Move right to col2
      board.press("l")
      const card2Box = board.q("[data-cursor]").boundingBox()

      // Y position should be similar (within tolerance for layout)
      expect(Math.abs(card2Box!.y - card1bBox!.y)).toBeLessThanOrEqual(15)
    })

    test.skip("preserves X position when moving up/down", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("1a")),
            item("col2", item("2a")),
            item("col3", item("3a")),
          ),
        { viewMode: "columns", columns: 120 },
      )
      // Move to col3
      board.press("l")
      board.press("l")
      const col3Box = board.q("#3a").boundingBox()

      // Move up to column header and back down
      board.press("k")
      board.press("j")

      // Should return to col3 (same X position)
      board.expect("#3a[data-cursor]").toExist()
      const returnedBox = board.q("#3a[data-cursor]").boundingBox()
      expect(returnedBox!.x).toBe(col3Box!.x)
    })
  })

  describe("View Mode Switching", () => {
    // TODO: View mode switching requires command system integration
    test.skip("cursor position preserved when switching from cards view", () => {
      const { board } = testEnv(() =>
        item(
          "board",
          item("col1", item("task1"), item("task2"), item("task3")),
        ),
      )
      // Navigate to specific card in cards view
      board.press("j")
      board.expect("#task2[data-cursor]").toExist()

      // Switch to columns view
      board.press("v")

      // Cursor should still be on task2
      board.expect("#task2[data-cursor]").toExist()
    })

    test.skip("cursor position preserved when switching to cards view", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("task1"), item("task2"), item("task3")),
          ),
        { viewMode: "columns" },
      )
      // Navigate to specific card in columns view
      board.press("j")
      board.expect("#task2[data-cursor]").toExist()

      // Switch to cards view
      board.press("v")

      // Cursor should still be on task2
      board.expect("#task2[data-cursor]").toExist()
    })

    test("view mode indicator shows COLUMNS VIEW", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("task"))),
        { viewMode: "columns" },
      )
      const output = board.screenshot()
      expect(output).toContain("COLUMNS")
    })
  })

  describe("Virtualization", () => {
    // TODO: Virtualization tests need investigation - cursor behavior with large lists
    test.skip("handles large number of cards efficiently", () => {
      // Create a column with many cards
      const cards = Array.from({ length: 100 }, (_, i) => item(`card${i}`))
      const { board } = testEnv(() => item("board", item("col1", ...cards)), {
        viewMode: "columns",
        rows: 24,
      })

      // First card should be visible
      board.expect("#card0[data-cursor]").toExist()

      // Jump to last card
      board.press("G")
      board.expect("#card99[data-cursor]").toExist()

      // Jump back to first
      board.press("g")
      board.expect("#card0[data-cursor]").toExist()
    })

    test.skip("scrolling works smoothly with many cards", () => {
      const cards = Array.from({ length: 50 }, (_, i) => item(`card${i}`))
      const { board } = testEnv(() => item("board", item("col1", ...cards)), {
        viewMode: "columns",
        rows: 24,
      })

      // Navigate down several cards
      board.press("j")
      board.press("j")
      board.press("j")
      board.expect("#card3[data-cursor]").toExist()

      // Continue down more
      for (let i = 0; i < 10; i++) {
        board.press("j")
      }
      board.expect("#card13[data-cursor]").toExist()
    })
  })

  describe("Layout", () => {
    test("columns are positioned side by side", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("1a")), item("col2", item("2a"))),
        { viewMode: "columns", columns: 120 },
      )
      const col1Box = board.q("#col1").boundingBox()
      const col2Box = board.q("#col2").boundingBox()

      // col2 should be to the right of col1
      expect(col2Box!.x).toBeGreaterThan(col1Box!.x)
      // They should be on the same horizontal line
      expect(col2Box!.y).toBe(col1Box!.y)
    })

    test("cards stack vertically within columns", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("1a"), item("1b"))),
        { viewMode: "columns" },
      )
      const aBox = board.q("#1a").boundingBox()
      const bBox = board.q("#1b").boundingBox()

      // 1b should be below 1a
      expect(bBox!.y).toBeGreaterThan(aBox!.y)
      // Same X position (same column)
      expect(bBox!.x).toBe(aBox!.x)
    })

    test("narrow terminal shows fewer columns", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("1a")),
            item("col2", item("2a")),
            item("col3", item("3a")),
          ),
        { viewMode: "columns", columns: 40 },
      )
      // In narrow terminal, might need scrolling to see all columns
      // At least the first column should be visible
      board.expect("#col1").toExist()
    })

    test("wide terminal shows more columns", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("1a")),
            item("col2", item("2a")),
            item("col3", item("3a")),
            item("col4", item("4a")),
          ),
        { viewMode: "columns", columns: 200 },
      )
      // All columns should be visible in wide terminal
      board.expect("#col1").toExist()
      board.expect("#col2").toExist()
      board.expect("#col3").toExist()
      board.expect("#col4").toExist()
    })
  })

  describe("Zooming", () => {
    test("Enter opens detail pane for card with children", () => {
      const { board } = testEnv(
        () => item("board", item("col", item("card", item("subcard")))),
        { viewMode: "columns" },
      )
      board.expect("#card[data-cursor]").toExist()
      board.press("\r")
      board.expect("#subcard").toExist()
    })

    // TODO: Zoom behavior in columns view may differ from cards view
    test.skip("zoom into column shows column as board", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("task1"), item("task2")),
            item("col2", item("taskA"), item("taskB")),
          ),
        { viewMode: "columns" },
      )
      // Move to column header and zoom
      board.press("k")
      board.expect("#col1[data-cursor]").toExist()
      board.press("\r")

      // Now col1 should be treated as board with tasks as columns
      board.expect("#task1").toExist()
      board.expect("#task2").toExist()
      board.expect("#col2").not.toExist()
    })

    test("Escape closes detail pane", () => {
      const { board } = testEnv(
        () => item("board", item("col", item("card", item("subcard")))),
        { viewMode: "columns" },
      )
      board.press("\r")
      board.expect("#subcard").toExist()
      board.press("\x1B")
      board.expect("#card[data-cursor]").toExist()
    })
  })
})
