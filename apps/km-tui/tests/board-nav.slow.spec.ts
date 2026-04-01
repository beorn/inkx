/**
 * Board Navigation Tests - Cursoring, Boundaries, Bell Feedback
 *
 * Split from board.spec.ts for parallel execution.
 * See board.spec.ts header comment for testing philosophy.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Cursoring", () => {
  // Default view mode tests (cards view)
  describe("Cards View", () => {
    test("vertical (j/k): cards → column → board → boundary", () => {
      const { board } = testEnv(item.simpleBoard)
      // j down through cards
      board.expect("#1a[data-cursor]").toExist()
      board.command("cursor_down")
      board.expect("#1b[data-cursor]").toExist()
      board.command("cursor_down")
      board.expect("#1c[data-cursor]").toExist()

      // j at bottom stops (boundary)
      board.command("cursor_down")
      board.expect("#1c[data-cursor]").toExist()
      board.command("cursor_down")
      board.expect("#1c[data-cursor]").toExist()

      // k up through cards → column → board → boundary
      board.command("cursor_up")
      board.expect("#1b[data-cursor]").toExist()
      board.command("cursor_up")
      board.expect("#1a[data-cursor]").toExist()
      board.command("cursor_up")
      board.expect("#col1[data-cursor]").toExist()
      board.command("cursor_up")
      board.expect("#board[data-cursor]").toExist()

      // k at top stops (boundary)
      board.command("cursor_up")
      board.expect("#board[data-cursor]").toExist()
      board.command("cursor_up")
      board.expect("#board[data-cursor]").toExist()

      // j back down: board → column → card
      board.command("cursor_down")
      board.expect("#col1[data-cursor]").toExist()
      board.command("cursor_down")
      board.expect("#1a[data-cursor]").toExist()
    })

    test("horizontal (h/l): columns at card level and header level → boundary", () => {
      const { board } = testEnv(item.multiColBoard)

      // --- Card level ---
      // l right through columns
      board.expect("#1a[data-cursor]").toExist()
      board.command("cursor_right")
      board.expect("#2a[data-cursor]").toExist()
      board.command("cursor_right")
      board.expect("#3a[data-cursor]").toExist()

      // l at right boundary stops
      board.command("cursor_right")
      board.expect("#3a[data-cursor]").toExist()
      board.command("cursor_right")
      board.expect("#3a[data-cursor]").toExist()

      // h back left through columns
      board.command("cursor_left")
      board.expect("#2a[data-cursor]").toExist()
      board.command("cursor_left")
      board.expect("#1a[data-cursor]").toExist()

      // h at left boundary stops
      board.command("cursor_left")
      board.expect("#1a[data-cursor]").toExist()
      board.command("cursor_left")
      board.expect("#1a[data-cursor]").toExist()

      // --- Header level ---
      // Go to column headers
      board.command("cursor_up")
      board.expect("#col1[data-cursor]").toExist()

      // l right through headers
      board.command("cursor_right")
      board.expect("#col2[data-cursor]").toExist()
      board.command("cursor_right")
      board.expect("#col3[data-cursor]").toExist()

      // l at right boundary stops
      board.command("cursor_right")
      board.expect("#col3[data-cursor]").toExist()
      board.command("cursor_right")
      board.expect("#col3[data-cursor]").toExist()

      // h back left through headers
      board.command("cursor_left")
      board.expect("#col2[data-cursor]").toExist()
      board.command("cursor_left")
      board.expect("#col1[data-cursor]").toExist()

      // h at left boundary stops
      board.command("cursor_left")
      board.expect("#col1[data-cursor]").toExist()
      board.command("cursor_left")
      board.expect("#col1[data-cursor]").toExist()
    })

    test("g/G: jump to first/last in column", () => {
      const { board } = testEnv(item.simpleBoard)
      // Start at middle
      board.command("cursor_down")
      board.expect("#1b[data-cursor]").toExist()

      // g G to last
      board.command("cursor_last")
      board.expect("#1c[data-cursor]").toExist()

      // g G at last does nothing
      board.command("cursor_last")
      board.expect("#1c[data-cursor]").toExist()

      // g to first
      board.command("cursor_first")
      board.expect("#1a[data-cursor]").toExist()

      // g at first does nothing
      board.command("cursor_first")
      board.expect("#1a[data-cursor]").toExist()
    })

    describe("curswantX (horizontal position memory)", () => {
      test("remembers column when moving through headers", () => {
        const { board } = testEnv(() =>
          item(
            "board",
            item("col1", item("1a"), item("1b")),
            item("col2", item("2a"), item("2b")),
            item("col3", item("3a"), item("3b")),
          ),
        )
        // Start at card in col3
        board.command("cursor_right")
        board.command("cursor_right")
        board.expect("#3a[data-cursor]").toExist()

        // Move up to col3 header, then board title
        board.command("cursor_up")
        board.expect("#col3[data-cursor]").toExist()
        board.command("cursor_up")
        board.expect("#board[data-cursor]").toExist()

        // Move back down - should go to col3 header (curswantX preserved)
        board.command("cursor_down")
        board.expect("#col3[data-cursor]").toExist()

        // Continue down - should go to first card in col3
        board.command("cursor_down")
        board.expect("#3a[data-cursor]").toExist()
      })

      test("preserves column when jumping between first/last card", () => {
        const { board } = testEnv(() =>
          item(
            "board",
            item("col1", item("1a"), item("1b"), item("1c")),
            item("col2", item("2a"), item("2b"), item("2c")),
          ),
        )
        // Move to col2
        board.command("cursor_right")
        board.expect("#2a[data-cursor]").toExist()

        // Jump to last card in column
        board.command("cursor_last")
        board.expect("#2c[data-cursor]").toExist()

        // Jump back to first - should stay in col2
        board.command("cursor_first")
        board.expect("#2a[data-cursor]").toExist()
      })

      test("remembers X position in columns view", () => {
        const { board } = testEnv(
          () => item("board", item("col1", item("task")), item("col2", item("task")), item("col3", item("task"))),
          { columns: 120 }, // Wide terminal for side-by-side columns
        )
        // Move to col3 header
        board.command("cursor_right")
        board.command("cursor_right")
        const col3Box = board.q("#col3").boundingBox()

        // Move up to board title and back down
        board.command("cursor_up")
        board.command("cursor_down")

        // Should return to col3 (same X position)
        board.expect("#col3[data-cursor]").toExist()
        const returnedBox = board.q("#col3[data-cursor]").boundingBox()
        expect(returnedBox!.x).toBe(col3Box!.x)
      })
    })

    describe("curswantY (vertical position memory)", () => {
      test("remembers card position when moving between columns", () => {
        const { board } = testEnv(() =>
          item(
            "board",
            item("col1", item("1a"), item("1b"), item("1c"), item("1d")),
            item("col2", item("2a"), item("2b"), item("2c")),
            item("col3", item("3a"), item("3b"), item("3c"), item("3d")),
          ),
        )
        // Move to third card in col1
        board.command("cursor_down")
        board.command("cursor_down")
        board.expect("#1c[data-cursor]").toExist()
        const card1cBox = board.q("#1c").boundingBox()

        // Move right to col2 - should go to card at similar Y position
        board.command("cursor_right")
        const card2Box = board.q("[data-cursor]").boundingBox()
        // Y position should be close (within ~1 card height tolerance)
        // Using 15 to account for minor layout variations
        expect(Math.abs(card2Box!.y - card1cBox!.y)).toBeLessThanOrEqual(15)

        // Move right to col3 - should maintain Y position
        board.command("cursor_right")
        const card3Box = board.q("[data-cursor]").boundingBox()
        expect(Math.abs(card3Box!.y - card1cBox!.y)).toBeLessThanOrEqual(15)

        // Move back left - should return to similar Y position
        board.command("cursor_left")
        board.command("cursor_left")
        const returnedBox = board.q("[data-cursor]").boundingBox()
        expect(Math.abs(returnedBox!.y - card1cBox!.y)).toBeLessThanOrEqual(15)
      })

      test("adjusts Y position when target column is shorter", () => {
        const { board } = testEnv(() =>
          item(
            "board",
            item("col1", item("1a"), item("1b"), item("1c"), item("1d")),
            item("col2", item("2a")), // Only one card
            item("col3", item("3a"), item("3b"), item("3c")),
          ),
        )
        // Move to last card in col1
        board.command("cursor_last")
        board.expect("#1d[data-cursor]").toExist()

        // Move right to col2 (shorter column) - should clamp to last card
        board.command("cursor_right")
        board.expect("#2a[data-cursor]").toExist()

        // Move right to col3 - should go to last card (curswantY preserved)
        board.command("cursor_right")
        board.expect("#3c[data-cursor]").toExist()
      })

      test("maintains Y position in columns view", () => {
        const { board } = testEnv(
          () =>
            item(
              "board",
              item("col1", item("task1"), item("task2"), item("task3")),
              item("col2", item("taskA"), item("taskB"), item("taskC")),
            ),
          { columns: 120 },
        )
        // Move down to second card
        board.command("cursor_down")
        const card2Box = board.q("[data-cursor]").boundingBox()

        // Move right to col2
        board.command("cursor_right")
        const col2Box = board.q("[data-cursor]").boundingBox()

        // Y position should be preserved (within tolerance)
        expect(Math.abs(col2Box!.y - card2Box!.y)).toBeLessThan(10)
      })
    })
  }) // End Cards View

  // View mode variations
  describe("List View", () => {
    test("vertical (j/k) navigation and g/G jump to first/last", () => {
      const { board } = testEnv(item.simpleBoard, {
        viewMode: "list",
      })

      // --- j/k navigation ---
      // j down through cards
      board.expect("#1a[data-cursor]").toExist()
      board.command("cursor_down")
      board.expect("#1b[data-cursor]").toExist()
      board.command("cursor_down")
      board.expect("#1c[data-cursor]").toExist()

      // j at bottom stops (boundary)
      board.command("cursor_down")
      board.expect("#1c[data-cursor]").toExist()

      // k up through cards → column → board → boundary
      board.command("cursor_up")
      board.expect("#1b[data-cursor]").toExist()
      board.command("cursor_up")
      board.expect("#1a[data-cursor]").toExist()
      board.command("cursor_up")
      board.expect("#col1[data-cursor]").toExist()
      board.command("cursor_up")
      board.expect("#board[data-cursor]").toExist()

      // k at top stops (boundary)
      board.command("cursor_up")
      board.expect("#board[data-cursor]").toExist()

      // --- g/G jump to first/last ---
      // Navigate back to middle
      board.command("cursor_down") // board → col1
      board.command("cursor_down") // col1 → 1a
      board.command("cursor_down") // 1a → 1b
      board.expect("#1b[data-cursor]").toExist()

      // g G to last in column
      board.command("cursor_last")
      board.expect("#1c[data-cursor]").toExist()

      // g G at last does nothing
      board.command("cursor_last")
      board.expect("#1c[data-cursor]").toExist()

      // g to first in column
      board.command("cursor_first")
      board.expect("#1a[data-cursor]").toExist()

      // g at first does nothing
      board.command("cursor_first")
      board.expect("#1a[data-cursor]").toExist()
    })

    test("horizontal (h/l): moves between columns", () => {
      const { board } = testEnv(item.multiColBoard, { viewMode: "list" })

      // l right through columns (same as cards view)
      board.expect("#1a[data-cursor]").toExist()
      board.command("cursor_right")
      board.expect("#2a[data-cursor]").toExist()
      board.command("cursor_right")
      board.expect("#3a[data-cursor]").toExist()

      // l at right boundary stops
      board.command("cursor_right")
      board.expect("#3a[data-cursor]").toExist()

      // h back left through columns
      board.command("cursor_left")
      board.expect("#2a[data-cursor]").toExist()
      board.command("cursor_left")
      board.expect("#1a[data-cursor]").toExist()

      // h at left boundary stops
      board.command("cursor_left")
      board.expect("#1a[data-cursor]").toExist()
    })
  })

  // Note: Columns View tests omitted - cards view tests cover the navigation logic,
  // columns view only changes layout (side-by-side vs stacked)

  describe("Tabs View", () => {
    test("vertical (j/k): cards within active tab → boundary", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"), item("2b"))),
        { viewMode: "tabs" },
      )
      // Start at first card in first tab (col1)
      board.expect("#1a[data-cursor]").toExist()

      // j down through cards in active tab
      board.command("cursor_down")
      board.expect("#1b[data-cursor]").toExist()
      board.command("cursor_down")
      board.expect("#1c[data-cursor]").toExist()

      // j at bottom stops (boundary)
      board.command("cursor_down")
      board.expect("#1c[data-cursor]").toExist()

      // k up through cards → column header (check via path) → board
      board.command("cursor_up")
      board.expect("#1b[data-cursor]").toExist()
      board.command("cursor_up")
      board.expect("#1a[data-cursor]").toExist()
      // At column header level - verify via path (tabs don't have id attrs)
      board.command("cursor_up")
      const output = board.screenshot()
      expect(output).toContain("board > col1")
      expect(output).not.toContain("col1 > 1a")
      // Move to board level
      board.command("cursor_up")
      board.expect("#board[data-cursor]").toExist()
    })

    test("horizontal (h/l): switch between tabs", () => {
      const { board } = testEnv(item.multiColBoard, { viewMode: "tabs" })
      // Start in col1 tab
      board.expect("#1a[data-cursor]").toExist()

      // l switches to col2 tab
      board.command("cursor_right")
      board.expect("#2a[data-cursor]").toExist()
      // col1 content should not be visible
      board.expect("#1a").not.toExist()

      // l switches to col3 tab
      board.command("cursor_right")
      board.expect("#3a[data-cursor]").toExist()
      board.expect("#2a").not.toExist()

      // l at right boundary stops
      board.command("cursor_right")
      board.expect("#3a[data-cursor]").toExist()

      // h back to col2
      board.command("cursor_left")
      board.expect("#2a[data-cursor]").toExist()
      board.expect("#3a").not.toExist()

      // h back to col1
      board.command("cursor_left")
      board.expect("#1a[data-cursor]").toExist()

      // h at left boundary stops
      board.command("cursor_left")
      board.expect("#1a[data-cursor]").toExist()
    })

    test("cursor position when switching tabs", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("1a"), item("1b"), item("1c")),
            item("col2", item("2a"), item("2b"), item("2c")),
          ),
        { viewMode: "tabs" },
      )
      // Navigate to second card in col1
      board.command("cursor_down")
      board.expect("#1b[data-cursor]").toExist()

      // Switch to col2 tab - goes to first card by default
      board.command("cursor_right")
      board.expect("#2a[data-cursor]").toExist()

      // Navigate within col2
      board.command("cursor_down")
      board.expect("#2b[data-cursor]").toExist()

      // Switch back to col1 - cursor returns to previous position (1b)
      board.command("cursor_left")
      board.expect("#1b[data-cursor]").toExist()
    })

    test("tab header selection with k", () => {
      const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))), {
        viewMode: "tabs",
      })
      // Start at card level
      board.expect("#1a[data-cursor]").toExist()

      // k to tab header level
      board.command("cursor_up")
      let output = board.screenshot()
      expect(output).toContain("board > col1")

      // l switches tabs at header level
      board.command("cursor_right")
      output = board.screenshot()
      expect(output).toContain("board > col2")

      // j returns to card level in active tab
      board.command("cursor_down")
      board.expect("#2a[data-cursor]").toExist()
    })

    test("empty tab shows placeholder", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("1a")),
            item("col2"), // Empty tab
          ),
        { viewMode: "tabs" },
      )
      // Switch to empty tab
      board.command("cursor_right")
      const output = board.screenshot()
      expect(output).toContain("(empty)")
    })
  })
})

describe("Boundaries and Edge Cases", () => {
  describe("empty states", () => {
    test("empty board shows helpful message", () => {
      const { board } = testEnv(() => item("board"))
      const output = board.screenshot()
      expect(output).toContain("Empty board")
    })

    test("empty column - j/k do nothing", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("task")), item("col2")), // col2 is empty
      )
      // Move to col2
      board.command("cursor_right")
      // Can't move down in empty column
      board.command("cursor_down")
      board.expect("#col2[data-cursor]").toExist() // Still at column header
    })

    test("single card - g/G do nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("only"))))
      board.expect("#only[data-cursor]").toExist()
      board.command("cursor_first")
      board.expect("#only[data-cursor]").toExist()
      board.command("cursor_last")
      board.expect("#only[data-cursor]").toExist()
    })
  })

  test("single column: h and l do nothing", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))))
    board.expect("#task[data-cursor]").toExist()

    // h does nothing (no columns to left)
    board.command("cursor_left")
    board.expect("#task[data-cursor]").toExist()

    // l does nothing (no columns to right)
    board.command("cursor_right")
    board.expect("#task[data-cursor]").toExist()
  })

  test("k stops at top boundary, j stops at bottom boundary", () => {
    const { board } = testEnv(item.simpleBoard)

    // --- k boundary: move up through column header to board title ---
    board.expect("#1a[data-cursor]").toExist()
    board.command("cursor_up")
    board.expect("#col1[data-cursor]").toExist()
    board.command("cursor_up")
    board.expect("#board[data-cursor]").toExist()

    // Try k multiple times - should stay at board
    board.command("cursor_up")
    board.expect("#board[data-cursor]").toExist()
    board.command("cursor_up")
    board.expect("#board[data-cursor]").toExist()
    board.command("cursor_up")
    board.expect("#board[data-cursor]").toExist()

    // --- j boundary: navigate down to last card ---
    board.command("cursor_down") // board → col1
    board.command("cursor_down") // col1 → 1a
    board.command("cursor_down") // 1a → 1b
    board.command("cursor_down") // 1b → 1c
    board.expect("#1c[data-cursor]").toExist()

    // Try j multiple times - should stay at 1c
    board.command("cursor_down")
    board.expect("#1c[data-cursor]").toExist()
    board.command("cursor_down")
    board.expect("#1c[data-cursor]").toExist()
    board.command("cursor_down")
    board.expect("#1c[data-cursor]").toExist()
  })

  test("h stops at left boundary, l stops at right boundary", () => {
    const { board } = testEnv(item.multiColBoard)

    // --- h boundary: navigate right then back to left edge ---
    board.expect("#1a[data-cursor]").toExist()
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()
    board.command("cursor_left")
    board.expect("#1a[data-cursor]").toExist()

    // Try h multiple times - should stay at col1
    board.command("cursor_left")
    board.expect("#1a[data-cursor]").toExist()
    board.command("cursor_left")
    board.expect("#1a[data-cursor]").toExist()
    board.command("cursor_left")
    board.expect("#1a[data-cursor]").toExist()

    // --- l boundary: navigate right to last column ---
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()
    board.command("cursor_right")
    board.expect("#3a[data-cursor]").toExist()

    // Try l multiple times - should stay at col3
    board.command("cursor_right")
    board.expect("#3a[data-cursor]").toExist()
    board.command("cursor_right")
    board.expect("#3a[data-cursor]").toExist()
    board.command("cursor_right")
    board.expect("#3a[data-cursor]").toExist()
  })

  test("g does nothing at first card", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.expect("#1a[data-cursor]").toExist()
    board.press("g")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("g G does nothing at last card", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.command("cursor_last")
    board.expect("#1c[data-cursor]").toExist()
    board.command("cursor_last")
    board.expect("#1c[data-cursor]").toExist()
  })

  // Keys that should do nothing in specific contexts
  describe("no-op key boundaries", () => {
    test("Escape, [, ], z on column header do nothing on task card", () => {
      const { board } = testEnv(() => item("board", item("col", item("task"))))

      // Escape in board view
      board.expect("#task[data-cursor]").toExist()
      board.press("\x1B")
      board.expect("#task[data-cursor]").toExist()

      // [ when no history
      board.press("{")
      board.expect("#task[data-cursor]").toExist()

      // ] when no forward history
      board.press("}")
      board.expect("#task[data-cursor]").toExist()

      // z on column header does nothing
      board.command("cursor_up")
      board.expect("#col[data-cursor]").toExist()
      board.command("fold_all")
      board.expect("#col[data-cursor]").toExist()
    })

    test("Enter and z do nothing on leaf card", () => {
      const { board } = testEnv(() => item("board", item("col", item("leaf"))))

      // Enter on card without children
      board.expect("#leaf[data-cursor]").toExist()
      board.press("\r")
      board.expect("#leaf[data-cursor]").toExist()

      // z on card without children
      board.command("fold_all")
      board.expect("#leaf[data-cursor]").toExist()
    })
  })
})

describe("Boundary Feedback (Bell + Status)", () => {
  test("k at top boundary triggers bell/status, clears on next keypress", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    // Navigate to board (cursor starts at 1a)
    board.command("cursor_up") // 1a → col1 header
    board.command("cursor_up") // col1 → board
    board.expect("#board[data-cursor]").toExist()

    // Hit top boundary - should ring bell and show status
    board.command("cursor_up")
    expect(board.bell).toBe(true)
    expect(board.hasStatus).toBe(true)
    const status = board.getStatus()
    expect(status?.level).toBe("warning")
    expect(status?.message).toContain("Can't move")

    // Next keypress clears status
    board.command("cursor_down")
    expect(board.hasStatus).toBe(false)

    // Hit another boundary (different direction)
    board.command("cursor_left") // hit left boundary from board level
    expect(board.bell).toBe(true)
    expect(board.hasStatus).toBe(true)

    // Non-boundary key clears status
    board.command("cursor_down") // board → col1 (valid move)
    expect(board.hasStatus).toBe(false)
  })

  test.each([
    { key: "h", setup: [], finalId: "#1a", desc: "h at left boundary" },
    { key: "l", setup: ["l"], finalId: "#2a", desc: "l at right boundary" },
    { key: "j", setup: ["j"], finalId: "#1b", desc: "j at bottom boundary" },
  ])("$desc shows feedback", ({ key, setup, finalId }) => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    // Navigate to boundary position
    for (const k of setup) board.press(k)
    board.expect(`${finalId}[data-cursor]`).toExist()

    // Hit boundary - should ring bell and show status
    board.press(key)
    expect(board.bell).toBe(true)
    expect(board.hasStatus).toBe(true)
  })

  test("boundary bell sets data-bell-flash attribute", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    // No flash initially
    expect(board.q("[data-bell-flash]").count()).toBe(0)

    // Hit left boundary
    board.command("cursor_left")
    expect(board.bell).toBe(true)
    expect(board.q("[data-bell-flash]").count()).toBe(1)

    // Next keypress clears bell and restores
    board.command("cursor_down")
    expect(board.q("[data-bell-flash]").count()).toBe(0)
  })

  test("unhandled key triggers visual bell flash", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))
    // Press an unbound key (; has no command binding)
    board.press(";")
    expect(board.bell).toBe(true)
    expect(board.q("[data-bell-flash]").count()).toBe(1)
  })

  test("unhandled key bell clears on next valid key", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    board.press(";") // unhandled
    expect(board.bell).toBe(true)

    board.command("cursor_down") // valid key
    expect(board.bell).toBe(false)
    expect(board.q("[data-bell-flash]").count()).toBe(0)
  })

  test("boundary bell fires on every boundary press", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    // Navigate to bottom card
    board.command("cursor_down") // 1a → 1b
    board.expect("#1b[data-cursor]").toExist()

    // Every boundary hit fires bell
    for (let i = 0; i < 5; i++) {
      board.command("cursor_down")
      expect(board.bell).toBe(true)
      expect(board.hasStatus).toBe(true)
    }
    // Cursor stayed at 1b through all boundary hits
    board.expect("#1b[data-cursor]").toExist()
  })

  test("bell fires for each horizontal boundary direction", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))
    // Single card, single column — h and l are horizontal boundaries

    board.command("cursor_left")
    expect(board.bell).toBe(true)

    board.command("cursor_right")
    expect(board.bell).toBe(true)
  })

  test("bell fires for downward boundary", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    board.command("cursor_down") // 1a → 1b
    board.command("cursor_down") // boundary
    expect(board.bell).toBe(true)

    // Second boundary press also fires bell (no streak suppression)
    board.command("cursor_down")
    expect(board.bell).toBe(true)
  })
})

// =============================================================================
// Sub-block navigation (j/k inside a card)
// =============================================================================

describe("Sub-block navigation", () => {
  test("click sub-block → j/k navigate siblings → k to parent card", () => {
    const { board } = testEnv(
      () => item("board", item("Column", item("card", item("child-1"), item("child-2"), item("child-3")))),
      { columns: 80, rows: 24 },
    )

    // Click child-1 to enter sub-block mode
    const el = board.q("[id='child-1']")
    const box = el.boundingBox()!
    board.click(box.x + 1, box.y)
    board.expect("#child-1[data-cursor]").toExist()

    // j → child-2
    board.command("cursor_down")
    board.expect("#child-2[data-cursor]").toExist()

    // j → child-3
    board.command("cursor_down")
    board.expect("#child-3[data-cursor]").toExist()

    // k → child-2
    board.command("cursor_up")
    board.expect("#child-2[data-cursor]").toExist()

    // k → child-1
    board.command("cursor_up")
    board.expect("#child-1[data-cursor]").toExist()

    // k from first child → parent card title
    board.command("cursor_up")
    board.expect("#card[data-cursor]").toExist()
  })

  test("j from last sub-block jumps to next card", () => {
    const { board } = testEnv(
      () => item("board", item("Column", item("card-a", item("a-child-1"), item("a-child-2")), item("card-b"))),
      { columns: 80, rows: 24 },
    )

    // Click last child of card-a
    const el = board.q("[id='a-child-2']")
    const box = el.boundingBox()!
    board.click(box.x + 1, box.y)
    board.expect("#a-child-2[data-cursor]").toExist()

    // j → next card (card-b)
    board.command("cursor_down")
    board.expect("#card-b[data-cursor]").toExist()
  })

  test("Enter on sub-block edits that block, not the card title", () => {
    const { board } = testEnv(
      () => item("board", item("Column", item("card", item("child-1"), item("child-2"), item("child-3")))),
      { columns: 80, rows: 24 },
    )

    // Click child-2 to select it
    const el = board.q("[id='child-2']")
    const box = el.boundingBox()!
    board.click(box.x + 1, box.y)
    board.expect("#child-2[data-cursor]").toExist()

    // Enter to edit — should edit child-2
    board.press("Enter")

    // Should show INSERT mode indicator
    expect(board.screenshot()).toContain("INSERT")
    // Screen should show child-2 content (edit mode)
    expect(board.screenshot()).toContain("child-2")
  })

  test("clicking each child in a card selects the correct one (hitTest)", () => {
    const { board } = testEnv(
      () => item("board", item("Column", item("card", item("child-1"), item("child-2"), item("child-3")))),
      { columns: 80, rows: 24 },
    )

    for (const id of ["child-1", "child-2", "child-3"]) {
      const el = board.q(`[id='${id}']`)
      expect(el.count(), `${id} should be rendered`).toBeGreaterThan(0)
      const box = el.boundingBox()!
      board.click(box.x + 1, box.y)
      board.expect(`#${id}[data-cursor]`).toExist()
    }
  })
})

// =============================================================================
// Tree-traversal navigation (J/K — enter children / exit to parent)
// =============================================================================

describe("Tree-traversal navigation (J/K)", () => {
  test("J on card with children moves into first child", () => {
    const { board } = testEnv(
      () => item("board", item("Column", item("card1", item("child1a"), item("child1b")), item("card2"))),
      { columns: 80, rows: 24 },
    )
    board.expect("#card1[data-cursor]").toExist()

    // J should move INTO card1's children
    board.command("block_nav_down")
    board.expect("#child1a[data-cursor]").toExist()
  })

  test("K on first child moves to parent card", () => {
    const { board } = testEnv(() => item("board", item("Column", item("card1", item("child1a"), item("child1b")))), {
      columns: 80,
      rows: 24,
    })
    board.expect("#card1[data-cursor]").toExist()

    // Enter child via J
    board.command("block_nav_down")
    board.expect("#child1a[data-cursor]").toExist()

    // K should move back to parent card
    board.command("block_nav_up")
    board.expect("#card1[data-cursor]").toExist()
  })

  test("J on leaf card (no children) moves to next sibling", () => {
    const { board } = testEnv(() => item("board", item("Column", item("card1"), item("card2"))), {
      columns: 80,
      rows: 24,
    })
    board.expect("#card1[data-cursor]").toExist()

    // J on leaf → next sibling (same as j)
    board.command("block_nav_down")
    board.expect("#card2[data-cursor]").toExist()
  })

  test("K on top-level card (no parent above column) moves to prev sibling", () => {
    const { board } = testEnv(() => item("board", item("Column", item("card1"), item("card2"))), {
      columns: 80,
      rows: 24,
    })
    // Navigate to card2
    board.command("cursor_down")
    board.expect("#card2[data-cursor]").toExist()

    // K on card2 → prev sibling card1 (at top level, K acts like k)
    board.command("block_nav_up")
    board.expect("#card1[data-cursor]").toExist()
  })

  test("J/K full tree traversal journey", () => {
    const { board } = testEnv(
      () => item("board", item("Column", item("parent", item("child-a"), item("child-b")), item("sibling"))),
      { columns: 80, rows: 24 },
    )
    // Start at parent card
    board.expect("#parent[data-cursor]").toExist()

    // J → enter first child
    board.command("block_nav_down")
    board.expect("#child-a[data-cursor]").toExist()

    // j (lowercase) → next sibling within card
    board.command("cursor_down")
    board.expect("#child-b[data-cursor]").toExist()

    // K from non-first child → previous sibling
    board.command("block_nav_up")
    board.expect("#child-a[data-cursor]").toExist()

    // K from first child → back to parent card title
    board.command("block_nav_up")
    board.expect("#parent[data-cursor]").toExist()

    // K again → column header (parent is first card in column)
    board.command("block_nav_up")
    board.expect("#Column[data-cursor]").toExist()
  })

  test("K from non-first child moves to previous sibling, not parent", () => {
    const { board } = testEnv(
      () => item("board", item("Column", item("card", item("child-1"), item("child-2"), item("child-3")))),
      { columns: 80, rows: 24 },
    )
    board.expect("#card[data-cursor]").toExist()

    // J → enter first child
    board.command("block_nav_down")
    board.expect("#child-1[data-cursor]").toExist()

    // j → next sibling
    board.command("cursor_down")
    board.expect("#child-2[data-cursor]").toExist()

    // K from child-2 (not first child) → previous sibling child-1
    board.command("block_nav_up")
    board.expect("#child-1[data-cursor]").toExist()

    // K from child-1 (first child) → parent card title
    board.command("block_nav_up")
    board.expect("#card[data-cursor]").toExist()
  })
})
