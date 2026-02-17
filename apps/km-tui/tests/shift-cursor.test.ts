/**
 * Bug: km-tui.shift-cursor — column shift moves cursor, should stay
 *
 * After shifting a column with Meta+l/Meta+h, the cursor should stay on
 * the shifted column. Subsequent navigation (j to enter column, l/h to
 * move between columns) should work correctly from the new position.
 * Visual column order should also reflect the shift.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("km-tui.shift-cursor: column shift preserves cursor position", () => {
  test("Meta+l shifts column right — cursor stays on same column header", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
    )
    // Navigate to col1 header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 right
    board.press("Meta+l")

    // Cursor should still be on col1 (now at position 1)
    board.expect("#col1[data-cursor]").toExist()

    // Navigate down into the column — should enter col1's cards, not col2's
    board.press("j")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("Meta+h shifts column left — cursor stays on same column header", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
    )
    // Navigate to col2 header
    board.press("l")
    board.press("k")
    board.expect("#col2[data-cursor]").toExist()

    // Shift col2 left
    board.press("Meta+h")

    // Cursor should still be on col2 (now at position 0)
    board.expect("#col2[data-cursor]").toExist()

    // Navigate down into the column — should enter col2's cards
    board.press("j")
    board.expect("#2a[data-cursor]").toExist()
  })

  test("Meta+l shifts column right — pressing l from shifted column moves to next column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
    )
    // Navigate to col1 header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 right (col1 is now at position 1, between col2 and col3)
    board.press("Meta+l")
    board.expect("#col1[data-cursor]").toExist()

    // Press l to move to next column — should go to col3 (which is now at position 2)
    board.press("l")
    board.expect("#col3[data-cursor]").toExist()
  })

  test("Meta+h shifts column left — pressing h from shifted column moves to previous column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
    )
    // Navigate to col3 header
    board.press("l").press("l").press("k")
    board.expect("#col3[data-cursor]").toExist()

    // Shift col3 left (col3 is now at position 1, between col1 and col2)
    board.press("Meta+h")
    board.expect("#col3[data-cursor]").toExist()

    // Press h to move to previous column — should go to col1 (at position 0)
    board.press("h")
    board.expect("#col1[data-cursor]").toExist()
  })

  test("shift column right then down enters correct column's cards", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a")),
      ),
    )
    // Navigate to col1 header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 right
    board.press("Meta+l")
    board.expect("#col1[data-cursor]").toExist()

    // Navigate down — should enter col1's first card
    board.press("j")
    board.expect("#1a[data-cursor]").toExist()

    // Navigate further down — should see col1's second card
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("shift column left then down enters correct column's cards", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("1a")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a")),
      ),
    )
    // Navigate to col2 header
    board.press("l").press("k")
    board.expect("#col2[data-cursor]").toExist()

    // Shift col2 left
    board.press("Meta+h")
    board.expect("#col2[data-cursor]").toExist()

    // Navigate down — should enter col2's first card
    board.press("j")
    board.expect("#2a[data-cursor]").toExist()

    // Navigate further down — should see col2's second card
    board.press("j")
    board.expect("#2b[data-cursor]").toExist()
  })

  test("Meta+l visually reorders columns — all 3 columns visible", () => {
    // Use wider terminal to ensure all columns fit without scrolling
    const { board } = testEnv(
      () => item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
      { columns: 120, rows: 24 },
    )
    // Navigate to col1 header and shift right
    board.press("k")
    board.press("Meta+l")

    // After shift: visual order should be col2, col1, col3
    const col1Box = board.q("#col1").boundingBox()
    const col2Box = board.q("#col2").boundingBox()
    const col3Box = board.q("#col3").boundingBox()
    expect(col1Box).not.toBeNull()
    expect(col2Box).not.toBeNull()
    expect(col3Box).not.toBeNull()
    expect(col2Box!.x).toBeLessThan(col1Box!.x)
    expect(col1Box!.x).toBeLessThan(col3Box!.x)
  })

  test("Meta+h visually reorders columns — all 3 columns visible", () => {
    // Use wider terminal to ensure all columns fit without scrolling
    const { board } = testEnv(
      () => item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
      { columns: 120, rows: 24 },
    )
    // Navigate to col2 header and shift left
    board.press("l").press("k")
    board.press("Meta+h")

    // After shift: visual order should be col2, col1, col3
    const col1Box = board.q("#col1").boundingBox()
    const col2Box = board.q("#col2").boundingBox()
    const col3Box = board.q("#col3").boundingBox()
    expect(col1Box).not.toBeNull()
    expect(col2Box).not.toBeNull()
    expect(col3Box).not.toBeNull()
    expect(col2Box!.x).toBeLessThan(col1Box!.x)
    expect(col1Box!.x).toBeLessThan(col3Box!.x)
  })

  test("multiple shifts preserve cursor and visual order", () => {
    // Use wider terminal for 4 columns
    const { board } = testEnv(
      () => item("board",
        item("col1", item("1a")),
        item("col2", item("2a")),
        item("col3", item("3a")),
        item("col4", item("4a")),
      ),
      { columns: 160, rows: 24 },
    )
    // Navigate to col1 header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 right three times (col1 moves: pos 0 -> 1 -> 2 -> 3)
    board.press("Meta+l")
    board.expect("#col1[data-cursor]").toExist()
    board.press("Meta+l")
    board.expect("#col1[data-cursor]").toExist()
    board.press("Meta+l")
    board.expect("#col1[data-cursor]").toExist()

    // col1 should now be at the rightmost position
    // Visual order: col2, col3, col4, col1
    const col1Box = board.q("#col1").boundingBox()
    const col2Box = board.q("#col2").boundingBox()
    const col3Box = board.q("#col3").boundingBox()
    const col4Box = board.q("#col4").boundingBox()
    expect(col1Box).not.toBeNull()
    expect(col2Box).not.toBeNull()
    expect(col3Box).not.toBeNull()
    expect(col4Box).not.toBeNull()
    expect(col2Box!.x).toBeLessThan(col3Box!.x)
    expect(col3Box!.x).toBeLessThan(col4Box!.x)
    expect(col4Box!.x).toBeLessThan(col1Box!.x)

    // Navigate down — should enter col1's card
    board.press("j")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("shift right then left returns column to original position", () => {
    const { board } = testEnv(
      () =>
        item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
      { columns: 160, rows: 24 },
    )
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    const c1Before = board.q("#col1").boundingBox()!.x
    const c2Before = board.q("#col2").boundingBox()!.x

    // Shift right (col1 moves to position 1)
    board.press("Meta+l")
    board.expect("#col1[data-cursor]").toExist()
    expect(board.q("#col1").boundingBox()!.x, "col1 moved right").toBeGreaterThan(c1Before)

    // Shift left (col1 returns to position 0)
    board.press("Meta+h")
    board.expect("#col1[data-cursor]").toExist()
    expect(board.q("#col1").boundingBox()!.x, "col1 returned to original").toBe(c1Before)
    expect(board.q("#col2").boundingBox()!.x, "col2 returned to original").toBe(c2Before)
  })

  test("shift right twice then left once — column ends in middle", () => {
    const { board } = testEnv(
      () =>
        item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
      { columns: 160, rows: 24 },
    )
    board.press("k")

    board.press("Meta+l") // col1: pos 0 → 1
    board.press("Meta+l") // col1: pos 1 → 2
    board.expect("#col1[data-cursor]").toExist()

    board.press("Meta+h") // col1: pos 2 → 1
    board.expect("#col1[data-cursor]").toExist()

    // Order should be: col2, col1, col3
    const c1x = board.q("#col1").boundingBox()!.x
    const c2x = board.q("#col2").boundingBox()!.x
    const c3x = board.q("#col3").boundingBox()!.x
    expect(c2x).toBeLessThan(c1x)
    expect(c1x).toBeLessThan(c3x)
  })

  test("shift column with narrow viewport scrolls cursor into view", () => {
    // 80-wide viewport with 3 columns: maxCols = floor(80/35) = 2
    // So only 2 columns visible at once — scroll is active
    const { board } = testEnv(
      () => item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
      { columns: 80, rows: 24 },
    )
    // Navigate to col1 header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 right
    board.press("Meta+l")

    // Cursor should still be on col1 — and col1 should be visible (in viewport)
    board.expect("#col1[data-cursor]").toExist()
    const col1Box = board.q("#col1").boundingBox()
    expect(col1Box).not.toBeNull()
  })
})

/**
 * Bug km-cnn5z: Shift-J single press selects only 1 item, batch ops skip anchor
 *
 * After pressing J once from card A:
 * - Anchor is set to A, cursor moves to B
 * - The visual range A→B should contain 2 items (both A and B)
 * - Batch operations (x toggle, Backspace) should affect both nodes
 *
 * Actual: multiSelected contains only 1 item (the anchor A).
 * getSelectedCardIndices returns [0] (1 index), so batch ops
 * fall through to single-node path and only operate on cursor (B).
 */
