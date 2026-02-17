/**
 * Tests for SearchDialog component
 */
import { describe, test, expect } from "vitest"
import { fuzzyMatch, fuzzyScore, extractTags } from "../src/views/search-utils.ts"
import { testEnv, item } from "./helpers/board-test.ts"

describe("fuzzyMatch", () => {
  test("matches exact string", () => {
    expect(fuzzyMatch("test", "test")).toBe(true)
  })

  test("matches characters in order", () => {
    expect(fuzzyMatch("tst", "test")).toBe(true)
  })

  test("matches characters with gaps", () => {
    expect(fuzzyMatch("tk", "task")).toBe(true)
  })

  test("is case-insensitive", () => {
    expect(fuzzyMatch("TeSt", "test")).toBe(true)
    expect(fuzzyMatch("test", "TEST")).toBe(true)
  })

  test("does not match out-of-order characters", () => {
    expect(fuzzyMatch("tse", "test")).toBe(false)
  })

  test("does not match missing characters", () => {
    expect(fuzzyMatch("xyz", "test")).toBe(false)
  })

  test("matches empty query", () => {
    expect(fuzzyMatch("", "test")).toBe(true)
  })
})

describe("fuzzyScore", () => {
  test("scores exact match higher than partial", () => {
    const exactScore = fuzzyScore("test", "test")
    const partialScore = fuzzyScore("test", "testing")
    expect(exactScore).toBeGreaterThan(partialScore)
  })

  test("scores consecutive matches with bonus", () => {
    // Consecutive matches get bonus points (consecutive * 2 per match)
    // This test verifies the algorithm works correctly, not comparing absolute scores
    const score = fuzzyScore("abc", "abcdef")
    expect(score).toBeGreaterThan(0) // Valid match
    // Consecutive bonus: a=2, b=4, c=6 = 12 points from consecutive
    // Plus start bonus: 10 points
    // Minus length penalty: 6 * 0.1 = 0.6
    // Expected approximately: 12 + 10 - 0.6 = 21.4
    expect(score).toBeGreaterThan(20)
  })

  test("scores start matches higher", () => {
    const startScore = fuzzyScore("te", "test")
    const middleScore = fuzzyScore("st", "test")
    expect(startScore).toBeGreaterThan(middleScore)
  })

  test("returns -1 for non-match", () => {
    expect(fuzzyScore("xyz", "test")).toBe(-1)
  })

  test("prefers shorter targets", () => {
    const shortScore = fuzzyScore("t", "task")
    const longScore = fuzzyScore("t", "task with long description")
    expect(shortScore).toBeGreaterThan(longScore)
  })
})

describe("extractTags", () => {
  test("extracts single tag", () => {
    expect(extractTags("This is #urgent")).toEqual(["urgent"])
  })

  test("extracts multiple tags", () => {
    expect(extractTags("This is #urgent and #blocked")).toEqual(["urgent", "blocked"])
  })

  test("handles no tags", () => {
    expect(extractTags("No tags here")).toEqual([])
  })

  test("handles undefined content", () => {
    expect(extractTags(undefined)).toEqual([])
  })

  test("handles tags with numbers", () => {
    expect(extractTags("Tagged with #p1 and #tag2")).toEqual(["p1", "tag2"])
  })

  test("handles tags at start", () => {
    expect(extractTags("#urgent task description")).toEqual(["urgent"])
  })

  test("handles multiple consecutive tags", () => {
    expect(extractTags("#urgent #blocked #p1")).toEqual(["urgent", "blocked", "p1"])
  })

  test("does not extract # without word", () => {
    expect(extractTags("Just a # symbol")).toEqual([])
  })

  test("extracts only word characters after #", () => {
    expect(extractTags("#tag-with-dash")).toEqual(["tag"])
  })
})

// ---------------------------------------------------------------------------
// Search dialog bugs (from search-bugs.spec.ts)
// ---------------------------------------------------------------------------

