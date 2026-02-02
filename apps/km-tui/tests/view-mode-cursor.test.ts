/**
 * View Mode Cursor Consistency Tests
 *
 * Verifies that exactly one cursor element exists across all view modes.
 * Bug discovered via /explore - COLUMNS, LIST, TABS modes had 2 cursor elements.
 * Fixed by removing redundant data-cursor from CardLayoutTracker.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("view mode cursor consistency", () => {
  test("should have exactly 1 cursor in CARDS view", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a")),
        ),
      { viewMode: "cards" },
    )

    const cursorCount = board.q("[data-cursor]").count()
    expect(cursorCount).toBe(1)
  })

  test("should have exactly 1 cursor in COLUMNS view", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a")),
        ),
      { viewMode: "columns" },
    )

    const cursorCount = board.q("[data-cursor]").count()
    expect(cursorCount).toBe(1)
  })

  test("should have exactly 1 cursor in LIST view", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a")),
        ),
      { viewMode: "list" },
    )

    const cursorCount = board.q("[data-cursor]").count()
    expect(cursorCount).toBe(1)
  })

  test("should have exactly 1 cursor in TABS view", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a")),
        ),
      { viewMode: "tabs" },
    )

    const cursorCount = board.q("[data-cursor]").count()
    expect(cursorCount).toBe(1)
  })

  test("should maintain single cursor after switching view modes", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    )

    // Start in CARDS
    expect(board.q("[data-cursor]").count()).toBe(1)

    // Switch to COLUMNS
    board.press("v")
    expect(board.q("[data-cursor]").count()).toBe(1)

    // Switch to LIST
    board.press("v")
    expect(board.q("[data-cursor]").count()).toBe(1)

    // Switch to TABS
    board.press("v")
    expect(board.q("[data-cursor]").count()).toBe(1)

    // Back to CARDS
    board.press("v")
    expect(board.q("[data-cursor]").count()).toBe(1)
  })
})
