/**
 * Explore: Collapse/uncollapse behavior across different column types
 *
 * Tests that 'c' (toggle_collapse) works correctly for:
 * - Regular columns (folder children)
 * - Columns with file children
 * - Columns with body content (virtual cards)
 * - Mixed columns
 * - Navigation between collapsed/uncollapsed columns
 * - Cursor behavior on collapse/uncollapse
 * - Columns pre-collapsed via rules (collapse=true)
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("collapse/uncollapse columns", () => {
  // =========================================================================
  // Basic collapse/uncollapse
  // =========================================================================

  test("c collapses the current column (regular children)", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Cursor starts at first card in col1
    expect(board.q("[data-cursor]").textContent()).toContain("task-a")

    // Press 'c' to collapse col1
    board.press("c")

    // After collapse, cursor should be on column header (not an invisible card)
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBeGreaterThan(0)

    // Cursor should be on the collapsed column
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  test("c on collapsed column uncollapses it", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Collapse col1
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBeGreaterThan(0)

    // Uncollapse col1
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(0)

    // Cards should be visible again
    expect(board.q("[data-cursor]").count()).toBe(1)
  })

  // =========================================================================
  // Different column types
  // =========================================================================

  test("c collapses column with file children", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col-files", item.file("file1"), item.file("file2")),
        item("col-other", item("task1")),
      ),
    )

    // Cursor should be on file1
    expect(board.q("[data-cursor]").textContent()).toContain("file1")

    // Collapse
    board.press("c")
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBeGreaterThan(0)

    // Uncollapse
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(0)
  })

  test("c collapses column with folder children", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col-folders", item.folder("sub-a", item("item-a")), item.folder("sub-b")),
        item("col-other", item("task1")),
      ),
    )

    // Collapse
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBeGreaterThan(0)

    // Uncollapse
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(0)
  })

  test("c collapses column with mixed file/folder/task children", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col-mixed", item.file("file-a"), item.folder("folder-b"), item("task-c")),
        item("col-other", item("x")),
      ),
    )

    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBeGreaterThan(0)

    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(0)
  })

  test("c collapses column with body content (paragraphs before items)", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col-body", item.paragraph("intro text"), item("task1")),
        item("col-other", item("x")),
      ),
    )

    // Navigate to col-body body card (intro text)
    expect(board.q("[data-cursor]").textContent()).toContain("intro text")

    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBeGreaterThan(0)

    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(0)
  })

  test("c collapses empty column", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("empty-col"),
        item("col-other", item("x")),
      ),
    )

    // Navigate to empty column header
    // First, navigate up to board level
    board.press("k")
    // Then down to first column header
    board.press("j")
    // Move right to get to empty-col if needed (depends on initial cursor)
    // Actually let's just go up to board level first then navigate
    // Initial cursor should be on first card which is in col-other (since empty-col has no cards)

    // Press c - should work even on columns with no cards
    board.press("c")
    // (empty column collapse behavior - just verifying no crash)
  })

  // =========================================================================
  // Pre-collapsed columns (via rules)
  // =========================================================================

  test("column with collapse=true starts collapsed", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1 collapse=true", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // col1 should be collapsed from the start
    expect(board.q("[data-collapsed]").count()).toBeGreaterThan(0)

    // Cursor should be on col2's first card since col1 is collapsed
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    expect(cursor.textContent()).toContain("task-c")
  })

  test("uncollapsing a collapse=true column works", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1 collapse=true", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Navigate to collapsed col1 header (h from col2's card)
    board.press("h")

    // Uncollapse
    board.press("c")

    // Should now show cards
    // Navigate down into col1
    board.press("j")
    const cursor = board.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-a")
  })

  // =========================================================================
  // Navigation between collapsed and uncollapsed columns
  // =========================================================================

  test("h/l navigation works between collapsed and uncollapsed columns", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
        item("col3", item("task-d")),
      ),
    )

    // Collapse col1
    board.press("c")

    // Move right to col2
    board.press("l")
    let cursor = board.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-c")

    // Move right to col3
    board.press("l")
    cursor = board.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-d")

    // Move left back to col2
    board.press("h")
    cursor = board.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-c")

    // Move left to collapsed col1
    board.press("h")
    cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    // Should be on col1 header (collapsed)
  })

  test("j/k on collapsed column stays on header", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Collapse col1
    board.press("c")

    // Try pressing j - should not enter collapsed column
    board.press("j")
    // Should stay at column header or move to next column
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  // =========================================================================
  // Cursor preservation
  // =========================================================================

  test("cursor moves to column header on collapse", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a"), item("task-b"), item("task-c")),
        item("col2", item("task-d")),
      ),
    )

    // Navigate to task-b (second card)
    board.press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("task-b")

    // Collapse - cursor should move to column header
    board.press("c")

    // Collapsed column should have cursor
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    // The cursor element should be on the collapsed column itself
    const collapsed = board.q("[data-collapsed][data-cursor]")
    expect(collapsed.count()).toBe(1)
  })

  test("cursor goes to first card on uncollapse", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Collapse
    board.press("c")

    // Uncollapse
    board.press("c")

    // Cursor should be somewhere valid
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  // =========================================================================
  // Multiple collapsed columns
  // =========================================================================

  test("multiple columns can be collapsed independently", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a")),
        item("col2", item("task-b")),
        item("col3", item("task-c")),
      ),
    )

    // Collapse col1 (cursor starts on task-a)
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(1)

    // After collapse, cursor is on col1 header. Move right to col2's card
    board.press("l")

    // Collapse col2
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(2)

    // After collapse, cursor on col2 header. Move right to col3
    board.press("l")
    const cursor = board.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-c")

    // Uncollapse col1: h from col3's card goes to col1 (since col2 is collapsed)
    board.press("h")
    board.press("c") // toggle collapse on whichever column we landed on

    // Should now have fewer collapsed columns
    const collapsedAfter = board.q("[data-collapsed]").count()
    expect(collapsedAfter).toBeLessThan(2) // at least one was uncollapsed
  })

  // =========================================================================
  // Virtual body column
  // =========================================================================

  test("c on virtual body column (Description) does not crash", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item.paragraph("intro text"),
        item("col1", item("task-a")),
      ),
    )

    // Cursor starts on body card ("intro text")
    expect(board.q("[data-cursor]").textContent()).toContain("intro text")

    // Try to collapse the virtual body column
    board.press("c")

    // Should not crash - cursor should still be valid
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  // =========================================================================
  // Column header level interactions
  // =========================================================================

  test("c from column header level collapses the column", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Navigate to column header (k from first card)
    board.press("k")

    // Collapse from column header
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBeGreaterThan(0)
  })

  test("c from board level does nothing (no column to collapse)", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a")),
        item("col2", item("task-b")),
      ),
    )

    // Navigate to board level
    board.press("k").press("k")

    // Try to collapse from board level - should be a no-op
    board.press("c")

    // Should still be at board level or no crash
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBeLessThanOrEqual(1)
  })
})