describe("Search dialog bugs", () => {
  describe("km-tui.2: [2 after backspace", () => {
    test("backspacing to empty shows placeholder, not [2", () => {
      const { board } = testEnv(() => item("board", item("col", item("alpha"), item("beta"))))

      // Open search and type
      board.press("/")
      board.press("a")
      board.press("b")

      // Verify we have "ab" in input
      let output = board.screenshot()
      expect(output).toContain("ab")

      // Backspace twice to empty
      board.press("Backspace")
      board.press("Backspace")

      output = board.screenshot()

      // Should NOT contain [2
      expect(output).not.toContain("[2")

      // Should show placeholder or empty input area
      // The dialog should still be open with "Search" title
      expect(output).toContain("Search")
    })

    test("rapid backspace doesn't leave artifacts", () => {
      const { board } = testEnv(() => item("board", item("col", item("test"))))

      board.press("/")
      board.press("t")
      board.press("e")
      board.press("s")
      board.press("t")

      // Rapid backspace
      board.press("Backspace")
      board.press("Backspace")
      board.press("Backspace")
      board.press("Backspace")

      const output = board.screenshot()

      // Should not have any escape sequence fragments
      expect(output).not.toContain("[2")
      expect(output).not.toContain("[A")
      expect(output).not.toContain("[B")
    })
  })

  describe("km-tui.3: title visibility during loading", () => {
    test("Search title remains visible with results", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item(
              "col",
              item("Task Alpha"),
              item("Task Beta"),
              item("Task Gamma"),
              item("Task Delta"),
              item("Task Epsilon"),
            ),
          ),
        { rows: 20 }, // Smaller terminal
      )

      board.press("/")
      board.press("T")
      board.press("a")

      const output = board.screenshot()

      // Title should always be visible
      expect(output).toContain("Search")

      // Input should be visible (either the typed text or placeholder)
      expect(output).toMatch(/Ta|type to search/)
    })
  })
})

// ---------------------------------------------------------------------------
// Escape closes search dialog (from search-escape-close.test.ts)
// ---------------------------------------------------------------------------

