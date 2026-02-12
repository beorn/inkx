/**
 * Bug: km-3wk32 — Cursor lost after j from column header with flat file items
 *
 * When at column header level, pressing `j` to enter a column with flat file
 * items causes the cursor to jump to the root "/" instead of selecting the
 * first card. This does NOT happen with columns containing subfolder items.
 *
 * Investigation: The navigateVertical function uses repo.getChildren() to get
 * card-level children. If the children IDs don't match what's in the layout's
 * nodeIndex (e.g., due to extractBody filtering or NON_COLUMN_TYPES filtering),
 * the SELECT dispatch falls through to "board" level.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("cursor-lost-col-header-j (km-3wk32)", () => {
  test("j from column header selects first card (folder children - control)", () => {
    // Control case: columns with folder-type children work correctly
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col-folders", item.folder("sub-a", item("item-a"))),
        item("col-tasks", item("task-1"), item("task-2")),
      ),
    )

    // Navigate to board level
    board.press("k").press("k")
    // Board -> first column header
    board.press("j")
    // Column header -> first card
    board.press("j")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    // Should be on sub-a (first card in first column)
    expect(cursor.textContent()).toContain("sub-a")
  })

  test("j from column header selects first card (file children)", () => {
    // Bug case: columns with file-type children
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col-with-files", item.file("file1"), item.file("file2")),
      ),
    )

    // Navigate up to board level
    board.press("k").press("k")
    // Board -> column header
    board.press("j")
    // Column header -> first card (should be file1)
    board.press("j")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    expect(cursor.textContent()).toContain("file1")
  })

  test("j from second column header selects first card (file children)", () => {
    // Test entering the second column specifically
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col-folders", item.folder("sub-a", item("item-a"))),
        item("col-files", item.file("file1"), item.file("file2")),
      ),
    )

    // Navigate up to board level
    board.press("k").press("k")
    // Board -> first column header (col-folders)
    board.press("j")
    // Move right to second column header (col-files)
    board.press("l")
    // Column header -> first card (should be file1)
    board.press("j")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    expect(cursor.textContent()).toContain("file1")
  })

  test("j from column header with mixed file/folder children", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col-mixed", item.file("file-a"), item.folder("folder-b")),
      ),
    )

    // Navigate to board level
    board.press("k").press("k")
    // j -> column header
    board.press("j")
    // j -> first card (should be file-a)
    board.press("j")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    expect(cursor.textContent()).toContain("file-a")
  })

  test("j from column header with paragraph body content", () => {
    // Edge case: column has only paragraph children (body content, no structural items)
    // This tests the extractBody filtering scenario
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col-body", item.paragraph("para-1"), item.paragraph("para-2")),
      ),
    )

    // Navigate up to board level
    board.press("k").press("k")
    // Board -> column header
    board.press("j")
    // Column header -> first card (should be para-1)
    board.press("j")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    expect(cursor.textContent()).toContain("para-1")
  })

  test("j from board level with body content (paragraph before columns)", () => {
    // KEY BUG CASE: Root has leading paragraph content before structural columns.
    // navigateVertical at board level uses repo.getChildren(rootId) which includes
    // paragraph nodes, but the visual layout (deriveColumnsFromRepo) filters them
    // out using NON_COLUMN_TYPES. This causes a mismatch between array indices.
    const { board } = testEnv(() =>
      item.root(
        "board",
        // Leading paragraph (body content) - filtered from columns by NON_COLUMN_TYPES
        item.paragraph("intro text"),
        // Structural children - become visual columns
        item("col1", item.file("file1"), item.file("file2")),
        item("col2", item("task1")),
      ),
    )

    // Navigate up to board level
    board.press("k").press("k")
    // Board -> should go to first visual column (col1), NOT the paragraph
    board.press("j")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    // Bug: cursor lands on paragraph (repo.getChildren index 0) instead of
    // column col1 (visual column index 0). The paragraph is not in nodeIndex
    // as a column, so SELECT falls through to "board" level.
    const cursorText = cursor.textContent()
    // Should NOT contain "intro text" (the paragraph) - should be on col1 header
    expect(cursorText).not.toContain("intro text")
  })

  test("j from board level with code block before columns", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item.code("some code"),
        item("col1", item("task1")),
      ),
    )

    board.press("k").press("k")
    board.press("j")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    // Should be on col1, not the code block
    const cursorText = cursor.textContent()
    expect(cursorText).not.toContain("some code")
  })

  test("j from board level with quote before columns", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item.quote("a quote"),
        item("col1", item("task1")),
      ),
    )

    board.press("k").press("k")
    board.press("j")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    const cursorText = cursor.textContent()
    expect(cursorText).not.toContain("a quote")
  })

  test("round-trip navigation preserves cursor for file children columns", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item.file("f1"), item.file("f2")),
        item("col2", item.file("f3")),
      ),
    )

    // Navigate down through col1
    board.press("j") // f1 -> f2 (next card)
    expect(board.q("[data-cursor]").textContent()).toContain("f2")

    // Navigate up: f2 -> f1 -> col header -> board (3 presses of k)
    board.press("k") // f2 -> f1 (prev sibling)
    board.press("k") // f1 -> column header (first card -> parent)
    board.press("k") // column header -> board

    // Navigate down: board -> column header -> first card
    board.press("j") // board -> column header
    board.press("j") // column header -> first card
    // Should be on f1 (first card in col1)
    expect(board.q("[data-cursor]").textContent()).toContain("f1")
  })
})
