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
      const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"), item("1c"))))
      // j down through cards
      board.expect("#1a[data-cursor]").toExist()
      board.press("j")
      board.expect("#1b[data-cursor]").toExist()
      board.press("j")
      board.expect("#1c[data-cursor]").toExist()

      // j at bottom stops (boundary)
      board.press("j")
      board.expect("#1c[data-cursor]").toExist()
      board.press("j")
      board.expect("#1c[data-cursor]").toExist()

      // k up through cards → column → board → boundary
      board.press("k")
      board.expect("#1b[data-cursor]").toExist()
      board.press("k")
      board.expect("#1a[data-cursor]").toExist()
      board.press("k")
      board.expect("#col1[data-cursor]").toExist()
      board.press("k")
      board.expect("#board[data-cursor]").toExist()

      // k at top stops (boundary)
      board.press("k")
      board.expect("#board[data-cursor]").toExist()
      board.press("k")
      board.expect("#board[data-cursor]").toExist()

      // j back down: board → column → card
      board.press("j")
      board.expect("#col1[data-cursor]").toExist()
      board.press("j")
      board.expect("#1a[data-cursor]").toExist()
    })

    test("horizontal (h/l): columns at card level and header level → boundary", () => {
      const { board } = testEnv(() =>
        item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
      )

      // --- Card level ---
      // l right through columns
      board.expect("#1a[data-cursor]").toExist()
      board.press("l")
      board.expect("#2a[data-cursor]").toExist()
      board.press("l")
      board.expect("#3a[data-cursor]").toExist()

      // l at right boundary stops
      board.press("l")
      board.expect("#3a[data-cursor]").toExist()
      board.press("l")
      board.expect("#3a[data-cursor]").toExist()

      // h back left through columns
      board.press("h")
      board.expect("#2a[data-cursor]").toExist()
      board.press("h")
      board.expect("#1a[data-cursor]").toExist()

      // h at left boundary stops
      board.press("h")
      board.expect("#1a[data-cursor]").toExist()
      board.press("h")
      board.expect("#1a[data-cursor]").toExist()

      // --- Header level ---
      // Go to column headers
      board.press("k")
      board.expect("#col1[data-cursor]").toExist()

      // l right through headers
      board.press("l")
      board.expect("#col2[data-cursor]").toExist()
      board.press("l")
      board.expect("#col3[data-cursor]").toExist()

      // l at right boundary stops
      board.press("l")
      board.expect("#col3[data-cursor]").toExist()
      board.press("l")
      board.expect("#col3[data-cursor]").toExist()

      // h back left through headers
      board.press("h")
      board.expect("#col2[data-cursor]").toExist()
      board.press("h")
      board.expect("#col1[data-cursor]").toExist()

      // h at left boundary stops
      board.press("h")
      board.expect("#col1[data-cursor]").toExist()
      board.press("h")
      board.expect("#col1[data-cursor]").toExist()
    })

    test("g/G: jump to first/last in column", () => {
      const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"), item("1c"))))
      // Start at middle
      board.press("j")
      board.expect("#1b[data-cursor]").toExist()

      // G to last
      board.press("G")
      board.expect("#1c[data-cursor]").toExist()

      // G at last does nothing
      board.press("G")
      board.expect("#1c[data-cursor]").toExist()

      // g to first
      board.press("g").press("g")
      board.expect("#1a[data-cursor]").toExist()

      // g at first does nothing
      board.press("g").press("g")
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
        board.press("l")
        board.press("l")
        board.expect("#3a[data-cursor]").toExist()

        // Move up to col3 header, then board title
        board.press("k")
        board.expect("#col3[data-cursor]").toExist()
        board.press("k")
        board.expect("#board[data-cursor]").toExist()

        // Move back down - should go to col3 header (curswantX preserved)
        board.press("j")
        board.expect("#col3[data-cursor]").toExist()

        // Continue down - should go to first card in col3
        board.press("j")
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
        board.press("l")
        board.expect("#2a[data-cursor]").toExist()

        // Jump to last card in column
        board.press("G")
        board.expect("#2c[data-cursor]").toExist()

        // Jump back to first - should stay in col2
        board.press("g").press("g")
        board.expect("#2a[data-cursor]").toExist()
      })

      test("remembers X position in columns view", () => {
        const { board } = testEnv(
          () => item("board", item("col1", item("task")), item("col2", item("task")), item("col3", item("task"))),
          { columns: 120 }, // Wide terminal for side-by-side columns
        )
        // Move to col3 header
        board.press("l")
        board.press("l")
        const col3Box = board.q("#col3").boundingBox()

        // Move up to board title and back down
        board.press("k")
        board.press("j")

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
        board.press("j")
        board.press("j")
        board.expect("#1c[data-cursor]").toExist()
        const card1cBox = board.q("#1c").boundingBox()

        // Move right to col2 - should go to card at similar Y position
        board.press("l")
        const card2Box = board.q("[data-cursor]").boundingBox()
        // Y position should be close (within ~1 card height tolerance)
        // Using 15 to account for minor layout variations
        expect(Math.abs(card2Box!.y - card1cBox!.y)).toBeLessThanOrEqual(15)

        // Move right to col3 - should maintain Y position
        board.press("l")
        const card3Box = board.q("[data-cursor]").boundingBox()
        expect(Math.abs(card3Box!.y - card1cBox!.y)).toBeLessThanOrEqual(15)

        // Move back left - should return to similar Y position
        board.press("h")
        board.press("h")
        const returnedBox = board.q("[data-cursor]").boundingBox()
        expect(Math.abs(returnedBox!.y - card1cBox!.y)).toBeLessThanOrEqual(15)
      })

      // TODO: Implement once test infra supports position registry (card layouts).
      // curswantY needs real layout measurements for h/l nav; without them it falls back to first card.
      // See board-actions.ts handleCursorMove() - "Fallback when positions aren't available"
      test.skip("adjusts Y position when target column is shorter", () => {
        const { board } = testEnv(() =>
          item(
            "board",
            item("col1", item("1a"), item("1b"), item("1c"), item("1d")),
            item("col2", item("2a")), // Only one card
            item("col3", item("3a"), item("3b"), item("3c")),
          ),
        )
        // Move to last card in col1
        board.press("G")
        board.expect("#1d[data-cursor]").toExist()

        // Move right to col2 (shorter column) - should clamp to last card
        board.press("l")
        board.expect("#2a[data-cursor]").toExist()

        // Move right to col3 - should go to last card (curswantY preserved)
        board.press("l")
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
        board.press("j")
        const card2Box = board.q("[data-cursor]").boundingBox()

        // Move right to col2
        board.press("l")
        const col2Box = board.q("[data-cursor]").boundingBox()

        // Y position should be preserved (within tolerance)
        expect(Math.abs(col2Box!.y - card2Box!.y)).toBeLessThan(10)
      })
    })
  }) // End Cards View

  // View mode variations
  describe("List View", () => {
    test("vertical (j/k) navigation and g/G jump to first/last", () => {
      const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"), item("1c"))), {
        viewMode: "list",
      })

      // --- j/k navigation ---
      // j down through cards
      board.expect("#1a[data-cursor]").toExist()
      board.press("j")
      board.expect("#1b[data-cursor]").toExist()
      board.press("j")
      board.expect("#1c[data-cursor]").toExist()

      // j at bottom stops (boundary)
      board.press("j")
      board.expect("#1c[data-cursor]").toExist()

      // k up through cards → column → board → boundary
      board.press("k")
      board.expect("#1b[data-cursor]").toExist()
      board.press("k")
      board.expect("#1a[data-cursor]").toExist()
      board.press("k")
      board.expect("#col1[data-cursor]").toExist()
      board.press("k")
      board.expect("#board[data-cursor]").toExist()

      // k at top stops (boundary)
      board.press("k")
      board.expect("#board[data-cursor]").toExist()

      // --- g/G jump to first/last ---
      // Navigate back to middle
      board.press("j") // board → col1
      board.press("j") // col1 → 1a
      board.press("j") // 1a → 1b
      board.expect("#1b[data-cursor]").toExist()

      // G to last in column
      board.press("G")
      board.expect("#1c[data-cursor]").toExist()

      // G at last does nothing
      board.press("G")
      board.expect("#1c[data-cursor]").toExist()

      // g to first in column
      board.press("g").press("g")
      board.expect("#1a[data-cursor]").toExist()

      // g at first does nothing
      board.press("g").press("g")
      board.expect("#1a[data-cursor]").toExist()
    })

    test("horizontal (h/l): moves between columns", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
        { viewMode: "list" },
      )

      // l right through columns (same as cards view)
      board.expect("#1a[data-cursor]").toExist()
      board.press("l")
      board.expect("#2a[data-cursor]").toExist()
      board.press("l")
      board.expect("#3a[data-cursor]").toExist()

      // l at right boundary stops
      board.press("l")
      board.expect("#3a[data-cursor]").toExist()

      // h back left through columns
      board.press("h")
      board.expect("#2a[data-cursor]").toExist()
      board.press("h")
      board.expect("#1a[data-cursor]").toExist()

      // h at left boundary stops
      board.press("h")
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
      board.press("j")
      board.expect("#1b[data-cursor]").toExist()
      board.press("j")
      board.expect("#1c[data-cursor]").toExist()

      // j at bottom stops (boundary)
      board.press("j")
      board.expect("#1c[data-cursor]").toExist()

      // k up through cards → column header (check via path) → board
      board.press("k")
      board.expect("#1b[data-cursor]").toExist()
      board.press("k")
      board.expect("#1a[data-cursor]").toExist()
      // At column header level - verify via path (tabs don't have id attrs)
      board.press("k")
      const output = board.screenshot()
      expect(output).toContain("board > col1")
      expect(output).not.toContain("col1 > 1a")
      // Move to board level
      board.press("k")
      board.expect("#board[data-cursor]").toExist()
    })

    test("horizontal (h/l): switch between tabs", () => {
      const { board } = testEnv(
        () => item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
        { viewMode: "tabs" },
      )
      // Start in col1 tab
      board.expect("#1a[data-cursor]").toExist()

      // l switches to col2 tab
      board.press("l")
      board.expect("#2a[data-cursor]").toExist()
      // col1 content should not be visible
      board.expect("#1a").not.toExist()

      // l switches to col3 tab
      board.press("l")
      board.expect("#3a[data-cursor]").toExist()
      board.expect("#2a").not.toExist()

      // l at right boundary stops
      board.press("l")
      board.expect("#3a[data-cursor]").toExist()

      // h back to col2
      board.press("h")
      board.expect("#2a[data-cursor]").toExist()
      board.expect("#3a").not.toExist()

      // h back to col1
      board.press("h")
      board.expect("#1a[data-cursor]").toExist()

      // h at left boundary stops
      board.press("h")
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
      board.press("j")
      board.expect("#1b[data-cursor]").toExist()

      // Switch to col2 tab - goes to first card by default
      board.press("l")
      board.expect("#2a[data-cursor]").toExist()

      // Navigate within col2
      board.press("j")
      board.expect("#2b[data-cursor]").toExist()

      // Switch back to col1 - returns to first card
      board.press("h")
      board.expect("#1a[data-cursor]").toExist()
    })

    test("tab header selection with k", () => {
      const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))), {
        viewMode: "tabs",
      })
      // Start at card level
      board.expect("#1a[data-cursor]").toExist()

      // k to tab header level
      board.press("k")
      let output = board.screenshot()
      expect(output).toContain("board > col1")

      // l switches tabs at header level
      board.press("l")
      output = board.screenshot()
      expect(output).toContain("board > col2")

      // j returns to card level in active tab
      board.press("j")
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
      board.press("l")
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
      board.press("l")
      // Can't move down in empty column
      board.press("j")
      board.expect("#col2[data-cursor]").toExist() // Still at column header
    })

    test("single card - g/G do nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("only"))))
      board.expect("#only[data-cursor]").toExist()
      board.press("g").press("g")
      board.expect("#only[data-cursor]").toExist()
      board.press("G")
      board.expect("#only[data-cursor]").toExist()
    })
  })

  test("single column: h and l do nothing", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))))
    board.expect("#task[data-cursor]").toExist()

    // h does nothing (no columns to left)
    board.press("h")
    board.expect("#task[data-cursor]").toExist()

    // l does nothing (no columns to right)
    board.press("l")
    board.expect("#task[data-cursor]").toExist()
  })

  test("k stops at top boundary, j stops at bottom boundary", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"), item("1c"))))

    // --- k boundary: move up through column header to board title ---
    board.expect("#1a[data-cursor]").toExist()
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()
    board.press("k")
    board.expect("#board[data-cursor]").toExist()

    // Try k multiple times - should stay at board
    board.press("k")
    board.expect("#board[data-cursor]").toExist()
    board.press("k")
    board.expect("#board[data-cursor]").toExist()
    board.press("k")
    board.expect("#board[data-cursor]").toExist()

    // --- j boundary: navigate down to last card ---
    board.press("j") // board → col1
    board.press("j") // col1 → 1a
    board.press("j") // 1a → 1b
    board.press("j") // 1b → 1c
    board.expect("#1c[data-cursor]").toExist()

    // Try j multiple times - should stay at 1c
    board.press("j")
    board.expect("#1c[data-cursor]").toExist()
    board.press("j")
    board.expect("#1c[data-cursor]").toExist()
    board.press("j")
    board.expect("#1c[data-cursor]").toExist()
  })

  test("h stops at left boundary, l stops at right boundary", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
    )

    // --- h boundary: navigate right then back to left edge ---
    board.expect("#1a[data-cursor]").toExist()
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()
    board.press("h")
    board.expect("#1a[data-cursor]").toExist()

    // Try h multiple times - should stay at col1
    board.press("h")
    board.expect("#1a[data-cursor]").toExist()
    board.press("h")
    board.expect("#1a[data-cursor]").toExist()
    board.press("h")
    board.expect("#1a[data-cursor]").toExist()

    // --- l boundary: navigate right to last column ---
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()
    board.press("l")
    board.expect("#3a[data-cursor]").toExist()

    // Try l multiple times - should stay at col3
    board.press("l")
    board.expect("#3a[data-cursor]").toExist()
    board.press("l")
    board.expect("#3a[data-cursor]").toExist()
    board.press("l")
    board.expect("#3a[data-cursor]").toExist()
  })

  test.each([
    {
      key: "g",
      setup: [],
      finalId: "#1a",
      desc: "g does nothing at first card",
    },
    {
      key: "G",
      setup: ["G"],
      finalId: "#1c",
      desc: "G does nothing at last card",
    },
  ])("$desc", ({ key, setup, finalId }) => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    // Setup: navigate to the boundary position
    for (const k of setup) board.press(k)
    board.expect(`${finalId}[data-cursor]`).toExist()

    // Repeatedly try the key - should stay put
    board.press(key)
    board.expect(`${finalId}[data-cursor]`).toExist()
    board.press(key)
    board.expect(`${finalId}[data-cursor]`).toExist()
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
      board.press("[")
      board.expect("#task[data-cursor]").toExist()

      // ] when no forward history
      board.press("]")
      board.expect("#task[data-cursor]").toExist()

      // z on column header does nothing
      board.press("k")
      board.expect("#col[data-cursor]").toExist()
      board.press("z").press("M")
      board.expect("#col[data-cursor]").toExist()
    })

    test("Enter and z do nothing on leaf card", () => {
      const { board } = testEnv(() => item("board", item("col", item("leaf"))))

      // Enter on card without children
      board.expect("#leaf[data-cursor]").toExist()
      board.press("\r")
      board.expect("#leaf[data-cursor]").toExist()

      // z on card without children
      board.press("z").press("M")
      board.expect("#leaf[data-cursor]").toExist()
    })
  })
})

