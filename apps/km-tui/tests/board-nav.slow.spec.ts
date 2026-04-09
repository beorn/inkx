/**
 * Board Navigation Tests - Cursoring, Boundaries, Bell Feedback
 *
 * Split from board.spec.ts for parallel execution.
 * See board.spec.ts header comment for testing philosophy.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("Cursoring", () => {
  // Default view mode tests (cards view)
  describe("Cards View", () => {
    test("vertical (j/k): cards → column → board → boundary", async () => {
      using app = createTestApp(item.simpleBoard())
      // j down through cards
      app.expect("#1a[data-cursor]").toExist()
      await app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()
      await app.command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()

      // j at bottom stops (boundary)
      await app.command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()
      await app.command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()

      // k up through cards → column → board → boundary
      await app.command("cursor_up")
      app.expect("#1b[data-cursor]").toExist()
      await app.command("cursor_up")
      app.expect("#1a[data-cursor]").toExist()
      await app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()
      await app.command("cursor_up")
      app.expect("#board[data-cursor]").toExist()

      // k at top stops (boundary)
      await app.command("cursor_up")
      app.expect("#board[data-cursor]").toExist()
      await app.command("cursor_up")
      app.expect("#board[data-cursor]").toExist()

      // j back down: board → column → card
      await app.command("cursor_down")
      app.expect("#col1[data-cursor]").toExist()
      await app.command("cursor_down")
      app.expect("#1a[data-cursor]").toExist()
    })

    test("horizontal (h/l): columns at card level and header level → boundary", async () => {
      using app = createTestApp(item.multiColBoard())

      // --- Card level ---
      // l right through columns
      app.expect("#1a[data-cursor]").toExist()
      await app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()
      await app.command("cursor_right")
      app.expect("#3a[data-cursor]").toExist()

      // l at right boundary stops
      await app.command("cursor_right")
      app.expect("#3a[data-cursor]").toExist()
      await app.command("cursor_right")
      app.expect("#3a[data-cursor]").toExist()

      // h back left through columns
      await app.command("cursor_left")
      app.expect("#2a[data-cursor]").toExist()
      await app.command("cursor_left")
      app.expect("#1a[data-cursor]").toExist()

      // h at left card goes to column header first
      await app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()

      // h at left column header boundary stops
      await app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()

      // l right through headers
      await app.command("cursor_right")
      app.expect("#col2[data-cursor]").toExist()
      await app.command("cursor_right")
      app.expect("#col3[data-cursor]").toExist()

      // l at right boundary stops
      await app.command("cursor_right")
      app.expect("#col3[data-cursor]").toExist()
      await app.command("cursor_right")
      app.expect("#col3[data-cursor]").toExist()

      // h back left through headers
      await app.command("cursor_left")
      app.expect("#col2[data-cursor]").toExist()
      await app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()

      // h at left boundary stops
      await app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()
      await app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()
    })

    test("g/G: jump to first/last in column", async () => {
      using app = createTestApp(item.simpleBoard())
      // Start at middle
      await app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()

      // g G to last
      await app.command("cursor_last")
      app.expect("#1c[data-cursor]").toExist()

      // g G at last does nothing
      await app.command("cursor_last")
      app.expect("#1c[data-cursor]").toExist()

      // g to first
      await app.command("cursor_first")
      app.expect("#1a[data-cursor]").toExist()

      // g at first does nothing
      await app.command("cursor_first")
      app.expect("#1a[data-cursor]").toExist()
    })

    describe("curswantX (horizontal position memory)", () => {
      test("remembers column when moving through headers", async () => {
        using app = createTestApp(
          item(
            "board",
            item("col1", item("1a"), item("1b")),
            item("col2", item("2a"), item("2b")),
            item("col3", item("3a"), item("3b")),
          ),
        )
        // Start at card in col3
        await app.command("cursor_right")
        await app.command("cursor_right")
        app.expect("#3a[data-cursor]").toExist()

        // Move up to col3 header, then board title
        await app.command("cursor_up")
        app.expect("#col3[data-cursor]").toExist()
        await app.command("cursor_up")
        app.expect("#board[data-cursor]").toExist()

        // Move back down - should go to col3 header (curswantX preserved)
        await app.command("cursor_down")
        app.expect("#col3[data-cursor]").toExist()

        // Continue down - should go to first card in col3
        await app.command("cursor_down")
        app.expect("#3a[data-cursor]").toExist()
      })

      test("preserves column when jumping between first/last card", async () => {
        using app = createTestApp(
          item(
            "board",
            item("col1", item("1a"), item("1b"), item("1c")),
            item("col2", item("2a"), item("2b"), item("2c")),
          ),
        )
        // Move to col2
        await app.command("cursor_right")
        app.expect("#2a[data-cursor]").toExist()

        // Jump to last card in column
        await app.command("cursor_last")
        app.expect("#2c[data-cursor]").toExist()

        // Jump back to first - should stay in col2
        await app.command("cursor_first")
        app.expect("#2a[data-cursor]").toExist()
      })

      test("remembers X position in columns view", async () => {
        using app = createTestApp(
          item("board", item("col1", item("task")), item("col2", item("task")), item("col3", item("task"))),
          { cols: 120 }, // Wide terminal for side-by-side columns
        )
        // Move to col3 header
        await app.command("cursor_right")
        await app.command("cursor_right")
        const col3Box = app.q("#col3").boundingBox()

        // Move up to board title and back down
        await app.command("cursor_up")
        await app.command("cursor_down")

        // Should return to col3 (same X position)
        app.expect("#col3[data-cursor]").toExist()
        const returnedBox = app.q("#col3[data-cursor]").boundingBox()
        expect(returnedBox!.x).toBe(col3Box!.x)
      })
    })

    describe("curswantY (vertical position memory)", () => {
      test("remembers card position when moving between columns", async () => {
        using app = createTestApp(
          item(
            "board",
            item("col1", item("1a"), item("1b"), item("1c"), item("1d")),
            item("col2", item("2a"), item("2b"), item("2c")),
            item("col3", item("3a"), item("3b"), item("3c"), item("3d")),
          ),
        )
        // Move to third card in col1
        await app.command("cursor_down")
        await app.command("cursor_down")
        app.expect("#1c[data-cursor]").toExist()
        const card1cBox = app.q("#1c").boundingBox()

        // Move right to col2 - should go to card at similar Y position
        await app.command("cursor_right")
        const card2Box = app.q("[data-cursor]").boundingBox()
        // Y position should be close (within ~1 card height tolerance)
        // Using 15 to account for minor layout variations
        expect(Math.abs(card2Box!.y - card1cBox!.y)).toBeLessThanOrEqual(15)

        // Move right to col3 - should maintain Y position
        await app.command("cursor_right")
        const card3Box = app.q("[data-cursor]").boundingBox()
        expect(Math.abs(card3Box!.y - card1cBox!.y)).toBeLessThanOrEqual(15)

        // Move back left - should return to similar Y position
        await app.command("cursor_left")
        await app.command("cursor_left")
        const returnedBox = app.q("[data-cursor]").boundingBox()
        expect(Math.abs(returnedBox!.y - card1cBox!.y)).toBeLessThanOrEqual(15)
      })

      test("adjusts Y position when target column is shorter", async () => {
        using app = createTestApp(
          item(
            "board",
            item("col1", item("1a"), item("1b"), item("1c"), item("1d")),
            item("col2", item("2a")), // Only one card
            item("col3", item("3a"), item("3b"), item("3c")),
          ),
        )
        // Move to last card in col1
        await app.command("cursor_last")
        app.expect("#1d[data-cursor]").toExist()

        // Move right to col2 (shorter column) - should clamp to last card
        await app.command("cursor_right")
        app.expect("#2a[data-cursor]").toExist()

        // Move right to col3 - should go to last card (curswantY preserved)
        await app.command("cursor_right")
        app.expect("#3c[data-cursor]").toExist()
      })

      test("maintains Y position in columns view", async () => {
        using app = createTestApp(
          item(
            "board",
            item("col1", item("task1"), item("task2"), item("task3")),
            item("col2", item("taskA"), item("taskB"), item("taskC")),
          ),
          { cols: 120 },
        )
        // Move down to second card
        await app.command("cursor_down")
        const card2Box = app.q("[data-cursor]").boundingBox()

        // Move right to col2
        await app.command("cursor_right")
        const col2Box = app.q("[data-cursor]").boundingBox()

        // Y position should be preserved (within tolerance)
        expect(Math.abs(col2Box!.y - card2Box!.y)).toBeLessThan(10)
      })
    })
  }) // End Cards View

  // View mode variations
  describe("List View", () => {
    test("vertical (j/k) navigation and g/G jump to first/last", async () => {
      using app = createTestApp(item.simpleBoard(), {
        viewMode: "list",
      })

      // --- j/k navigation ---
      // j down through cards
      app.expect("#1a[data-cursor]").toExist()
      await app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()
      await app.command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()

      // j at bottom stops (boundary)
      await app.command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()

      // k up through cards → column → board → boundary
      await app.command("cursor_up")
      app.expect("#1b[data-cursor]").toExist()
      await app.command("cursor_up")
      app.expect("#1a[data-cursor]").toExist()
      await app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()
      await app.command("cursor_up")
      app.expect("#board[data-cursor]").toExist()

      // k at top stops (boundary)
      await app.command("cursor_up")
      app.expect("#board[data-cursor]").toExist()

      // --- g/G jump to first/last ---
      // Navigate back to middle
      await app.command("cursor_down") // board → col1
      await app.command("cursor_down") // col1 → 1a
      await app.command("cursor_down") // 1a → 1b
      app.expect("#1b[data-cursor]").toExist()

      // g G to last in column
      await app.command("cursor_last")
      app.expect("#1c[data-cursor]").toExist()

      // g G at last does nothing
      await app.command("cursor_last")
      app.expect("#1c[data-cursor]").toExist()

      // g to first in column
      await app.command("cursor_first")
      app.expect("#1a[data-cursor]").toExist()

      // g at first does nothing
      await app.command("cursor_first")
      app.expect("#1a[data-cursor]").toExist()
    })

    test("horizontal (h/l): moves between columns", async () => {
      using app = createTestApp(item.multiColBoard(), { viewMode: "list" })

      // l right through columns (same as cards view)
      app.expect("#1a[data-cursor]").toExist()
      await app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()
      await app.command("cursor_right")
      app.expect("#3a[data-cursor]").toExist()

      // l at right boundary stops
      await app.command("cursor_right")
      app.expect("#3a[data-cursor]").toExist()

      // h back left through columns
      await app.command("cursor_left")
      app.expect("#2a[data-cursor]").toExist()
      await app.command("cursor_left")
      app.expect("#1a[data-cursor]").toExist()

      // h at left card goes to column header first
      await app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()

      // h at column header is boundary
      await app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()
    })
  })

  // Note: Columns View tests omitted - cards view tests cover the navigation logic,
  // columns view only changes layout (side-by-side vs stacked)

  describe("Tabs View", () => {
    test("vertical (j/k): cards within active tab → boundary", async () => {
      using app = createTestApp(
        item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"), item("2b"))),
        { viewMode: "tabs" },
      )
      // Start at first card in first tab (col1)
      app.expect("#1a[data-cursor]").toExist()

      // j down through cards in active tab
      await app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()
      await app.command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()

      // j at bottom stops (boundary)
      await app.command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()

      // k up through cards → column header (check via path) → board
      await app.command("cursor_up")
      app.expect("#1b[data-cursor]").toExist()
      await app.command("cursor_up")
      app.expect("#1a[data-cursor]").toExist()
      // At column header level - verify via path (tabs don't have id attrs)
      await app.command("cursor_up")
      const output = app.text
      expect(output).toContain("board > col1")
      expect(output).not.toContain("col1 > 1a")
      // Move to board level
      await app.command("cursor_up")
      app.expect("#board[data-cursor]").toExist()
    })

    test("horizontal (h/l): switch between tabs", async () => {
      using app = createTestApp(item.multiColBoard(), { viewMode: "tabs" })
      // Start in col1 tab
      app.expect("#1a[data-cursor]").toExist()

      // l switches to col2 tab
      await app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()
      // col1 content should not be visible
      app.expect("#1a").not.toExist()

      // l switches to col3 tab
      await app.command("cursor_right")
      app.expect("#3a[data-cursor]").toExist()
      app.expect("#2a").not.toExist()

      // l at right boundary stops
      await app.command("cursor_right")
      app.expect("#3a[data-cursor]").toExist()

      // h back to col2
      await app.command("cursor_left")
      app.expect("#2a[data-cursor]").toExist()
      app.expect("#3a").not.toExist()

      // h back to col1
      await app.command("cursor_left")
      app.expect("#1a[data-cursor]").toExist()

      // h at left card goes to column header
      await app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()

      // h at column header is boundary
      await app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()
    })

    test("cursor position when switching tabs", async () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("1a"), item("1b"), item("1c")),
          item("col2", item("2a"), item("2b"), item("2c")),
        ),
        { viewMode: "tabs" },
      )
      // Navigate to second card in col1
      await app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()

      // Switch to col2 tab - goes to first card by default
      await app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()

      // Navigate within col2
      await app.command("cursor_down")
      app.expect("#2b[data-cursor]").toExist()

      // Switch back to col1 - cursor returns to previous position (1b)
      await app.command("cursor_left")
      app.expect("#1b[data-cursor]").toExist()
    })

    test("tab header selection with k", async () => {
      using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))), {
        viewMode: "tabs",
      })
      // Start at card level
      app.expect("#1a[data-cursor]").toExist()

      // k to tab header level
      await app.command("cursor_up")
      let output = app.text
      expect(output).toContain("board > col1")

      // l switches tabs at header level
      await app.command("cursor_right")
      output = app.text
      expect(output).toContain("board > col2")

      // j returns to card level in active tab
      await app.command("cursor_down")
      app.expect("#2a[data-cursor]").toExist()
    })

    test("empty tab shows placeholder", async () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("1a")),
          item("col2"), // Empty tab
        ),
        { viewMode: "tabs" },
      )
      // Switch to empty tab
      await app.command("cursor_right")
      const output = app.text
      expect(output).toContain("(empty)")
    })
  })
})

describe("Boundaries and Edge Cases", () => {
  describe("empty states", () => {
    test("empty board shows helpful message", async () => {
      using app = createTestApp(item("board"))
      const output = app.text
      expect(output).toContain("Empty board")
    })

    test("empty column - j/k do nothing", async () => {
      using app = createTestApp(
        item("board", item("col1", item("task")), item("col2")), // col2 is empty
      )
      // Move to col2
      await app.command("cursor_right")
      // Can't move down in empty column
      await app.command("cursor_down")
      app.expect("#col2[data-cursor]").toExist() // Still at column header
    })

    test("single card - g/G do nothing", async () => {
      using app = createTestApp(item("board", item("col", item("only"))))
      app.expect("#only[data-cursor]").toExist()
      await app.command("cursor_first")
      app.expect("#only[data-cursor]").toExist()
      await app.command("cursor_last")
      app.expect("#only[data-cursor]").toExist()
    })
  })

  test("single column: h goes to column header, l does nothing", async () => {
    using app = createTestApp(item("board", item("col", item("task"))))
    app.expect("#task[data-cursor]").toExist()

    // h at first card of first column goes to column header
    await app.command("cursor_left")
    app.expect("#col[data-cursor]").toExist()

    // h at column header is boundary
    await app.command("cursor_left")
    app.expect("#col[data-cursor]").toExist()

    // Navigate back to card for l test
    await app.command("cursor_down")
    app.expect("#task[data-cursor]").toExist()

    // l does nothing (no columns to right)
    await app.command("cursor_right")
    app.expect("#task[data-cursor]").toExist()
  })

  test("k stops at top boundary, j stops at bottom boundary", async () => {
    using app = createTestApp(item.simpleBoard())

    // --- k boundary: move up through column header to board title ---
    app.expect("#1a[data-cursor]").toExist()
    await app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()
    await app.command("cursor_up")
    app.expect("#board[data-cursor]").toExist()

    // Try k multiple times - should stay at board
    await app.command("cursor_up")
    app.expect("#board[data-cursor]").toExist()
    await app.command("cursor_up")
    app.expect("#board[data-cursor]").toExist()
    await app.command("cursor_up")
    app.expect("#board[data-cursor]").toExist()

    // --- j boundary: navigate down to last card ---
    await app.command("cursor_down") // board → col1
    await app.command("cursor_down") // col1 → 1a
    await app.command("cursor_down") // 1a → 1b
    await app.command("cursor_down") // 1b → 1c
    app.expect("#1c[data-cursor]").toExist()

    // Try j multiple times - should stay at 1c
    await app.command("cursor_down")
    app.expect("#1c[data-cursor]").toExist()
    await app.command("cursor_down")
    app.expect("#1c[data-cursor]").toExist()
    await app.command("cursor_down")
    app.expect("#1c[data-cursor]").toExist()
  })

  test("h stops at left boundary, l stops at right boundary", async () => {
    using app = createTestApp(item.multiColBoard())

    // --- h boundary: navigate right then back to left edge ---
    app.expect("#1a[data-cursor]").toExist()
    await app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()
    await app.command("cursor_left")
    app.expect("#1a[data-cursor]").toExist()

    // h at leftmost card goes to column header
    await app.command("cursor_left")
    app.expect("#col1[data-cursor]").toExist()

    // h at column header boundary stays
    await app.command("cursor_left")
    app.expect("#col1[data-cursor]").toExist()
    await app.command("cursor_left")
    app.expect("#col1[data-cursor]").toExist()

    // --- l boundary: navigate right from column header goes to next column header ---
    await app.command("cursor_right")
    app.expect("#col2[data-cursor]").toExist()
    await app.command("cursor_right")
    app.expect("#col3[data-cursor]").toExist()

    // Try l multiple times at rightmost header - should stay at col3
    await app.command("cursor_right")
    app.expect("#col3[data-cursor]").toExist()
    await app.command("cursor_right")
    app.expect("#col3[data-cursor]").toExist()
    await app.command("cursor_right")
    app.expect("#col3[data-cursor]").toExist()
  })

  test("g does nothing at first card", async () => {
    using app = createTestApp(item("board", item("col", item("1a"), item("1b"), item("1c"))))
    app.expect("#1a[data-cursor]").toExist()
    await app.press("g")
    app.expect("#1a[data-cursor]").toExist()
  })

  test("g G does nothing at last card", async () => {
    using app = createTestApp(item("board", item("col", item("1a"), item("1b"), item("1c"))))
    await app.command("cursor_last")
    app.expect("#1c[data-cursor]").toExist()
    await app.command("cursor_last")
    app.expect("#1c[data-cursor]").toExist()
  })

  // Keys that should do nothing in specific contexts
  describe("no-op key boundaries", () => {
    test("Escape, [, ], z on column header do nothing on task card", async () => {
      using app = createTestApp(item("board", item("col", item("task"))))

      // Escape in board view
      app.expect("#task[data-cursor]").toExist()
      await app.press("\x1B")
      app.expect("#task[data-cursor]").toExist()

      // [ when no history
      await app.press("{")
      app.expect("#task[data-cursor]").toExist()

      // ] when no forward history
      await app.press("}")
      app.expect("#task[data-cursor]").toExist()

      // z on column header does nothing
      await app.command("cursor_up")
      app.expect("#col[data-cursor]").toExist()
      await app.command("fold_all_more")
      app.expect("#col[data-cursor]").toExist()
    })

    test("Enter and z do nothing on leaf card", async () => {
      using app = createTestApp(item("board", item("col", item("leaf"))))

      // Enter on card without children
      app.expect("#leaf[data-cursor]").toExist()
      await app.press("\r")
      app.expect("#leaf[data-cursor]").toExist()

      // z on card without children
      await app.command("fold_all_more")
      app.expect("#leaf[data-cursor]").toExist()
    })
  })
})

describe("Boundary Feedback (Bell + Status)", () => {
  // These tests use board.bell, board.hasStatus, board.getStatus(), and
  // board.q("[data-bell-flash]") which are not exposed by createTestApp.
  // They remain on testEnv until the bell/status API is added to TestApp.
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
    { key: "h", setup: ["h"], finalId: "#col1", desc: "h at left boundary (from column header)" },
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

    // h at leftmost card goes to column header, then h again hits boundary
    board.command("cursor_left") // 1a → col1 (column header)
    board.command("cursor_left") // col1 → boundary
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
    // Single card, single column — h goes to col header first, then boundary

    board.command("cursor_left") // 1a → col1 (column header)
    expect(board.bell).toBe(false) // not a boundary yet
    board.command("cursor_left") // col1 → boundary
    expect(board.bell).toBe(true)

    board.command("cursor_down") // clear bell, go to 1a
    board.command("cursor_right") // right boundary
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
  // These tests use board.click(x, y) which is not exposed by createTestApp.
  // They remain on testEnv until mouse events are added to TestApp.
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
// Outline nav (j/k inside a card's sub-items with depth-2+ descendants)
// =============================================================================

describe("Outline navigation with grandchildren", () => {
  // Uses board.click() which is not exposed by createTestApp — stays on testEnv.
  test("j/k traverse into grandchildren (depth 2+) when clicking sub-items", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Column",
            item("card", item("section-a", item("grandchild-1"), item("grandchild-2")), item("section-b")),
          ),
        ),
      { columns: 80, rows: 24 },
    )
    board.expect("#card[data-cursor]").toExist()

    // Click section-a to enter outline mode (cursor on sub-item, not card)
    const el = board.q("[id='section-a']")
    const box = el.boundingBox()!
    board.click(box.x + 1, box.y)
    board.expect("#section-a[data-cursor]").toExist()

    // j should navigate through grandchildren (depth 2+), not skip them
    board.command("cursor_down")
    board.expect("#grandchild-1[data-cursor]").toExist()

    board.command("cursor_down")
    board.expect("#grandchild-2[data-cursor]").toExist()

    // j from grandchild-2 → section-b (next sibling of section-a)
    board.command("cursor_down")
    board.expect("#section-b[data-cursor]").toExist()

    // k back through grandchildren
    board.command("cursor_up")
    board.expect("#grandchild-2[data-cursor]").toExist()

    board.command("cursor_up")
    board.expect("#grandchild-1[data-cursor]").toExist()

    board.command("cursor_up")
    board.expect("#section-a[data-cursor]").toExist()
  })
})

// =============================================================================
// Spatial block navigation (J/K — next/prev visible block in column)
// =============================================================================

describe("Spatial block navigation (J/K)", () => {
  test("J walks through all visible blocks in document order", async () => {
    using app = createTestApp(
      item("board", item("Column", item("card1", item("child1a"), item("child1b")), item("card2"))),
      { cols: 80, rows: 24 },
    )
    // Start at card1
    app.expect("#card1[data-cursor]").toExist()

    // J → next visible block: child1a
    await app.command("block_nav_down")
    app.expect("#child1a[data-cursor]").toExist()

    // J → child1b
    await app.command("block_nav_down")
    app.expect("#child1b[data-cursor]").toExist()

    // J → card2 (next card after card1's children)
    await app.command("block_nav_down")
    app.expect("#card2[data-cursor]").toExist()
  })

  test("K walks backward through visible blocks", async () => {
    using app = createTestApp(
      item("board", item("Column", item("card1", item("child1a"), item("child1b")), item("card2"))),
      { cols: 80, rows: 24 },
    )
    // Navigate to card2 via J
    await app.command("block_nav_down") // card1 → child1a
    await app.command("block_nav_down") // child1a → child1b
    await app.command("block_nav_down") // child1b → card2
    app.expect("#card2[data-cursor]").toExist()

    // K → child1b (previous visible block)
    await app.command("block_nav_up")
    app.expect("#child1b[data-cursor]").toExist()

    // K → child1a
    await app.command("block_nav_up")
    app.expect("#child1a[data-cursor]").toExist()

    // K → card1
    await app.command("block_nav_up")
    app.expect("#card1[data-cursor]").toExist()
  })

  test("J on leaf card moves to next card (no children to visit)", async () => {
    using app = createTestApp(item("board", item("Column", item("card1"), item("card2"))), {
      cols: 80,
      rows: 24,
    })
    app.expect("#card1[data-cursor]").toExist()

    // J on leaf → next card
    await app.command("block_nav_down")
    app.expect("#card2[data-cursor]").toExist()
  })

  test("K from first card moves to column header", async () => {
    using app = createTestApp(item("board", item("Column", item("card1"), item("card2"))), {
      cols: 80,
      rows: 24,
    })
    app.expect("#card1[data-cursor]").toExist()

    // K from first card → column header
    await app.command("block_nav_up")
    app.expect("#Column[data-cursor]").toExist()
  })

  test("J/K are strict inverses — full spatial journey", async () => {
    using app = createTestApp(
      item("board", item("Column", item("parent", item("child-a"), item("child-b")), item("sibling"))),
      { cols: 80, rows: 24 },
    )
    // Start at parent card
    app.expect("#parent[data-cursor]").toExist()

    // Walk forward through all blocks with J
    await app.command("block_nav_down") // parent → child-a
    app.expect("#child-a[data-cursor]").toExist()
    await app.command("block_nav_down") // child-a → child-b
    app.expect("#child-b[data-cursor]").toExist()
    await app.command("block_nav_down") // child-b → sibling
    app.expect("#sibling[data-cursor]").toExist()

    // J at last block → boundary (stays on sibling)
    await app.command("block_nav_down")
    app.expect("#sibling[data-cursor]").toExist()

    // Walk backward through all blocks with K (strict inverse)
    await app.command("block_nav_up") // sibling → child-b
    app.expect("#child-b[data-cursor]").toExist()
    await app.command("block_nav_up") // child-b → child-a
    app.expect("#child-a[data-cursor]").toExist()
    await app.command("block_nav_up") // child-a → parent
    app.expect("#parent[data-cursor]").toExist()
    await app.command("block_nav_up") // parent → Column header
    app.expect("#Column[data-cursor]").toExist()

    // K at column header → boundary (stays on Column)
    await app.command("block_nav_up")
    app.expect("#Column[data-cursor]").toExist()
  })

  test("J/K with nested children traverses in DFS order", async () => {
    using app = createTestApp(
      item("board", item("Column", item("card", item("child-1"), item("child-2"), item("child-3")))),
      { cols: 80, rows: 24 },
    )
    app.expect("#card[data-cursor]").toExist()

    // J walks forward in DFS order
    await app.command("block_nav_down") // card → child-1
    app.expect("#child-1[data-cursor]").toExist()
    await app.command("block_nav_down") // child-1 → child-2
    app.expect("#child-2[data-cursor]").toExist()
    await app.command("block_nav_down") // child-2 → child-3
    app.expect("#child-3[data-cursor]").toExist()

    // J at last block → boundary
    await app.command("block_nav_down")
    app.expect("#child-3[data-cursor]").toExist()

    // K walks backward (strict inverse)
    await app.command("block_nav_up") // child-3 → child-2
    app.expect("#child-2[data-cursor]").toExist()
    await app.command("block_nav_up") // child-2 → child-1
    app.expect("#child-1[data-cursor]").toExist()
    await app.command("block_nav_up") // child-1 → card
    app.expect("#card[data-cursor]").toExist()
  })

  test("J traverses into grandchildren (depth 2+) when visible", async () => {
    using app = createTestApp(
      item(
        "board",
        item(
          "Column",
          item("card", item("section-a", item("grandchild-1"), item("grandchild-2")), item("section-b")),
        ),
      ),
      { cols: 80, rows: 24 },
    )
    app.expect("#card[data-cursor]").toExist()

    await app.command("block_nav_down") // card → section-a
    app.expect("#section-a[data-cursor]").toExist()

    await app.command("block_nav_down") // section-a → grandchild-1 (NOT section-b)
    app.expect("#grandchild-1[data-cursor]").toExist()

    await app.command("block_nav_down") // grandchild-1 → grandchild-2
    app.expect("#grandchild-2[data-cursor]").toExist()

    await app.command("block_nav_down") // grandchild-2 → section-b
    app.expect("#section-b[data-cursor]").toExist()
  })
})
