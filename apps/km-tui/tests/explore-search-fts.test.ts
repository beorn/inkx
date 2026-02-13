/**
 * Exploration: Search Dialog with FTS5
 *
 * Tests the SearchDialog opened via "/" key, which now uses repo.search()
 * (FTS5 in production, simple string match in fake repo).
 * Exercises: open/close, typing queries, result navigation, edge cases.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Search FTS", () => {
  function makeBoard() {
    return testEnv(
      () =>
        item(
          "board",
          item("col1", item("Alpha task"), item("Beta testing"), item("Gamma ray")),
          item("col2", item("Delta force"), item("Epsilon value")),
        ),
      { columns: 100, rows: 30 },
    )
  }

  test("open search dialog with /", () => {
    const { board } = makeBoard()
    board.press("/")
    const text = board.screenshot()
    // Search dialog should be visible
    expect(text).toContain("Search")
    // Check for no garbage
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(text).not.toContain("undefined")
  })

  test("close search dialog with Escape", () => {
    const { board } = makeBoard()
    board.press("/")
    expect(board.screenshot()).toContain("Search")
    board.press("escape")
    const text = board.screenshot()
    // Dialog should be dismissed after Escape
    // BUG? If dialog is still showing, Escape might be intercepted by toast.dismiss
    // or text.exit_edit before reaching dialog.cancel
    if (text.includes("Type to search") || text.includes("Search")) {
      // Check if it's showing a dialog-like thing
      const hasSearchBox = board.q('[data-dialog="search"]').count() > 0
      if (hasSearchBox) {
        // This IS a bug: Escape doesn't close the search dialog
        expect.fail(
          "BUG: Escape did not close the search dialog. " +
          "The dialog is still visible after pressing Escape."
        )
      }
    }
    expect(text).not.toContain("[object Object]")
  })

  test("type query and see results", () => {
    const { board } = makeBoard()
    board.press("/")
    // Type a 2+ char query to trigger search
    board.press("a").press("l")
    const text = board.screenshot()
    // "Alpha" and "Delta" and "Epsilon value" contain "al"
    // At minimum, no crash and no garbage
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("single char shows 'type more' message", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press("a")
    const text = board.screenshot()
    // MIN_QUERY_LENGTH is 2, so single char should show prompt
    expect(text).toContain("more char")
  })

  test("empty query shows 'Type to search'", () => {
    const { board } = makeBoard()
    board.press("/")
    const text = board.screenshot()
    expect(text).toContain("Type to search")
  })

  test("no results for unmatched query", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press("z").press("z").press("z")
    const text = board.screenshot()
    expect(text).toContain("No matching")
    expect(text).not.toContain("[object Object]")
  })

  test("navigate results with j/k (up/down)", () => {
    const { board } = makeBoard()
    board.press("/")
    // Type query that matches multiple items
    board.press("t").press("a")
    // Navigate down
    board.press("down")
    board.press("down")
    // Should not crash
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("confirm search result with Enter", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press("a").press("l")
    board.press("return")
    // Dialog should close
    const text = board.screenshot()
    // Search dialog should be dismissed
    expect(text).not.toContain("Type to search")
    expect(text).not.toContain("[object Object]")
  })

  test("special characters in query don't crash", () => {
    const { board } = makeBoard()
    board.press("/")
    // Type special chars that might break FTS5 syntax
    board.press("(").press(")")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("very long query doesn't crash", () => {
    const { board } = makeBoard()
    board.press("/")
    const longQuery = "abcdefghijklmnopqrstuvwxyz"
    for (const ch of longQuery) {
      board.press(ch)
    }
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("search with asterisk wildcard", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press("a").press("l").press("*")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("rapid open/close/reopen doesn't crash", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press("escape")
    board.press("/")
    board.press("escape")
    board.press("/")
    board.press("t").press("e")
    const text = board.screenshot()
    expect(text).toContain("Search")
    expect(text).not.toContain("[object Object]")
  })

  test("navigate past end of results wraps or stops gracefully", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press("a").press("l")
    // Press down many times past the result count
    for (let i = 0; i < 20; i++) {
      board.press("down")
    }
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("navigate up from top doesn't crash", () => {
    const { board } = makeBoard()
    board.press("/")
    board.press("a").press("l")
    // Press up many times at top
    for (let i = 0; i < 10; i++) {
      board.press("up")
    }
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