describe("Bug: Escape does not close search dialog (km-h9p52)", () => {
  function makeEscapeTestBoard() {
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

  test("pressing Escape closes the search dialog", () => {
    const { board } = makeEscapeTestBoard()

    // Open search dialog
    board.press("/")
    expect(board.q('[data-dialog="search"]').count()).toBeGreaterThan(0)

    // Press Escape to close
    board.press("Escape")

    // Search dialog should be gone
    expect(board.q('[data-dialog="search"]').count()).toBe(0)
  })

  test("pressing Escape closes search dialog after typing a query", () => {
    const { board } = makeEscapeTestBoard()

    // Open search, type a query
    board.press("/")
    board.press("a").press("l")
    expect(board.q('[data-dialog="search"]').count()).toBeGreaterThan(0)

    // Press Escape to close
    board.press("Escape")

    // Search dialog should be gone
    expect(board.q('[data-dialog="search"]').count()).toBe(0)
  })

  test("board is navigable after closing search with Escape", () => {
    const { board } = makeEscapeTestBoard()

    // Open and close search
    board.press("/")
    board.press("Escape")

    // Should be able to navigate normally
    board.press("j")
    const text = board.screenshot()
    // Board content should be visible, not a dialog
    expect(text).not.toContain("Type to search")
  })
})

// ---------------------------------------------------------------------------
// Search scope feature (from search-scope.test.ts)
// ---------------------------------------------------------------------------

function makeScopeBoard() {
  return testEnv(
    () =>
      item(
        "board",
        item(
          "col1",
          item("Alpha project", item("Alpha subtask one"), item("Alpha subtask two")),
          item("Beta project"),
        ),
        item("col2", item("Gamma project"), item("Delta project")),
      ),
    { columns: 100, rows: 30 },
  )
}

/** Get only the text rendered inside the search dialog overlay */
function scopeDialogText(board: ReturnType<typeof testEnv>["board"]): string {
  return board.q('[data-dialog="search"]').textContent()
}

describe("Search scope: UI toggle", () => {
  test("search dialog opens with 'All' scope by default", () => {
    const { board } = makeScopeBoard()
    board.press("/")
    const text = scopeDialogText(board)
    // Scope prompt: "All > "
    expect(text).toContain("All")
    // Footer has Tab hint
    expect(text).toContain("Tab")
  })

  test("Tab toggles scope between All and scoped, back to All", () => {
    const { board } = makeScopeBoard()
    board.press("/")

    // Initially "All > " prompt
    let text = scopeDialogText(board)
    expect(text).toContain("All")

    // Tab switches to scoped — prompt shows "in <node name> > "
    board.press("Tab")
    text = scopeDialogText(board)
    expect(text).toContain("in ")
    expect(text).toContain("search all") // Footer: "Tab search all"

    // Tab switches back to "All > "
    board.press("Tab")
    text = scopeDialogText(board)
    expect(text).toContain("All")
    expect(text).toContain("narrow") // Footer: "Tab narrow ..."
  })
})

describe("Search scope: result filtering", () => {
  test("'All' scope returns results from entire repo", () => {
    const { board } = makeScopeBoard()
    board.press("/")

    // Type a query that matches items in both columns
    // Note: "Alpha project" is a folder (has children), so it's excluded from search results.
    // Only leaf nodes (tasks) are searchable.
    board.press("p").press("r").press("o").press("j")
    const text = scopeDialogText(board)

    // Should find leaf items from both columns
    expect(text).toContain("Beta")
    expect(text).toContain("Gamma")
    expect(text).toContain("Delta")
  })

  test("'Subtree' scope restricts results to cursor node descendants", () => {
    const { board } = makeScopeBoard()

    // Cursor starts on first card ("Alpha project" which has children)
    // Open search, switch to Subtree scope
    board.press("/")
    board.press("Tab") // Switch to "Subtree" scope

    // Search for "subtask" — only Alpha project descendants should match
    board.press("s").press("u").press("b")
    const text = scopeDialogText(board)
    expect(text).toContain("Alpha subtask one")
    expect(text).toContain("Alpha subtask two")

    // Items from other columns/cards should NOT appear in dialog results
    expect(text).not.toContain("Beta")
    expect(text).not.toContain("Gamma")
    expect(text).not.toContain("Delta")
  })

  test("'Subtree' scope with query matching nothing in subtree shows no results", () => {
    const { board } = makeScopeBoard()

    // Cursor starts on "Alpha project"
    board.press("/")
    board.press("Tab") // Subtree scope

    // Search for "Delta" — not a descendant of Alpha
    board.press("D").press("e").press("l")
    const text = scopeDialogText(board)
    expect(text).toContain("No matching items")
  })

  test("switching scope re-filters results", () => {
    const { board } = makeScopeBoard()
    board.press("/")

    // Type query matching items across the board
    board.press("p").press("r").press("o").press("j")

    // In All scope, should see results from both columns
    let text = scopeDialogText(board)
    expect(text).toContain("Beta")
    expect(text).toContain("Gamma")
    expect(text).toContain("Delta")

    // Switch to Subtree scope (cursor is on Alpha project)
    // Alpha project descendants include Alpha subtask one/two but they don't match "proj"
    // Alpha project itself is a folder (skipped). So only Alpha's leaf descendants matching "proj" would show.
    board.press("Tab")
    text = scopeDialogText(board)

    // Gamma/Delta are not descendants of Alpha, should not appear in dialog results
    expect(text).not.toContain("Gamma")
    expect(text).not.toContain("Delta")
  })
})

describe("Search scope: scope node capture", () => {
  test("scope uses cursor node when search opens", () => {
    const { board } = makeScopeBoard()

    // Move cursor to second card (Beta project)
    board.press("j")

    // Open search with Subtree scope
    board.press("/")
    board.press("Tab")

    // Search for "project" — only Beta should match (it has no descendants with "project")
    board.press("p").press("r").press("o").press("j")
    const text = scopeDialogText(board)
    expect(text).toContain("Beta")
    // Alpha is not a descendant of Beta — should not appear in dialog results
    expect(text).not.toContain("Alpha project")
    expect(text).not.toContain("Gamma")
  })
})
