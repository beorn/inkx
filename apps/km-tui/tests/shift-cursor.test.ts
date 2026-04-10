/**
 * Bug: km-tui.shift-cursor — column shift moves cursor, should stay
 *
 * After shifting a column with opt+l/opt+h, the cursor should stay on
 * the shifted column. Subsequent navigation (j to enter column, l/h to
 * move between columns) should work correctly from the new position.
 * Visual column order should also reflect the shift.
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("km-tui.shift-cursor: column shift preserves cursor position", () => {
  test("opt+l shifts column right — cursor stays on same column header", () => {
    using app = createTestApp(item.multiColBoard())
    // Navigate to col1 header
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    // Shift col1 right
    app.press("opt+l")

    // Cursor should still be on col1 (now at position 1)
    app.expect("#col1[data-cursor]").toExist()

    // Navigate down into the column — should enter col1's cards, not col2's
    app.command("cursor_down")
    app.expect("#1a[data-cursor]").toExist()
  })

  test("opt+h shifts column left — cursor stays on same column header", () => {
    using app = createTestApp(item.multiColBoard())
    // Navigate to col2 header
    app.command("cursor_right")
    app.command("cursor_up")
    app.expect("#col2[data-cursor]").toExist()

    // Shift col2 left
    app.press("opt+h")

    // Cursor should still be on col2 (now at position 0)
    app.expect("#col2[data-cursor]").toExist()

    // Navigate down into the column — should enter col2's cards
    app.command("cursor_down")
    app.expect("#2a[data-cursor]").toExist()
  })

  test("opt+l shifts column right — pressing l from shifted column moves to next column", () => {
    using app = createTestApp(item.multiColBoard())
    // Navigate to col1 header
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    // Shift col1 right (col1 is now at position 1, between col2 and col3)
    app.press("opt+l")
    app.expect("#col1[data-cursor]").toExist()

    // Press l to move to next column — should go to col3 (which is now at position 2)
    app.command("cursor_right")
    app.expect("#col3[data-cursor]").toExist()
  })

  test("opt+h shifts column left — pressing h from shifted column moves to previous column", () => {
    using app = createTestApp(item.multiColBoard())
    // Navigate to col3 header
    app.command("cursor_right")
    app.command("cursor_right")
    app.command("cursor_up")
    app.expect("#col3[data-cursor]").toExist()

    // Shift col3 left (col3 is now at position 1, between col1 and col2)
    app.press("opt+h")
    app.expect("#col3[data-cursor]").toExist()

    // Press h to move to previous column — should go to col1 (at position 0)
    app.command("cursor_left")
    app.expect("#col1[data-cursor]").toExist()
  })

  test("shift column right then down enters correct column's cards", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a")),
      ),
    )
    // Navigate to col1 header
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    // Shift col1 right
    app.press("opt+l")
    app.expect("#col1[data-cursor]").toExist()

    // Navigate down — should enter col1's first card
    app.command("cursor_down")
    app.expect("#1a[data-cursor]").toExist()

    // Navigate further down — should see col1's second card
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()
  })

  test("shift column left then down enters correct column's cards", () => {
    using app = createTestApp(
      item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b")), item("col3", item("3a"))),
    )
    // Navigate to col2 header
    app.command("cursor_right")
    app.command("cursor_up")
    app.expect("#col2[data-cursor]").toExist()

    // Shift col2 left
    app.press("opt+h")
    app.expect("#col2[data-cursor]").toExist()

    // Navigate down — should enter col2's first card
    app.command("cursor_down")
    app.expect("#2a[data-cursor]").toExist()

    // Navigate further down — should see col2's second card
    app.command("cursor_down")
    app.expect("#2b[data-cursor]").toExist()
  })

  test("opt+l visually reorders columns — all 3 columns visible", () => {
    // Use wider terminal to ensure all columns fit without scrolling
    using app = createTestApp(item.multiColBoard(), { cols: 120, rows: 24 })
    // Navigate to col1 header and shift right
    app.command("cursor_up")
    app.press("opt+l")

    // After shift: visual order should be col2, col1, col3
    const col1Box = app.q("#col1").boundingBox()
    const col2Box = app.q("#col2").boundingBox()
    const col3Box = app.q("#col3").boundingBox()
    expect(col1Box).not.toBeNull()
    expect(col2Box).not.toBeNull()
    expect(col3Box).not.toBeNull()
    expect(col2Box!.x).toBeLessThan(col1Box!.x)
    expect(col1Box!.x).toBeLessThan(col3Box!.x)
  })

  test("opt+h visually reorders columns — all 3 columns visible", () => {
    // Use wider terminal to ensure all columns fit without scrolling
    using app = createTestApp(item.multiColBoard(), { cols: 120, rows: 24 })
    // Navigate to col2 header and shift left
    app.command("cursor_right")
    app.command("cursor_up")
    app.press("opt+h")

    // After shift: visual order should be col2, col1, col3
    const col1Box = app.q("#col1").boundingBox()
    const col2Box = app.q("#col2").boundingBox()
    const col3Box = app.q("#col3").boundingBox()
    expect(col1Box).not.toBeNull()
    expect(col2Box).not.toBeNull()
    expect(col3Box).not.toBeNull()
    expect(col2Box!.x).toBeLessThan(col1Box!.x)
    expect(col1Box!.x).toBeLessThan(col3Box!.x)
  })

  test("multiple shifts preserve cursor and visual order", () => {
    // Use wider terminal for 4 columns
    using app = createTestApp(
      item(
        "board",
        item("col1", item("1a")),
        item("col2", item("2a")),
        item("col3", item("3a")),
        item("col4", item("4a")),
      ),
      { cols: 160, rows: 24 },
    )
    // Navigate to col1 header
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    // Shift col1 right three times (col1 moves: pos 0 -> 1 -> 2 -> 3)
    app.press("opt+l")
    app.expect("#col1[data-cursor]").toExist()
    app.press("opt+l")
    app.expect("#col1[data-cursor]").toExist()
    app.press("opt+l")
    app.expect("#col1[data-cursor]").toExist()

    // col1 should now be at the rightmost position
    // Visual order: col2, col3, col4, col1
    const col1Box = app.q("#col1").boundingBox()
    const col2Box = app.q("#col2").boundingBox()
    const col3Box = app.q("#col3").boundingBox()
    const col4Box = app.q("#col4").boundingBox()
    expect(col1Box).not.toBeNull()
    expect(col2Box).not.toBeNull()
    expect(col3Box).not.toBeNull()
    expect(col4Box).not.toBeNull()
    expect(col2Box!.x).toBeLessThan(col3Box!.x)
    expect(col3Box!.x).toBeLessThan(col4Box!.x)
    expect(col4Box!.x).toBeLessThan(col1Box!.x)

    // Navigate down — should enter col1's card
    app.command("cursor_down")
    app.expect("#1a[data-cursor]").toExist()
  })

  test("shift right then left returns column to original position", () => {
    using app = createTestApp(item.multiColBoard(), { cols: 160, rows: 24 })
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    const c1Before = app.q("#col1").boundingBox()!.x
    const c2Before = app.q("#col2").boundingBox()!.x

    // Shift right (col1 moves to position 1)
    app.press("opt+l")
    app.expect("#col1[data-cursor]").toExist()
    expect(app.q("#col1").boundingBox()!.x, "col1 moved right").toBeGreaterThan(c1Before)

    // Shift left (col1 returns to position 0)
    app.press("opt+h")
    app.expect("#col1[data-cursor]").toExist()
    expect(app.q("#col1").boundingBox()!.x, "col1 returned to original").toBe(c1Before)
    expect(app.q("#col2").boundingBox()!.x, "col2 returned to original").toBe(c2Before)
  })

  test("shift right twice then left once — column ends in middle", () => {
    using app = createTestApp(item.multiColBoard(), { cols: 160, rows: 24 })
    app.command("cursor_up")

    app.press("opt+l") // col1: pos 0 → 1
    app.press("opt+l") // col1: pos 1 → 2
    app.expect("#col1[data-cursor]").toExist()

    app.press("opt+h") // col1: pos 2 → 1
    app.expect("#col1[data-cursor]").toExist()

    // Order should be: col2, col1, col3
    const c1x = app.q("#col1").boundingBox()!.x
    const c2x = app.q("#col2").boundingBox()!.x
    const c3x = app.q("#col3").boundingBox()!.x
    expect(c2x).toBeLessThan(c1x)
    expect(c1x).toBeLessThan(c3x)
  })

  test("shift column with narrow viewport scrolls cursor into view", () => {
    // 80-wide viewport with 3 columns: maxCols = floor(80/35) = 2
    // So only 2 columns visible at once — scroll is active
    using app = createTestApp(item.multiColBoard(), { cols: 80, rows: 24 })
    // Navigate to col1 header
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    // Shift col1 right
    app.press("opt+l")

    // Cursor should still be on col1 — and col1 should be visible (in viewport)
    app.expect("#col1[data-cursor]").toExist()
    const col1Box = app.q("#col1").boundingBox()
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
  test("single J from A selects both A and B", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

    // Cursor starts on A (card 0)
    app.press("shift+ArrowDown") // anchor=A, cursor→B

    // After one J, the selection range should include both A and B
    // Check status message reflects 2 items selected
    const status = app.getStatus()
    expect(status).not.toBeNull()
    expect(status!.message).toContain("2")
  })

  test("batch toggle after single J affects both A and B", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

    // Make A and B proper tasks
    app.repo.updateNode("A", { item: { task: { status: "todo", marker: "[ ]" } } })
    app.repo.updateNode("B", { item: { task: { status: "todo", marker: "[ ]" } } })
    app.repo.updateNode("C", { item: { task: { status: "todo", marker: "[ ]" } } })

    // Re-render to pick up node type changes
    app.press("shift+ArrowDown") // anchor=A, cursor→B — should select range [A, B]

    // Toggle status on selection
    app.command("toggle_task_done")

    // Both A and B should have their status toggled (not just B)
    const statusA = app.repo.getNode("A")?.item?.task?.status
    const statusB = app.repo.getNode("B")?.item?.task?.status
    const statusC = app.repo.getNode("C")?.item?.task?.status

    // A and B should both be toggled away from "todo"
    expect(statusA).not.toBe("todo")
    expect(statusB).not.toBe("todo")
    // C should be untouched
    expect(statusC).toBe("todo")
  })

  test("batch delete after single J removes both A and B", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

    // Cursor on A, press J to select range A→B
    app.press("shift+ArrowDown")

    // Delete the selection
    app.press("Backspace")

    // Both A and B should be deleted, only C remains
    const children = app.repo.getChildren("col1").map((n) => n.id)
    expect(children).toEqual(["C"])
  })
})

describe("shift card boundary detection", () => {
  const singleCol = () => item("board", item("Col", item("a"), item("b"), item("c")))
  const twoCols = () => item("board", item("Col1", item("a")), item("Col2", item("b")))

  test.each([
    {
      name: "shift up at top card",
      fixture: singleCol,
      opts: { cols: 60, rows: 20 },
      nav: [],
      key: "opt+k",
      bell: true,
    },
    {
      name: "shift down at bottom card",
      fixture: () => item("board", item("Col", item("a"), item("b"))),
      opts: { cols: 60, rows: 20 },
      nav: ["j"],
      key: "opt+j",
      bell: true,
    },
    {
      name: "shift left at leftmost column",
      fixture: twoCols,
      opts: { cols: 80, rows: 20 },
      nav: [],
      key: "opt+h",
      bell: true,
    },
    {
      name: "shift right at rightmost column",
      fixture: twoCols,
      opts: { cols: 80, rows: 20 },
      nav: ["l"],
      key: "opt+l",
      bell: true,
    },
    {
      name: "shift down in middle succeeds (no bell)",
      fixture: singleCol,
      opts: { cols: 60, rows: 20 },
      nav: [],
      key: "opt+j",
      bell: false,
    },
    {
      name: "shift up at column header",
      fixture: twoCols,
      opts: { cols: 80, rows: 20 },
      nav: ["k"],
      key: "opt+k",
      bell: true,
    },
  ])("$name", ({ fixture, opts, nav, key, bell }) => {
    using app = createTestApp(fixture, opts)
    for (const k of nav) app.press(k)
    app.press(key)
    expect(app.bell).toBe(bell)
  })
})
