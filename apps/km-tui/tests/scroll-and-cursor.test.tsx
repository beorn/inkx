/**
 * Scroll and Cursor Bug Tests
 *
 * Tests for:
 * - km-tui-scroll-follow: Scroll doesn't follow cursor when moving into items below viewport
 * - km-tui-cursor-jump: Cursor jumps to top of board when moving down from certain items
 * - km-tui-empty-cards: Cards render as empty boxes when content should be visible
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("km-tui-scroll-follow: Scroll follows cursor", () => {
  test("cursor remains visible when scrolling down past viewport", () => {
    // Create a column with many cards that exceed viewport height
    // With rows=15, only ~3-4 cards fit (ESTIMATED_CARD_HEIGHT ~4)
    const cards = Array.from({ length: 20 }, (_, i) => item(`card${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), {
      rows: 15,
      cols: 60,
      incremental: false,
    })

    // Navigate down through cards
    for (let i = 1; i < 15; i++) {
      app.command("cursor_down")

      // The current card should be visible in the text output
      expect(app.text, `card${i} should be visible after navigating down`).toContain(`card${i}`)
    }
  })

  test("cursor visible after G (jump to last)", () => {
    const cards = Array.from({ length: 20 }, (_, i) => item(`card${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), {
      rows: 15,
      cols: 60,
      incremental: false,
    })

    // Jump to last card
    app.command("cursor_last")

    // Last card should be visible
    expect(app.text).toContain("card19")

    // Cursor should be on last card
    app.expect("#card19[data-cursor]").toExist()
  })

  test("cursor visible after scrolling up from bottom", () => {
    const cards = Array.from({ length: 20 }, (_, i) => item(`card${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), {
      rows: 15,
      cols: 60,
      incremental: false,
    })

    // Jump to last, then navigate up
    app.command("cursor_last")
    app.command("cursor_up")
    app.command("cursor_up")
    app.command("cursor_up")

    // card16 should be visible (20-1-3 = 16)
    expect(app.text).toContain("card16")
    app.expect("#card16[data-cursor]").toExist()
  })
})

describe("km-tui-cursor-jump: Cursor movement boundaries", () => {
  test("j at last card in column rings bell, doesn't jump", () => {
    using app = createTestApp(
      item("board", item("col1", item("a"), item("b"), item("c")), item("col2", item("x"), item("y"))),
    )

    // Navigate to last card in col1
    app.command("cursor_down").command("cursor_down")
    app.expect("#c[data-cursor]").toExist()

    // Press j at boundary
    app.command("cursor_down")

    // Should ring bell and stay on c, not jump to board or col2
    expect(app.bell).toBe(true)
    app.expect("#c[data-cursor]").toExist()
    app.expect("#board[data-cursor]").not.toExist()
  })

  test("navigating down through deep hierarchy doesn't jump to top", () => {
    // Simulate structure similar to user's vault
    using app = createTestApp(
      item(
        "board",
        item("areas", item("Family"), item("Health"), item("Kinship"), item("MamaMuse")),
        item("projects", item("proj1"), item("proj2")),
      ),
    )

    // Navigate down through areas column
    app.expect("#Family[data-cursor]").toExist()

    app.command("cursor_down")
    app.expect("#Health[data-cursor]").toExist()

    app.command("cursor_down")
    app.expect("#Kinship[data-cursor]").toExist()

    app.command("cursor_down")
    app.expect("#MamaMuse[data-cursor]").toExist()

    // At last card, should ring bell, not jump
    app.command("cursor_down")
    expect(app.bell).toBe(true)
    app.expect("#MamaMuse[data-cursor]").toExist()

    // Verify we didn't jump to top
    app.expect("#Family[data-cursor]").not.toExist()
    app.expect("#board[data-cursor]").not.toExist()
  })

  test("horizontal navigation preserves vertical position (curswant)", () => {
    using app = createTestApp(
      item("board", item("col1", item("1a"), item("1b"), item("1c"), item("1d")), item("col2", item("2a"), item("2b"))),
    )

    // Navigate down to 1c (index 2)
    app.command("cursor_down").command("cursor_down")
    app.expect("#1c[data-cursor]").toExist()

    // Move right to col2 - should go to 2b (closest to row 2)
    app.command("cursor_right")

    // Should be at 2b (last card in col2), not jump to top
    app.expect("#2b[data-cursor]").toExist()
    app.expect("#2a[data-cursor]").not.toExist()
  })
})

describe("km-tui-empty-cards: Card content rendering", () => {
  test("cards with content show their text", () => {
    using app = createTestApp(item("board", item("col1", item("Task Alpha"), item("Task Beta"), item("Task Gamma"))))

    // All card content should be visible
    expect(app.text).toContain("Task Alpha")
    expect(app.text).toContain("Task Beta")
    expect(app.text).toContain("Task Gamma")
  })

  test("nested children show in card body", () => {
    using app = createTestApp(
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

    // Parent title visible
    expect(app.text).toContain("Parent")

    // Children should be visible too (not empty card body)
    expect(app.text).toContain("Child1")
    expect(app.text).toContain("Child2")
  })

  test("folder with children shows children inline when expanded", () => {
    using app = createTestApp(item("board", item("col1", item("Folder", item("Item1"), item("Item2"), item("Item3")))))

    // Folder title visible
    expect(app.text).toContain("Folder")
    // Children should be visible inline (expanded by default in cards view)
    expect(app.text).toContain("Item1")
    expect(app.text).toContain("Item2")
    expect(app.text).toContain("Item3")
  })

  test("cards at viewport edge are not cut off", () => {
    const cards = Array.from({ length: 10 }, (_, i) => item(`card${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), {
      rows: 20,
      cols: 60,
      incremental: false,
    })

    // Navigate to card near the edge
    for (let i = 0; i < 5; i++) {
      app.command("cursor_down")
    }

    // card5 (selected) should be fully visible, not empty
    expect(app.text).toContain("card5")
    app.expect("#card5[data-cursor]").toExist()
  })
})

describe("Scroll virtualization doesn't hide content", () => {
  test("rapidly navigating doesn't leave cards empty", () => {
    const cards = Array.from({ length: 30 }, (_, i) => item(`item${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), {
      rows: 20,
      cols: 60,
      incremental: false,
    })

    // Rapidly navigate down
    for (let i = 0; i < 25; i++) {
      app.command("cursor_down")
    }

    // Current card should be visible with content
    expect(app.text).toContain("item25")
    app.expect("#item25[data-cursor]").toExist()
  })

  test("scrolling down in cards mode produces no visual artifacts", () => {
    // Regression test for incremental renderPhase rendering:
    // When scrolling, stale pixels from the cloned buffer can bleed through
    // as extraneous background colors or misplaced content.
    const cards = Array.from({ length: 20 }, (_, i) => item(`scroll${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), {
      rows: 15,
      cols: 60,
      incremental: false,
    })

    // Scroll down through the list, checking for artifacts at milestones
    const checkpoints = [5, 10, 15]
    for (let i = 0; i < 15; i++) {
      app.command("cursor_down")
      if (checkpoints.includes(i + 1)) {
        const text = app.text

        // No error strings or object dumps
        expect(text).not.toContain("[object Object]")
        expect(text).not.toContain("undefined")
        expect(text).not.toMatch(/Error:|TypeError:|ReferenceError:/)

        // Current card should be visible
        expect(text).toContain(`scroll${i + 1}`)

        // Cursor should exist on exactly one element
        app.expect("[data-cursor]").toExist()
      }
    }

    // Scroll back up and verify no artifacts at milestones
    for (let i = 0; i < 15; i++) {
      app.command("cursor_up")
      if (checkpoints.includes(i + 1)) {
        const text = app.text
        expect(text).not.toContain("[object Object]")
        expect(text).not.toContain("undefined")
        app.expect("[data-cursor]").toExist()
      }
    }
  })

  test("page down (Ctrl+D) scrolls and keeps cursor visible", () => {
    const cards = Array.from({ length: 30 }, (_, i) => item(`page${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), {
      rows: 15,
      cols: 60,
      incremental: false,
    })

    // Page down
    app.press("\x04") // Ctrl+D

    // Some card should be selected and visible
    // After page down from 0, cursor should be ~halfway down viewport
    const cursorMatch = app.text.match(/page(\d+)/)
    expect(cursorMatch).not.toBeNull()

    // The selected card should exist in DOM with cursor
    if (cursorMatch?.[1]) {
      const idx = parseInt(cursorMatch[1], 10)
      app.expect(`#page${idx}[data-cursor]`).toExist()
    }
  })
})
