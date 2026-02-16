/**
 * Tests for search scope feature (km-tui.search-scope)
 *
 * Search dialog should support two scopes:
 * 1. "all" — search entire repo (current default behavior)
 * 2. "selected" — search only cursor node and its descendants
 *
 * Tab toggles between scopes. The scope indicator appears in the dialog footer.
 */
import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

function makeBoard() {
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
function dialogText(board: ReturnType<typeof testEnv>["board"]): string {
  return board.q('[data-dialog="search"]').textContent()
}

describe("Search scope: UI toggle", () => {
  test("search dialog opens with 'All' scope by default", () => {
    const { board } = makeBoard()
    board.press("/")
    const text = dialogText(board)
    expect(text).toContain("All")
    expect(text).toContain("Tab")
  })

  test("Tab toggles scope between All and scoped, back to All", () => {
    const { board } = makeBoard()
    board.press("/")

    // Initially "All"
    let text = dialogText(board)
    expect(text).toContain("All")
    expect(text).not.toContain("in ")

    // Tab switches to scoped (shows "in <node name>")
    board.press("Tab")
    text = dialogText(board)
    expect(text).toContain("in ")
    expect(text).toContain("Tab for all")

    // Tab switches back to "All"
    board.press("Tab")
    text = dialogText(board)
    expect(text).toContain("All")
    expect(text).toContain("Tab to narrow")
  })
})

describe("Search scope: result filtering", () => {
  test("'All' scope returns results from entire repo", () => {
    const { board } = makeBoard()
    board.press("/")

    // Type a query that matches items in both columns
    // Note: "Alpha project" is a folder (has children), so it's excluded from search results.
    // Only leaf nodes (tasks) are searchable.
    board.press("p").press("r").press("o").press("j")
    const text = dialogText(board)

    // Should find leaf items from both columns
    expect(text).toContain("Beta")
    expect(text).toContain("Gamma")
    expect(text).toContain("Delta")
  })

  test("'Subtree' scope restricts results to cursor node descendants", () => {
    const { board } = makeBoard()

    // Cursor starts on first card ("Alpha project" which has children)
    // Open search, switch to Subtree scope
    board.press("/")
    board.press("Tab") // Switch to "Subtree" scope

    // Search for "subtask" — only Alpha project descendants should match
    board.press("s").press("u").press("b")
    const text = dialogText(board)
    expect(text).toContain("Alpha subtask one")
    expect(text).toContain("Alpha subtask two")

    // Items from other columns/cards should NOT appear in dialog results
    expect(text).not.toContain("Beta")
    expect(text).not.toContain("Gamma")
    expect(text).not.toContain("Delta")
  })

  test("'Subtree' scope with query matching nothing in subtree shows no results", () => {
    const { board } = makeBoard()

    // Cursor starts on "Alpha project"
    board.press("/")
    board.press("Tab") // Subtree scope

    // Search for "Delta" — not a descendant of Alpha
    board.press("D").press("e").press("l")
    const text = dialogText(board)
    expect(text).toContain("No matching items")
  })

  test("switching scope re-filters results", () => {
    const { board } = makeBoard()
    board.press("/")

    // Type query matching items across the board
    board.press("p").press("r").press("o").press("j")

    // In All scope, should see results from both columns
    let text = dialogText(board)
    expect(text).toContain("Beta")
    expect(text).toContain("Gamma")
    expect(text).toContain("Delta")

    // Switch to Subtree scope (cursor is on Alpha project)
    // Alpha project descendants include Alpha subtask one/two but they don't match "proj"
    // Alpha project itself is a folder (skipped). So only Alpha's leaf descendants matching "proj" would show.
    board.press("Tab")
    text = dialogText(board)

    // Gamma/Delta are not descendants of Alpha, should not appear in dialog results
    expect(text).not.toContain("Gamma")
    expect(text).not.toContain("Delta")
  })
})

describe("Search scope: scope node capture", () => {
  test("scope uses cursor node when search opens", () => {
    const { board } = makeBoard()

    // Move cursor to second card (Beta project)
    board.press("j")

    // Open search with Subtree scope
    board.press("/")
    board.press("Tab")

    // Search for "project" — only Beta should match (it has no descendants with "project")
    board.press("p").press("r").press("o").press("j")
    const text = dialogText(board)
    expect(text).toContain("Beta")
    // Alpha is not a descendant of Beta — should not appear in dialog results
    expect(text).not.toContain("Alpha project")
    expect(text).not.toContain("Gamma")
  })
})