describe("Boundary Feedback (Bell + Status)", () => {
  test("k at top boundary triggers bell/status, clears on next keypress", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    // Navigate to board (cursor starts at 1a)
    board.press("k") // 1a → col1 header
    board.press("k") // col1 → board
    board.expect("#board[data-cursor]").toExist()

    // Hit top boundary - should ring bell and show status
    board.press("k")
    expect(board.bell).toBe(true)
    expect(board.hasStatus).toBe(true)
    const status = board.getStatus()
    expect(status?.level).toBe("warning")
    expect(status?.message).toContain("Can't move")

    // Next keypress clears status
    board.press("j")
    expect(board.hasStatus).toBe(false)

    // Hit another boundary (different direction)
    board.press("h") // hit left boundary from board level
    expect(board.bell).toBe(true)
    expect(board.hasStatus).toBe(true)

    // Non-boundary key clears status
    board.press("j") // board → col1 (valid move)
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
    board.press("h")
    expect(board.bell).toBe(true)
    expect(board.q("[data-bell-flash]").count()).toBe(1)

    // Next keypress clears bell and restores
    board.press("j")
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

    board.press("j") // valid key
    expect(board.bell).toBe(false)
    expect(board.q("[data-bell-flash]").count()).toBe(0)
  })

  test("boundary bell fires on every boundary press", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    // Navigate to bottom card
    board.press("j") // 1a → 1b
    board.expect("#1b[data-cursor]").toExist()

    // Every boundary hit fires bell
    for (let i = 0; i < 5; i++) {
      board.press("j")
      expect(board.bell).toBe(true)
      expect(board.hasStatus).toBe(true)
    }
    // Cursor stayed at 1b through all boundary hits
    board.expect("#1b[data-cursor]").toExist()
  })

  test("bell fires for each horizontal boundary direction", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))
    // Single card, single column — h and l are horizontal boundaries

    board.press("h")
    expect(board.bell).toBe(true)

    board.press("l")
    expect(board.bell).toBe(true)
  })

  test("bell fires for downward boundary", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    board.press("j") // 1a → 1b
    board.press("j") // boundary
    expect(board.bell).toBe(true)

    // Second boundary press also fires bell (no streak suppression)
    board.press("j")
    expect(board.bell).toBe(true)
  })
})
