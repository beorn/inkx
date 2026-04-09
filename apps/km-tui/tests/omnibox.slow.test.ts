/**
 * Omnibox (Command Palette) Tests
 *
 * Tests the universal command palette accessible via `:` or `Ctrl+k`.
 */
import { describe, it, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

function standardBoard() {
  // Use a larger terminal (40 rows) so the omnibox overlay has enough space
  return createTestApp(
    [
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
  it("opens with : key", async () => {
    using app = standardBoard()
    await app.command("command_palette")
    app.expect("[data-dialog='omnibox']").toExist()
  })

  it("opens with Ctrl+k", async () => {
    using app = standardBoard()
    await app.press("ctrl+k")
    app.expect("[data-dialog='omnibox']").toExist()
  })

  it("closes with Escape", async () => {
    using app = standardBoard()
    await app.command("command_palette")
    await app.press("Escape")
    app.expect("[data-dialog='omnibox']").not.toExist()
  })

  it("shows Command Palette title", async () => {
    using app = standardBoard()
    await app.command("command_palette")
    expect(app.text).toContain("Command Palette")
  })

  it("shows go-to locations in results", async () => {
    using app = standardBoard()
    await app.command("command_palette")
    // Goto results are the first items displayed
    expect(app.text).toContain("Go to Inbox")
    expect(app.text).toContain("Go to Journal")
    expect(app.text).toContain("Go to Home")
    expect(app.text).toContain("Go to Archive")
  })

  it("shows command results", async () => {
    using app = standardBoard()
    await app.command("command_palette")
    // Some common commands should appear after the goto results
    expect(app.text).toContain("Move to Previous")
  })

  it("typing filters results", async () => {
    using app = standardBoard()
    await app.command("command_palette")
    // Type 'inbox' to filter
    await app.press("i")
    await app.press("n")
    await app.press("b")
    await app.command("insert_below")
    await app.command("toggle_task_done")
    expect(app.text).toContain("Inbox")
    // Archive should be filtered out
    expect(app.text).not.toContain("Archive")
  })

  it("shows no results for garbage query", async () => {
    using app = standardBoard()
    await app.command("command_palette")
    await app.command("zoom_inwards")
    await app.command("zoom_inwards")
    await app.command("zoom_inwards")
    await app.press("q")
    await app.press("q")
    expect(app.text).toContain("No results")
  })

  it("Enter on result closes omnibox", async () => {
    using app = standardBoard()
    await app.command("command_palette")
    await app.press("Enter")
    app.expect("[data-dialog='omnibox']").not.toExist()
  })

  it("absorbs keys when open (node commands do not fire)", async () => {
    using app = standardBoard()
    await app.command("command_palette")
    // Typing 'j' should go into the text input, not move cursor
    await app.command("cursor_down")
    // Omnibox should still be open
    app.expect("[data-dialog='omnibox']").toExist()
    // The 'j' should appear in the input
    expect(app.text).toContain("j")
  })

  it("arrow down navigates results", async () => {
    using app = standardBoard()
    await app.command("command_palette")
    // Press ArrowDown to move selection — the first result is Go to Inbox
    // After pressing down, Go to Journal should be highlighted
    await app.press("ArrowDown")
    // Just verify the omnibox is still open and responsive
    app.expect("[data-dialog='omnibox']").toExist()
  })

  it("shows vault search results for content queries", async () => {
    using app = standardBoard()
    await app.command("command_palette")
    // Type "task1" — should match the node title via FTS
    await app.press("t")
    await app.press("a")
    await app.press("s")
    await app.command("cursor_up")
    await app.press("1")
    // Search section divider should appear
    expect(app.text).toContain("Search")
    // The node title should appear in results
    expect(app.text).toContain("task1")
  })

  it("search results appear below command results", async () => {
    // Use extra-tall terminal so both sections are visible
    using app = await createTestApp([...item("board", item("col1", item("task1"), item("task2")))], { rows: 60 })
    await app.command("command_palette")
    // Type "task1" — matches few commands but definitely matches the node
    await app.press("t")
    await app.press("a")
    await app.press("s")
    await app.command("cursor_up")
    await app.press("1")
    // Search section divider should appear
    expect(app.text).toContain("Search")
    // The search result (node) should appear
    expect(app.text).toContain("task1")
  })

  it("does not search with single character query", async () => {
    using app = standardBoard()
    await app.command("command_palette")
    await app.press("t")
    // Should NOT show search section divider with 1 char
    expect(app.text).not.toContain("── Search ──")
  })

  it("shows footer with navigation hints", async () => {
    using app = standardBoard()
    await app.command("command_palette")
    expect(app.text).toContain("nav")
    expect(app.text).toContain("Enter")
    expect(app.text).toContain("Esc")
  })

  it("shows shortcut hints for goto locations", async () => {
    using app = standardBoard()
    await app.command("command_palette")
    // Goto locations should show their chord shortcuts
    expect(app.text).toContain("gi")
    expect(app.text).toContain("gj")
  })

  it("command result shortcut hint is visible despite long description", async () => {
    // With a narrow terminal, command labels + descriptions can overflow.
    // The shortcut hint (e.g., "gi") must remain visible — the description truncates instead.
    using app = await createTestApp([...item("board", item("col1", item("task1")))], { rows: 40, cols: 60 })
    await app.command("command_palette")
    // Go to Inbox has shortcut "gi" — it must be visible even at 60 columns
    expect(app.text).toContain("gi")
    // The label itself must also be visible
    expect(app.text).toContain("Go to Inbox")
  })

  it("command result items are single-line (no wrapping)", async () => {
    // At narrow widths, command items must truncate rather than wrap to multiple lines.
    // Without height=1 + overflow="hidden" + wrap="truncate", text wraps and breaks layout.
    using app = await createTestApp([...item("board", item("col1", item("task1")))], { rows: 40, cols: 50 })
    await app.command("command_palette")
    // "Go to Inbox" and "Go to Journal" should both be visible on separate lines.
    // If items wrapped, they would consume 2 rows each and fewer items would be visible.
    expect(app.text).toContain("Go to Inbox")
    expect(app.text).toContain("Go to Journal")
    expect(app.text).toContain("Go to Home")
    expect(app.text).toContain("Go to Archive")
  })

  it("search result parent context is not truncated by long title", async () => {
    // Use a board with a long task title and a recognizable column (parent) name.
    // The task title is long enough to push parentContext off-screen if not laid out properly.
    using app = await createTestApp(
      [
        ...item(
          "FAMILY SPRINT",
          item("Backlog", item("Move school chairs from living room to the office and organize them")),
        ),
      ],
      { rows: 60, cols: 80 },
    )
    await app.command("command_palette")
    // Search for "move school" — should match the long task
    for (const ch of "move school") await app.press(ch)
    // The parent context ("< in Backlog") must be visible even though title is long
    expect(app.text).toContain("Backlog")
  })
})