describe("Shift-J single press range (km-cnn5z)", () => {
  function makeBoard() {
    return testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
  }

  test("single J from A selects both A and B", () => {
    const { board } = makeBoard()

    // Cursor starts on A (card 0)
    board.press("J") // anchor=A, cursor→B

    // After one J, the selection range should include both A and B
    // Check status message reflects 2 items selected
    const status = board.getStatus()
    expect(status).not.toBeNull()
    expect(status!.message).toContain("2")
  })

  test("batch toggle after single J affects both A and B", () => {
    const { board, repo } = makeBoard()

    // Make A and B proper tasks
    repo.updateNode("A", { task_status: "todo", task_marker: "[ ]" })
    repo.updateNode("B", { task_status: "todo", task_marker: "[ ]" })
    repo.updateNode("C", { task_status: "todo", task_marker: "[ ]" })

    // Re-render to pick up node type changes
    board.press("J") // anchor=A, cursor→B — should select range [A, B]

    // Toggle status on selection
    board.press("x")

    // Both A and B should have their status toggled (not just B)
    const statusA = repo.getNode("A")?.task_status
    const statusB = repo.getNode("B")?.task_status
    const statusC = repo.getNode("C")?.task_status

    // A and B should both be toggled away from "todo"
    expect(statusA).not.toBe("todo")
    expect(statusB).not.toBe("todo")
    // C should be untouched
    expect(statusC).toBe("todo")
  })

  test("batch delete after single J removes both A and B", () => {
    const { board, repo } = makeBoard()

    // Cursor on A, press J to select range A→B
    board.press("J")

    // Delete the selection
    board.press("Backspace")

    // Both A and B should be deleted, only C remains
    const children = repo.getChildren("col1").map((n) => n.id)
    expect(children).toEqual(["C"])
  })
})

