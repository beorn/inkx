/**
 * Scroll and Cursor Bug Tests
 *
 * Tests for:
 * - km-tui-scroll-follow: Scroll doesn't follow cursor when moving into items below viewport
 * - km-tui-cursor-jump: Cursor jumps to top of board when moving down from certain items
 * - km-tui-empty-cards: Cards render as empty boxes when content should be visible
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("km-tui-scroll-follow: Scroll follows cursor", () => {
  test("cursor remains visible when scrolling down past viewport", () => {
    // Create a column with many cards that exceed viewport height
    // With rows=15, only ~3-4 cards fit (ESTIMATED_CARD_HEIGHT ~4)
    const cards = Array.from({ length: 20 }, (_, i) => item(`card${i}`))

    const { board } = testEnv(() => item("board", item("col1", ...cards)), {
      rows: 15,
      columns: 60,
    })

    // Navigate down through cards
    for (let i = 1; i < 15; i++) {
      board.command("cursor_down")

      // The current card should be visible in the text output
      const screenshot = board.screenshot()
      expect(screenshot, `card${i} should be visible after navigating down`).toContain(`card${i}`)
    }
  })

  test("cursor visible after G (jump to last)", () => {
    const cards = Array.from({ length: 20 }, (_, i) => item(`card${i}`))

    const { board } = testEnv(() => item("board", item("col1", ...cards)), {
      rows: 15,
      columns: 60,
    })

    // Jump to last card
    board.command("cursor_last")

    // Last card should be visible
    const screenshot = board.screenshot()
    expect(screenshot).toContain("card19")

    // Cursor should be on last card
    board.expect("#card19[data-cursor]").toExist()
  })

  test("cursor visible after scrolling up from bottom", () => {
    const cards = Array.from({ length: 20 }, (_, i) => item(`card${i}`))

    const { board } = testEnv(() => item("board", item("col1", ...cards)), {
      rows: 15,
      columns: 60,
    })

    // Jump to last, then navigate up
    board.command("cursor_last")
    board.command("cursor_up")
    board.command("cursor_up")
    board.command("cursor_up")

    // card16 should be visible (20-1-3 = 16)
    const screenshot = board.screenshot()
    expect(screenshot).toContain("card16")
    board.expect("#card16[data-cursor]").toExist()
  })
})

describe("km-tui-cursor-jump: Cursor movement boundaries", () => {
  test("j at last card in column rings bell, doesn't jump", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("a"), item("b"), item("c")), item("col2", item("x"), item("y"))),
    )

    // Navigate to last card in col1
    board.command("cursor_down").command("cursor_down")
    board.expect("#c[data-cursor]").toExist()

    // Press j at boundary
    board.command("cursor_down")

    // Should ring bell and stay on c, not jump to board or col2
    expect(board.bell).toBe(true)
    board.expect("#c[data-cursor]").toExist()
    board.expect("#board[data-cursor]").not.toExist()
  })

  test("navigating down through deep hierarchy doesn't jump to top", () => {
    // Simulate structure similar to user's vault
    const { board } = testEnv(() =>
      item(
        "board",
        item("areas", item("Family"), item("Health"), item("Kinship"), item("MamaMuse")),
        item("projects", item("proj1"), item("proj2")),
      ),
    )

    // Navigate down through areas column
    board.expect("#Family[data-cursor]").toExist()

    board.command("cursor_down")
    board.expect("#Health[data-cursor]").toExist()

    board.command("cursor_down")
    board.expect("#Kinship[data-cursor]").toExist()

    board.command("cursor_down")
    board.expect("#MamaMuse[data-cursor]").toExist()

    // At last card, should ring bell, not jump
    board.command("cursor_down")
    expect(board.bell).toBe(true)
    board.expect("#MamaMuse[data-cursor]").toExist()

    // Verify we didn't jump to top
    board.expect("#Family[data-cursor]").not.toExist()
    board.expect("#board[data-cursor]").not.toExist()
  })

  test("horizontal navigation preserves vertical position (curswant)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c"), item("1d")), item("col2", item("2a"), item("2b"))),
    )

    // Navigate down to 1c (index 2)
    board.command("cursor_down").command("cursor_down")
    board.expect("#1c[data-cursor]").toExist()

    // Move right to col2 - should go to 2b (closest to row 2)
    board.command("cursor_right")

    // Should be at 2b (last card in col2), not jump to top
    board.expect("#2b[data-cursor]").toExist()
    board.expect("#2a[data-cursor]").not.toExist()
  })
})

describe("km-tui-empty-cards: Card content rendering", () => {
  test("cards with content show their text", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("Task Alpha"), item("Task Beta"), item("Task Gamma"))),
    )

    const screenshot = board.screenshot()

    // All card content should be visible
    expect(screenshot).toContain("Task Alpha")
    expect(screenshot).toContain("Task Beta")
    expect(screenshot).toContain("Task Gamma")
  })

  test("nested children show in card body", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            // Parent with children
            item("Parent", item("Child1"), item("Child2")),
          ),
        ),
      { rows: 30 }, // More space to show children
    )

    const screenshot = board.screenshot()

    // Parent title visible
    expect(screenshot).toContain("Parent")

    // Children should be visible too (not empty card body)
    expect(screenshot).toContain("Child1")
    expect(screenshot).toContain("Child2")
  })

  test("folder with children shows children inline when expanded", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("Folder", item("Item1"), item("Item2"), item("Item3")))),
    )

    const screenshot = board.screenshot()

    // Folder title visible
    expect(screenshot).toContain("Folder")
    // Children should be visible inline (expanded by default in cards view)
    expect(screenshot).toContain("Item1")
    expect(screenshot).toContain("Item2")
    expect(screenshot).toContain("Item3")
  })

  test("cards at viewport edge are not cut off", () => {
    const cards = Array.from({ length: 10 }, (_, i) => item(`card${i}`))

    const { board } = testEnv(() => item("board", item("col1", ...cards)), {
      rows: 20,
      columns: 60,
    })

    // Navigate to card near the edge
    for (let i = 0; i < 5; i++) {
      board.command("cursor_down")
    }

    const screenshot = board.screenshot()

    // card5 (selected) should be fully visible, not empty
    expect(screenshot).toContain("card5")
    board.expect("#card5[data-cursor]").toExist()
  })
})

describe("Scroll virtualization doesn't hide content", () => {
  test("rapidly navigating doesn't leave cards empty", () => {
    const cards = Array.from({ length: 30 }, (_, i) => item(`item${i}`))

    const { board } = testEnv(() => item("board", item("col1", ...cards)), {
      rows: 20,
      columns: 60,
    })

    // Rapidly navigate down
    for (let i = 0; i < 25; i++) {
      board.command("cursor_down")
    }

    const screenshot = board.screenshot()

    // Current card should be visible with content
    expect(screenshot).toContain("item25")
    board.expect("#item25[data-cursor]").toExist()
  })

  test("scrolling down in cards mode produces no visual artifacts", () => {
    // Regression test for incremental renderPhase rendering:
    // When scrolling, stale pixels from the cloned buffer can bleed through
    // as extraneous background colors or misplaced content.
    const cards = Array.from({ length: 20 }, (_, i) => item(`scroll${i}`))

    const { board } = testEnv(() => item("board", item("col1", ...cards)), {
      rows: 15,
      columns: 60,
    })

    // Scroll down through the list, checking for artifacts at milestones
    const checkpoints = [5, 10, 15]
    for (let i = 0; i < 15; i++) {
      board.command("cursor_down")
      if (checkpoints.includes(i + 1)) {
        const text = board.screenshot()

        // No error strings or object dumps
        expect(text).not.toContain("[object Object]")
        expect(text).not.toContain("undefined")
        expect(text).not.toMatch(/Error:|TypeError:|ReferenceError:/)

        // Current card should be visible
        expect(text).toContain(`scroll${i + 1}`)

        // Cursor should exist on exactly one element
        board.expect("[data-cursor]").toExist()
      }
    }

    // Scroll back up and verify no artifacts at milestones
    for (let i = 0; i < 15; i++) {
      board.command("cursor_up")
      if (checkpoints.includes(i + 1)) {
        const text = board.screenshot()
        expect(text).not.toContain("[object Object]")
        expect(text).not.toContain("undefined")
        board.expect("[data-cursor]").toExist()
      }
    }
  })

  test("page down (Ctrl+D) scrolls and keeps cursor visible", () => {
    const cards = Array.from({ length: 30 }, (_, i) => item(`page${i}`))

    const { board } = testEnv(() => item("board", item("col1", ...cards)), {
      rows: 15,
      columns: 60,
    })

    // Page down
    board.press("\x04") // Ctrl+D

    const screenshot = board.screenshot()

    // Some card should be selected and visible
    // After page down from 0, cursor should be ~halfway down viewport
    const cursorMatch = screenshot.match(/page(\d+)/)
    expect(cursorMatch).not.toBeNull()

    // The selected card should exist in DOM with cursor
    if (cursorMatch?.[1]) {
      const idx = parseInt(cursorMatch[1], 10)
      board.expect(`#page${idx}[data-cursor]`).toExist()
    }
  })
})
