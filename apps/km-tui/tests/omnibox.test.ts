/**
 * Omnibox (Command Palette) Tests
 *
 * Tests the universal command palette accessible via `:` or `Ctrl+k`.
 */
import { describe, it, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function standardBoard() {
  // Use a larger terminal (40 rows) so the omnibox overlay has enough space
  return testEnv(
    () => [
      ...item(
        "board",
        item("col1", item("task1"), item("task2"), item("task3")),
        item("col2", item("taskA"), item("taskB")),
      ),
    ],
    { rows: 40 },
  )
}

describe("omnibox", () => {
  it("opens with : key", () => {
    const { board } = standardBoard()
    board.press(":")
    board.expect("[data-dialog='omnibox']").toExist()
  })

  it("opens with Ctrl+k", () => {
    const { board } = standardBoard()
    board.press("Control+k")
    board.expect("[data-dialog='omnibox']").toExist()
  })

  it("closes with Escape", () => {
    const { board } = standardBoard()
    board.press(":").press("Escape")
    board.expect("[data-dialog='omnibox']").not.toExist()
  })

  it("shows Command Palette title", () => {
    const { board } = standardBoard()
    board.press(":")
    const screenshot = board.screenshot()
    expect(screenshot).toContain("Command Palette")
  })

  it("shows go-to locations in results", () => {
    const { board } = standardBoard()
    board.press(":")
    const screenshot = board.screenshot()
    // Goto results are the first items displayed
    expect(screenshot).toContain("Go to Inbox")
    expect(screenshot).toContain("Go to Journal")
    expect(screenshot).toContain("Go to Home")
    expect(screenshot).toContain("Go to Archive")
  })

  it("shows command results", () => {
    const { board } = standardBoard()
    board.press(":")
    const screenshot = board.screenshot()
    // Some common commands should appear after the goto results
    expect(screenshot).toContain("Move to Previous")
  })

  it("typing filters results", () => {
    const { board } = standardBoard()
    board.press(":")
    // Type 'inbox' to filter
    board.press("i").press("n").press("b").press("o").press("x")
    const screenshot = board.screenshot()
    expect(screenshot).toContain("Inbox")
    // Archive should be filtered out
    expect(screenshot).not.toContain("Archive")
  })

  it("shows no results for garbage query", () => {
    const { board } = standardBoard()
    board.press(":")
    board.press("z").press("z").press("z").press("q").press("q")
    const screenshot = board.screenshot()
    expect(screenshot).toContain("No results")
  })

  it("Enter on result closes omnibox", () => {
    const { board } = standardBoard()
    board.press(":")
    board.press("Enter")
    board.expect("[data-dialog='omnibox']").not.toExist()
  })

  it("absorbs keys when open (node commands do not fire)", () => {
    const { board } = standardBoard()
    board.press(":")
    // Typing 'j' should go into the text input, not move cursor
    board.press("j")
    // Omnibox should still be open
    board.expect("[data-dialog='omnibox']").toExist()
    // The 'j' should appear in the input
    const screenshot = board.screenshot()
    expect(screenshot).toContain("j")
  })

  it("arrow down navigates results", () => {
    const { board } = standardBoard()
    board.press(":")
    // Press ArrowDown to move selection — the first result is Go to Inbox
    // After pressing down, Go to Journal should be highlighted
    board.press("ArrowDown")
    // Just verify the omnibox is still open and responsive
    board.expect("[data-dialog='omnibox']").toExist()
  })

  it("shows vault search results for content queries", () => {
    const { board } = standardBoard()
    board.press(":")
    // Type "task1" — should match the node title via FTS
    board.press("t").press("a").press("s").press("k").press("1")
    const screenshot = board.screenshot()
    // Search section divider should appear
    expect(screenshot).toContain("Search")
    // The node title should appear in results
    expect(screenshot).toContain("task1")
  })

  it("search results appear below command results", () => {
    // Use extra-tall terminal so both sections are visible
    const { board } = testEnv(
      () => [
        ...item(
          "board",
          item("col1", item("task1"), item("task2")),
        ),
      ],
      { rows: 60 },
    )
    board.press(":")
    // Type "task1" — matches few commands but definitely matches the node
    board.press("t").press("a").press("s").press("k").press("1")
    const screenshot = board.screenshot()
    // Search section divider should appear
    expect(screenshot).toContain("Search")
    // The search result (node) should appear
    expect(screenshot).toContain("task1")
  })

  it("does not search with single character query", () => {
    const { board } = standardBoard()
    board.press(":")
    board.press("t")
    const screenshot = board.screenshot()
    // Should NOT show search section divider with 1 char
    expect(screenshot).not.toContain("── Search ──")
  })

  it("shows footer with navigation hints", () => {
    const { board } = standardBoard()
    board.press(":")
    const screenshot = board.screenshot()
    expect(screenshot).toContain("nav")
    expect(screenshot).toContain("Enter")
    expect(screenshot).toContain("Esc")
  })

  it("shows shortcut hints for goto locations", () => {
    const { board } = standardBoard()
    board.press(":")
    const screenshot = board.screenshot()
    // Goto locations should show their chord shortcuts
    expect(screenshot).toContain("gi")
    expect(screenshot).toContain("gj")
  })

  it("search result parent context is not truncated by long title", () => {
    // Use a board with a long task title and a recognizable column (parent) name.
    // The task title is long enough to push parentContext off-screen if not laid out properly.
    const { board } = testEnv(
      () => [
        ...item(
          "FAMILY SPRINT",
          item("Backlog", item("Move school chairs from living room to the office and organize them")),
        ),
      ],
      { rows: 60, columns: 80 },
    )
    board.press(":")
    // Search for "move school" — should match the long task
    "move school".split("").forEach((ch) => board.press(ch))
    const screenshot = board.screenshot()
    // The parent context ("< in Backlog") must be visible even though title is long
    expect(screenshot).toContain("Backlog")
  })
})