describe("shift card boundary detection", () => {
  test("shift up at top card returns boundary (bell)", () => {
    const { board } = testEnv(
      () => item("board", item("Col", item("a"), item("b"), item("c"))),
      { columns: 60, rows: 20 },
    )
    // Cursor is on first card — shift up should hit boundary
    board.press("Meta+k")
    expect(board.bell).toBe(true)
  })

  test("shift down at bottom card returns boundary (bell)", () => {
    const { board } = testEnv(
      () => item("board", item("Col", item("a"), item("b"))),
      { columns: 60, rows: 20 },
    )
    board.press("j") // move to last card
    board.press("Meta+j") // shift down at bottom
    expect(board.bell).toBe(true)
  })

  test("shift left at leftmost column returns boundary (bell)", () => {
    const { board } = testEnv(
      () => item("board", item("Col1", item("a")), item("Col2", item("b"))),
      { columns: 80, rows: 20 },
    )
    // Cursor on Col1 card — shift left should hit boundary
    board.press("Meta+h")
    expect(board.bell).toBe(true)
  })

  test("shift right at rightmost column returns boundary (bell)", () => {
    const { board } = testEnv(
      () => item("board", item("Col1", item("a")), item("Col2", item("b"))),
      { columns: 80, rows: 20 },
    )
    board.press("l") // move to Col2
    board.press("Meta+l") // shift right at rightmost column
    expect(board.bell).toBe(true)
  })

  test("shift down in middle succeeds (no bell)", () => {
    const { board } = testEnv(
      () => item("board", item("Col", item("a"), item("b"), item("c"))),
      { columns: 60, rows: 20 },
    )
    board.press("Meta+j") // shift down from first card — should succeed
    expect(board.bell).toBe(false)
  })

  test("shift up/down at column header returns boundary (bell)", () => {
    const { board } = testEnv(
      () => item("board", item("Col1", item("a")), item("Col2", item("b"))),
      { columns: 80, rows: 20 },
    )
    board.press("k") // move to column header
    board.press("Meta+k") // shift up at header — no card, should hit boundary
    expect(board.bell).toBe(true)
  })
})
