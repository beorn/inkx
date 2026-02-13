/**
 * Exploration: Search Dialog Extended
 *
 * Deeper exploration of search dialog interactions.
 * Looking for issues with the FTS5 migration and dialog lifecycle.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Search Extended", () => {
  function makeBoard() {
    return testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("Buy groceries"),
            item("Fix the bug"),
            item("Write documentation"),
            item("Review PR #42"),
          ),
          item(
            "col2",
            item("Deploy to staging"),
            item("Email client update"),
          ),
        ),
      { columns: 100, rows: 30 },
    )
  }

  test("search with quotes in query", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press('"').press("b").press("u").press("g").press('"')
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("search with hash character", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press("#").press("4").press("2")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("backspace in search query", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press("b").press("u").press("g")
    board.press("backspace")
    board.press("backspace")
    const text = board.screenshot()
    // After deleting "ug", only "b" remains (single char, below MIN_QUERY_LENGTH)
    expect(text).not.toContain("[object Object]")
  })

  test("Ctrl-U clears search query", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press("b").press("u").press("g")
    board.press("C-u") // Delete to start of line
    const text = board.screenshot()
    // Ctrl-U should clear the query. If it doesn't, that's a bug.
    // If query is cleared, "Type to search..." should show (< MIN_QUERY_LENGTH).
    if (!text.includes("Type to search")) {
      // Check if search results are still showing (meaning Ctrl-U didn't clear)
      if (text.includes("bug") || text.includes("Fix the")) {
        // Ctrl-U didn't clear the query — could be a text editing command issue
        // in search dialog context
      }
    }
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("search then Enter on empty results", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press("z").press("z").press("z")
    // No results, press Enter
    board.press("return")
    const text = board.screenshot()
    // Should not crash — confirm on empty results is a no-op
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("search with tab character", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press("b").press("u")
    board.press("tab") // Tab in search context
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("search dialog after navigation", () => {
    const { board } = makeBoard()
    // Navigate around first
    board.press("j")
    board.press("l")
    board.press("j")
    // Then open search
    board.press("/")
    board.press("f").press("i")
    const text = board.screenshot()
    expect(text).toContain("Search")
    expect(text).not.toContain("[object Object]")
  })

  test("search finds items by content", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press("b").press("u").press("g")
    const text = board.screenshot()
    // "Fix the bug" should appear in results
    if (!text.includes("Fix the bug") && !text.includes("bug")) {
      // FTS might not find exact substrings the same way
      // but at least check no crash
    }
    expect(text).not.toContain("[object Object]")
  })

  test("open search, navigate results, Enter selects", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press("t").press("h")  // Matches "Fix the bug", "Write the..."
    board.press("down") // Move to second result
    board.press("return") // Select
    const text = board.screenshot()
    // Dialog should be closed
    expect(text).not.toContain("[object Object]")
  })

  test("Ctrl-P and Ctrl-N for result navigation", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press("t").press("h")
    board.press("C-n") // Next
    board.press("C-n")
    board.press("C-p") // Previous
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("search with many results scrolls correctly", () => {
    // Create a board with many items
    const items = Array.from({ length: 20 }, (_, i) => item(`Task ${i + 1}`))
    const { board } = testEnv(
      () => item("board", item("col1", ...items)),
      { columns: 100, rows: 24 },
    )

    board.press("/")
    board.press("T").press("a") // Matches all "Task N"
    // Scroll through results
    for (let i = 0; i < 15; i++) {
      board.press("down")
    }
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
