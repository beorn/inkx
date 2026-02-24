/**
 * Search & Replace Dialog Tests
 *
 * Tests for the floating search/replace dialog:
 * - Opening/closing with S key and Escape
 * - Search query matching
 * - Tab switches between search and replace fields
 * - Match count display
 * - Replace current match
 * - Replace all matches (via dispatchCommandById)
 * - Regex toggle
 *
 * checkIncremental: false — dialog overlays cause border rendering mismatches
 * between incremental and fresh buffers (known inkx issue with position:absolute).
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { dispatchCommandById } from "../src/board-app.ts"

describe("Search & Replace", () => {
  /** Helper to create a standard board with searchable content */
  function searchBoard() {
    return testEnv(
      () =>
        item(
          "board",
          item("Todo", item("Buy milk"), item("Buy eggs"), item("Read book")),
          item("Done", item("Cook dinner"), item("Buy bread")),
        ),
      { columns: 100, checkIncremental: false },
    )
  }

  test("S opens the search/replace dialog", () => {
    const { board, store } = searchBoard()
    expect(store.getState().ui.searchReplace).toBeNull()

    board.press("S")

    const sr = store.getState().ui.searchReplace
    expect(sr).not.toBeNull()
    expect(sr!.searchQuery).toBe("")
    expect(sr!.replaceQuery).toBe("")
    expect(sr!.focusedField).toBe("search")
    expect(sr!.useRegex).toBe(false)
  })

  test("Escape closes the search/replace dialog", () => {
    const { board, store } = searchBoard()

    board.press("S")
    expect(store.getState().ui.searchReplace).not.toBeNull()

    board.press("Escape")
    expect(store.getState().ui.searchReplace).toBeNull()
  })

  test("typing updates the search query and shows matches", () => {
    const { board, store } = searchBoard()

    board.press("S")
    // Type "Buy" into the search field
    board.press("B").press("u").press("y")

    const sr = store.getState().ui.searchReplace
    expect(sr).not.toBeNull()
    expect(sr!.searchQuery).toBe("Buy")
    expect(sr!.matchCount).toBe(3) // "Buy milk", "Buy eggs", "Buy bread"
    expect(sr!.matchNodeIds).toHaveLength(3)
  })

  test("Tab switches between search and replace fields", () => {
    const { board, store } = searchBoard()

    board.press("S")
    expect(store.getState().ui.searchReplace!.focusedField).toBe("search")

    board.press("Tab")
    expect(store.getState().ui.searchReplace!.focusedField).toBe("replace")

    board.press("Tab")
    expect(store.getState().ui.searchReplace!.focusedField).toBe("search")
  })

  test("Enter navigates to next match", () => {
    const { board, store } = searchBoard()

    board.press("S")
    board.press("B").press("u").press("y")

    const sr1 = store.getState().ui.searchReplace!
    expect(sr1.matchIndex).toBe(0)
    expect(sr1.matchCount).toBe(3)

    board.press("Enter")
    const sr2 = store.getState().ui.searchReplace!
    expect(sr2.matchIndex).toBe(1)

    board.press("Enter")
    const sr3 = store.getState().ui.searchReplace!
    expect(sr3.matchIndex).toBe(2)

    // Wraps around
    board.press("Enter")
    const sr4 = store.getState().ui.searchReplace!
    expect(sr4.matchIndex).toBe(0)
  })

  test("match count displays correctly with no matches", () => {
    const { board, store } = searchBoard()

    board.press("S")
    board.press("z").press("z").press("z")

    const sr = store.getState().ui.searchReplace!
    expect(sr.matchCount).toBe(0)
    expect(sr.matchNodeIds).toHaveLength(0)
  })

  test("Ctrl+R replaces the current match", () => {
    const { board, store, repo } = searchBoard()

    board.press("S")
    // Search for "Buy"
    board.press("B").press("u").press("y")

    const sr1 = store.getState().ui.searchReplace!
    expect(sr1.matchCount).toBe(3)

    // Switch to replace field and type replacement
    board.press("Tab")
    board.press("G").press("e").press("t")

    // Replace current match (first one: "Buy milk" -> "Get milk")
    board.press("ctrl+r")

    // Verify the replacement happened
    const firstMatchId = sr1.matchNodeIds[0]!
    const node = repo.getNode(firstMatchId)
    expect(node).toBeDefined()
    // The node should now have "Get" replacing "Buy"
    const text = node!.content ?? node!.name ?? ""
    expect(text).toContain("Get")
    expect(text).not.toMatch(/^Buy/)

    // Match count should decrease
    const sr2 = store.getState().ui.searchReplace!
    expect(sr2.matchCount).toBe(2) // "Buy eggs" and "Buy bread" remain
  })

  test("replace all matches via command dispatch", () => {
    const { board, store, repo } = searchBoard()

    board.press("S")
    board.press("B").press("u").press("y")

    const sr1 = store.getState().ui.searchReplace!
    expect(sr1.matchCount).toBe(3)
    const matchIds = [...sr1.matchNodeIds]

    // Switch to replace field and type replacement
    board.press("Tab")
    board.press("G").press("e").press("t")

    // Replace all — use dispatchCommandById since ctrl+shift+r
    // can't be represented in standard ANSI terminal encoding
    dispatchCommandById("search_replace.replace_all", store.getState)

    // Verify all replacements happened
    for (const nodeId of matchIds) {
      const node = repo.getNode(nodeId)
      expect(node).toBeDefined()
      const text = node!.content ?? node!.name ?? ""
      expect(text).toContain("Get")
      expect(text).not.toContain("Buy")
    }

    // Match count should be 0
    const sr2 = store.getState().ui.searchReplace!
    expect(sr2.matchCount).toBe(0)
  })

  test("Ctrl+X toggles regex mode", () => {
    const { board, store } = searchBoard()

    board.press("S")
    expect(store.getState().ui.searchReplace!.useRegex).toBe(false)

    board.press("ctrl+x")
    expect(store.getState().ui.searchReplace!.useRegex).toBe(true)

    board.press("ctrl+x")
    expect(store.getState().ui.searchReplace!.useRegex).toBe(false)
  })

  test("regex search matches correctly", () => {
    const { board, store } = searchBoard()

    board.press("S")

    // Enable regex
    board.press("ctrl+x")
    expect(store.getState().ui.searchReplace!.useRegex).toBe(true)

    // Search for "Buy.*k" (matches "Buy milk" — k in milk)
    board.press("B").press("u").press("y")
    board.press(".").press("*").press("k")

    const sr = store.getState().ui.searchReplace!
    // "Buy milk" matches Buy.*k (the k in milk)
    expect(sr.matchCount).toBeGreaterThanOrEqual(1)
  })

  test("dialog renders in the board output", () => {
    const { board } = searchBoard()

    board.press("S")

    const output = board.screenshot()
    expect(output).toContain("[F]ind & Replace")
    expect(output).toContain("Find:")
    expect(output).toContain("Repl:")
  })

  test("invalid regex shows no matches instead of crashing", () => {
    const { board, store } = searchBoard()

    board.press("S")

    // Enable regex
    board.press("ctrl+x")

    // Type an invalid regex
    board.press("[")

    const sr = store.getState().ui.searchReplace!
    expect(sr.matchCount).toBe(0)
    // Should not crash
  })
})
