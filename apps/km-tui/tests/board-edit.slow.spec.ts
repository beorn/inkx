/**
 * Board Acceptance Tests - Edit & Move Operations
 *
 * Tests for card shifting (opt+j/k/h/l), deletion (D), inline editing (Enter),
 * undo/redo (ctrl+z/y), and move mode (m).
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import type { KNode } from "@km/core"

// =============================================================================
// Edit Operations
// =============================================================================

describe("Edit Operations", () => {
  test("opt+j shifts card down within column", () => {
    using app = createTestApp(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))),
    )
    app.expect("#1a[data-cursor]").toExist()

    // Shift 1a down (swaps with 1b)
    app.press("opt+j")

    // Cursor should follow the moved card
    app.expect("#1a[data-cursor]").toExist()

    // Verify order changed: 1b should now be above 1a
    const bBox = app.q("#1b").boundingBox()
    const aBox = app.q("#1a").boundingBox()
    expect(bBox!.y).toBeLessThan(aBox!.y)
  })

  test("opt+k shifts card up within column", () => {
    using app = createTestApp(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))),
    )
    // Move to 1b
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()

    // Shift 1b up (swaps with 1a)
    app.press("opt+k")

    // Cursor should follow the moved card
    app.expect("#1b[data-cursor]").toExist()

    // Verify order changed: 1b should now be above 1a
    const bBox = app.q("#1b").boundingBox()
    const aBox = app.q("#1a").boundingBox()
    expect(bBox!.y).toBeLessThan(aBox!.y)
  })

  test("opt+j at bottom boundary does nothing", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b"))))
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()

    app.press("opt+j")

    app.expect("#1b[data-cursor]").toExist()
    const aBox = app.q("#1a").boundingBox()
    const bBox = app.q("#1b").boundingBox()
    expect(aBox!.y).toBeLessThan(bBox!.y)
  })

  test("opt+k at top boundary does nothing", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b"))))
    app.expect("#1a[data-cursor]").toExist()

    app.press("opt+k")

    app.expect("#1a[data-cursor]").toExist()
    const aBox = app.q("#1a").boundingBox()
    const bBox = app.q("#1b").boundingBox()
    expect(aBox!.y).toBeLessThan(bBox!.y)
  })

  test("opt+j then opt+k round-trips card back to original position", () => {
    using app = createTestApp(item.simpleBoard)
    app.expect("#1a[data-cursor]").toExist()

    // Shift down then back up — should return to original position
    app.press("opt+j")
    app.press("opt+k")

    app.expect("#1a[data-cursor]").toExist()
    // 1a should be back at the top
    const aBox = app.q("#1a").boundingBox()
    const bBox = app.q("#1b").boundingBox()
    const cBox = app.q("#1c").boundingBox()
    expect(aBox!.y).toBeLessThan(bBox!.y)
    expect(bBox!.y).toBeLessThan(cBox!.y)
  })

  test("Multiple opt+j shifts card through all positions", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b"), item("1c"), item("1d"))))
    app.expect("#1a[data-cursor]").toExist()

    // Shift 1a all the way down
    app.press("opt+j")
    app.press("opt+j")
    app.press("opt+j")

    // 1a should be at the bottom
    app.expect("#1a[data-cursor]").toExist()
    const bBox = app.q("#1b").boundingBox()
    const cBox = app.q("#1c").boundingBox()
    const dBox = app.q("#1d").boundingBox()
    const aBox = app.q("#1a").boundingBox()
    expect(bBox!.y).toBeLessThan(cBox!.y)
    expect(cBox!.y).toBeLessThan(dBox!.y)
    expect(dBox!.y).toBeLessThan(aBox!.y)
  })

  test("opt+k then opt+j round-trips card back to original position", () => {
    using app = createTestApp(item.simpleBoard)
    // Move to 1b
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()

    // Shift up then back down — should return to original position
    app.press("opt+k")
    app.press("opt+j")

    app.expect("#1b[data-cursor]").toExist()
    // Order should be original: 1a, 1b, 1c
    const aBox = app.q("#1a").boundingBox()
    const bBox = app.q("#1b").boundingBox()
    const cBox = app.q("#1c").boundingBox()
    expect(aBox!.y).toBeLessThan(bBox!.y)
    expect(bBox!.y).toBeLessThan(cBox!.y)
  })

  test("opt+j works when siblings have duplicate parent_idx (all zero)", () => {
    // Simulate the condition where nodes have parent_idx=0 (DB default)
    // This happens when nodes are created without explicit sort order
    const nodes = item.simpleBoard()
    // Force all cards to have parent_idx=0 (DB default scenario)
    for (const n of nodes) {
      if (n.type === "p" && n.item) {
        n.parent_idx = 0
      }
    }
    using app = createTestApp(() => nodes)
    app.expect("#1a[data-cursor]").toExist()

    // Shift 1a down — should move to position 1, not the bottom
    app.press("opt+j")

    app.expect("#1a[data-cursor]").toExist()
    const aBox = app.q("#1a").boundingBox()
    const bBox = app.q("#1b").boundingBox()
    const cBox = app.q("#1c").boundingBox()
    // 1b should be above 1a, 1a above 1c
    expect(bBox!.y).toBeLessThan(aBox!.y)
    expect(aBox!.y).toBeLessThan(cBox!.y)
  })

  test("opt+l shifts card right to next column", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    app.expect("#1a[data-cursor]").toExist()

    app.press("opt+l")

    // Card should now be in col2, cursor follows
    app.expect("#1a[data-cursor]").toExist()

    // 1a should now be horizontally aligned with col2 content
    const aBox = app.q("#1a").boundingBox()
    const twoABox = app.q("#2a").boundingBox()
    expect(aBox!.x).toBe(twoABox!.x)
  })

  test("opt+h shifts card left to previous column", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b"))))
    // Navigate to col2
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    app.press("opt+h")

    // Card should now be in col1, cursor follows
    app.expect("#2a[data-cursor]").toExist()

    // 2a should now be in the same column as 1a (col1).
    // Body cards: selected (2a) has side borders, unselected (1a) has paddingLeft,
    // so nodeBox.x may differ by 1. Check they are in the same column region.
    const twoABox = app.q("#2a").boundingBox()
    const oneABox = app.q("#1a").boundingBox()
    expect(Math.abs(twoABox!.x - oneABox!.x)).toBeLessThanOrEqual(1)
  })

  test("opt+l at rightmost column does nothing", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    app.press("opt+l")

    app.expect("#2a[data-cursor]").toExist()
  })

  test("opt+h at leftmost column does nothing", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    app.expect("#1a[data-cursor]").toExist()

    app.press("opt+h")

    app.expect("#1a[data-cursor]").toExist()
  })

  test("opt+l moves only the cursor column past one neighbor (no jumping with shared parent_idx)", () => {
    // Bug: when columns share parent_idx (e.g. all 0 from folder import), swapping
    // col2's parent_idx with col3's leaves col4 untouched. SQL ORDER BY parent_idx,
    // created_at then sorts col4 between them, making col3 "jump" to the end.
    const nodes = item(
      "board",
      item("col1", item("1a")),
      item("col2", item("2a")),
      item("col3", item("3a")),
      item("col4", item("4a")),
    )
    // Simulate folder import where all columns share parent_idx=0
    for (const n of nodes) {
      if (n.type === "h" && n.parent_id === "board") n.parent_idx = 0
    }
    using app = createTestApp(() => nodes, { cols: 160 })

    // Navigate to col2 header
    app.command("cursor_right")
    app.command("cursor_up")
    app.expect("#col2[data-cursor]").toExist()

    // Move col2 right by one position. Expected order: col1, col3, col2, col4
    app.press("opt+l")
    app.expect("#col2[data-cursor]").toExist()

    const colOrder = app.repo.getChildren("board").map((n) => n.id)
    expect(colOrder).toEqual(["col1", "col3", "col2", "col4"])
  })

  test("opt+l multiple times produces a stable ordered shift (regression: jumping)", () => {
    // Regression for "Column move jumps around": pressing opt+l three times on
    // the same column should walk it from position 0 → 1 → 2 → 3, NOT teleport
    // it past multiple neighbors per press.
    const nodes = item(
      "board",
      item("colA", item("a1")),
      item("colB", item("b1")),
      item("colC", item("c1")),
      item("colD", item("d1")),
    )
    for (const n of nodes) {
      if (n.type === "h" && n.parent_id === "board") n.parent_idx = 0
    }
    using app = createTestApp(() => nodes, { cols: 200 })

    // Cursor on colA header (leftmost)
    app.command("cursor_up")
    app.expect("#colA[data-cursor]").toExist()

    // Step 1
    app.press("opt+l")
    expect(app.repo.getChildren("board").map((n) => n.id)).toEqual(["colB", "colA", "colC", "colD"])

    // Step 2
    app.press("opt+l")
    expect(app.repo.getChildren("board").map((n) => n.id)).toEqual(["colB", "colC", "colA", "colD"])

    // Step 3
    app.press("opt+l")
    expect(app.repo.getChildren("board").map((n) => n.id)).toEqual(["colB", "colC", "colD", "colA"])
  })

  test("opt+l at column header shifts column right", () => {
    using app = createTestApp(item.multiColBoard)
    // Navigate to column header level
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    app.press("opt+l")

    // Cursor should follow the moved column
    app.expect("#col1[data-cursor]").toExist()
    // col1 should now be to the right of col2
    const col1Box = app.q("#col1").boundingBox()
    const col2Box = app.q("#col2").boundingBox()
    expect(col2Box!.x).toBeLessThan(col1Box!.x)
  })

  test("opt+h at column header shifts column left", () => {
    using app = createTestApp(item.multiColBoard)
    // Navigate to col2 header
    app.command("cursor_right")
    app.command("cursor_up")
    app.expect("#col2[data-cursor]").toExist()

    app.press("opt+h")

    // Cursor should follow the moved column
    app.expect("#col2[data-cursor]").toExist()
    // col2 should now be to the left of col1
    const col1Box = app.q("#col1").boundingBox()
    const col2Box = app.q("#col2").boundingBox()
    expect(col2Box!.x).toBeLessThan(col1Box!.x)
  })

  test("opt+l at rightmost column header does nothing", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    app.command("cursor_right")
    app.command("cursor_up")
    app.expect("#col2[data-cursor]").toExist()

    app.press("opt+l")

    app.expect("#col2[data-cursor]").toExist()
    // Order unchanged
    const col1Box = app.q("#col1").boundingBox()
    const col2Box = app.q("#col2").boundingBox()
    expect(col1Box!.x).toBeLessThan(col2Box!.x)
  })

  test("opt+l at column header works when columns have duplicate parent_idx", () => {
    const nodes = item.multiColBoard()
    // Force all columns to have parent_idx=0 (default scenario)
    for (const n of nodes) {
      if (n.type === "h") {
        n.parent_idx = 0
      }
    }
    // Use wide terminal so all 3 columns are visible after reorder
    using app = createTestApp(() => nodes, { cols: 160 })
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    app.press("opt+l")

    app.expect("#col1[data-cursor]").toExist()
    // col1 moved right — verify via sort order instead of bounding box
    // (bounding box depends on viewport scroll position)
    const col1Idx = app.repo.getNode("col1")?.parent_idx ?? -1
    const col2Idx = app.repo.getNode("col2")?.parent_idx ?? -1
    expect(col1Idx).toBeGreaterThan(col2Idx)
  })

  test("opt+l at column header with many duplicate-parent_idx columns completes without hanging", () => {
    // Regression: normalizeColumnSortOrders used to iterate ALL columns and write
    // to disk for each one. With 20+ columns sharing parent_idx=0, this caused hangs.
    const cols = Array.from({ length: 20 }, (_, i) => item(`col${i + 1}`, item(`${i + 1}a`)))
    const nodes = item("board", ...cols)
    for (const n of nodes) {
      if (n.type === "h") n.parent_idx = 0
    }
    using app = createTestApp(() => nodes)
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    // Should complete instantly — only 2 columns normalized, not all 20
    app.press("opt+l")

    app.expect("#col1[data-cursor]").toExist()
    // Verify col1 moved right via sort order (not bounding box — col2 may be off-screen)
    const col1Idx = app.repo.getNode("col1")?.parent_idx ?? -1
    const col2Idx = app.repo.getNode("col2")?.parent_idx ?? -1
    expect(col1Idx).toBeGreaterThan(col2Idx)
  })

  test("opt+l at column header works correctly with virtual body column present", () => {
    // When the board has body content (paragraphs before headings), a virtual __body__
    // column is inserted at index 0, shifting real column array indices by 1.
    // normalizeColumnSortOrders must use shared parent_idx values, not array positions.
    const nodes = [...item("board", item.p("Board description"), item("col1", item("1a")), item("col2", item("2a")))]
    // Force duplicate parent_idx to trigger normalization
    for (const n of nodes) {
      if (n.type === "h" && n.parent_id === "board") n.parent_idx = 0
    }
    using app = createTestApp(() => nodes, { cols: 160 })
    // Navigate past the virtual body column to col1 header
    app.command("cursor_right")
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    app.press("opt+l")

    app.expect("#col1[data-cursor]").toExist()
    // col1 should have moved right of col2
    const col1Idx = app.repo.getNode("col1")?.parent_idx ?? -1
    const col2Idx = app.repo.getNode("col2")?.parent_idx ?? -1
    expect(col1Idx).toBeGreaterThan(col2Idx)
  })

  test("opt+h at leftmost column header does nothing", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    app.press("opt+h")

    app.expect("#col1[data-cursor]").toExist()
    const col1Box = app.q("#col1").boundingBox()
    const col2Box = app.q("#col2").boundingBox()
    expect(col1Box!.x).toBeLessThan(col2Box!.x)
  })

  test("Shift column left multiple times then zoom in doesn't crash", () => {
    using app = createTestApp(() =>
      item(
        "board",
        item("col1", item("1a")),
        item("col2", item("2a")),
        item("col3", item("3a"), item("3b"), item("3c")),
        item("col4", item("4a")),
      ),
    )
    // Navigate to col3 header (right to col2, then right to col3, then up to header)
    app.command("cursor_right")
    app.command("cursor_right")
    app.command("cursor_up")
    app.expect("#col3[data-cursor]").toExist()

    // Shift col3 left twice (col3 → position 1 → position 0)
    app.press("opt+h")
    app.expect("#col3[data-cursor]").toExist()
    app.press("opt+h")
    app.expect("#col3[data-cursor]").toExist()

    // Zoom in ('z' = zoom_inwards) — should not throw "cursor node not in repo"
    app.command("zoom_inwards")

    // After zoom, root should be col3 and cursor on first child
    app.expect("#3a[data-cursor]").toExist()
  })

  test("Backspace deletes the selected node", () => {
    using app = createTestApp(item.simpleBoard)
    app.expect("#1a[data-cursor]").toExist()

    app.press("Backspace")

    // 1a should be gone
    app.expect("#1a").not.toExist()
    // Cursor should move to next card
    expect(app.text).toContain("1b")
  })

  test("Backspace on last card in column moves cursor to previous card", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b"))))
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()

    app.press("Backspace")

    app.expect("#1b").not.toExist()
    app.expect("#1a[data-cursor]").toExist()
  })

  test("Enter in normal mode enters inline edit", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b"))))
    app.expect("#1a[data-cursor]").toExist()

    app.press("Enter")

    // Should be in edit mode - typing should not navigate
    app.command("cursor_down")
    app.command("cursor_up")

    // Board should still show both cards (didn't navigate)
    expect(app.text).toContain("1a")
    expect(app.text).toContain("1b")
  })

  test("ctrl+z undo is unimplemented (no crash)", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b"))))
    app.expect("#1a[data-cursor]").toExist()

    app.press("ctrl+z")

    app.expect("#1a[data-cursor]").toExist()
    expect(app.text).toContain("1a")
    expect(app.text).toContain("1b")
  })

  test("ctrl+y redo is unimplemented (no crash)", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b"))))
    app.expect("#1a[data-cursor]").toExist()

    app.press("ctrl+y")

    app.expect("#1a[data-cursor]").toExist()
    expect(app.text).toContain("1a")
    expect(app.text).toContain("1b")
  })
})

// =============================================================================
// Delete Confirmation Dialog
// =============================================================================

describe("Delete Confirmation", () => {
  test("Backspace on node with children shows confirmation dialog", () => {
    using app = createTestApp(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("other"))),
    )
    app.expect("#parent[data-cursor]").toExist()

    app.press("Backspace")

    // Confirmation dialog should be visible
    expect(app.text).toContain("Delete")
    expect(app.text).toContain("parent")
    expect(app.text).toContain("will be deleted")

    // Parent should still exist (not deleted yet)
    app.expect("#parent").toExist()
  })

  test("Enter confirms delete from confirmation dialog", () => {
    using app = createTestApp(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("other"))),
    )
    app.press("Backspace") // show confirm dialog
    app.press("Enter") // confirm delete

    // Parent and children should be gone
    app.expect("#parent").not.toExist()
    app.expect("#child1").not.toExist()
    app.expect("#child2").not.toExist()

    // Cursor should be on remaining card
    app.expect("#other[data-cursor]").toExist()
  })

  test("Escape cancels delete confirmation dialog", () => {
    using app = createTestApp(() => item("board", item("col1", item("parent", item("child1")), item("other"))))
    app.press("Backspace") // show confirm dialog
    app.press("Escape") // cancel

    // Everything should still be there
    app.expect("#parent").toExist()
    app.expect("#child1").toExist()
    app.expect("#parent[data-cursor]").toExist()
  })

  test("Backspace on column header shows confirmation for column delete", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    // Navigate to column header (k from first card)
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    app.press("Backspace")

    // Confirmation dialog should be visible with child count
    expect(app.text).toContain("Delete")
    expect(app.text).toContain("col1")
    expect(app.text).toContain("will be deleted")

    // Column should still exist
    app.expect("#col1").toExist()
  })

  test("Enter confirms column delete, cursor moves to adjacent column", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    // Navigate to col1 header
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    app.press("Backspace") // show confirm
    app.press("Enter") // confirm delete

    // col1 and its children should be gone
    app.expect("#col1").not.toExist()
    app.expect("#1a").not.toExist()
    app.expect("#1b").not.toExist()

    // col2 should still exist
    app.expect("#col2").toExist()
    expect(app.repo.getNode("2a")).toBeTruthy()
  })
})

// =============================================================================
// Move Mode
// =============================================================================

describe("Move Mode", () => {
  test("m enters move mode, shows MOVE indicator", () => {
    using app = createTestApp(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))),
    )
    app.expect("#1a[data-cursor]").toExist()

    app.command("enter_move_mode")

    expect(app.text).toContain("MOVE")
  })

  test("Escape in move mode cancels and restores cursor", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    app.expect("#1a[data-cursor]").toExist()

    app.command("enter_move_mode")
    expect(app.text).toContain("MOVE")

    // Navigate to different column while in move mode
    app.command("cursor_right")

    // Cancel move mode
    app.press("Escape")

    expect(app.text).not.toMatch(/\bMOVE\b/)
    // Cursor should be restored to original position (1a)
    app.expect("#1a[data-cursor]").toExist()
  })

  test("Enter in move mode confirms move to target column", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    app.expect("#1a[data-cursor]").toExist()

    app.command("enter_move_mode")
    expect(app.text).toContain("MOVE")

    // Navigate to col2
    app.command("cursor_right")

    // Confirm move
    app.press("Enter")

    expect(app.text).not.toMatch(/\bMOVE\b/)

    // 1a should now be in col2 (alongside 2a).
    // Body cards: selected (1a) has side borders, unselected (2a) has paddingLeft,
    // so nodeBox.x may differ by 1. Check they are in the same column region.
    const oneABox = app.q("#1a").boundingBox()
    const twoABox = app.q("#2a").boundingBox()
    expect(Math.abs(oneABox!.x - twoABox!.x)).toBeLessThanOrEqual(1)
  })

  test("move mode allows navigation to pick target", () => {
    using app = createTestApp(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))),
    )
    app.expect("#1a[data-cursor]").toExist()

    app.command("enter_move_mode")

    // Can navigate while in move mode
    app.command("cursor_right")
    expect(app.text).toContain("MOVE")

    // Escape to cancel
    app.press("Escape")
    expect(app.text).not.toMatch(/\bMOVE\b/)
  })

  test("move mode on single card in single column", () => {
    using app = createTestApp(() => item("board", item("col1", item("only"))))
    app.expect("#only[data-cursor]").toExist()

    app.command("enter_move_mode")
    expect(app.text).toContain("MOVE")

    app.press("Escape")
    expect(app.text).not.toMatch(/\bMOVE\b/)
    app.expect("#only[data-cursor]").toExist()
  })

  test("no MOVE indicator in normal navigation mode", () => {
    using app = createTestApp(() =>
      item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
    )

    // Navigate normally - no MOVE indicator
    app.command("cursor_down")
    expect(app.text).not.toContain("MOVE")

    app.command("cursor_right")
    expect(app.text).not.toContain("MOVE")

    app.command("cursor_up")
    expect(app.text).not.toContain("MOVE")
  })
})

// =============================================================================
// Enter on Task — Sibling Creation & Type Preservation
// =============================================================================

describe("Enter on task cards", () => {
  // BUG: Enter on task creates task siblings, but repeated Enter corrupts
  // earlier tasks (task_marker lost, "[ ]" leaks into content) and new items
  // may not inherit task type from siblings.
  // Related: sticky type inheritance (bead km-tui.sticky-type)
  // BUG VARIANT 1: Using item() default tasks (content without prefix).
  // This variant passes — the bug may only manifest with prefixed content
  // from real vault materialization. Kept as a regression guard.
  test("repeated Enter on task preserves task type and does not corrupt siblings", () => {
    using app = createTestApp(() => item("board", item("col1", item("taskA"), item("taskB"))))

    // Verify initial state: both items are tasks (item() creates tasks by default for leaf nodes)
    const taskA = app.repo.getNode("taskA")!
    expect(taskA.item?.task?.marker).toBe("[ ]")
    expect(taskA.item?.task?.status).toBe("todo")
    expect(taskA.item?.list).toBe("-")

    const taskB = app.repo.getNode("taskB")!
    expect(taskB.item?.task?.marker).toBe("[ ]")

    // Step 1: Navigate to taskA and enter edit mode
    app.expect("#taskA[data-cursor]").toExist()
    app.press("Enter") // enter inline edit

    // Step 2: Press Enter at end of title — should create a new task sibling after taskA
    app.press("Enter")

    // Find the newly created node (not taskA, not taskB)
    const col1Children = app.repo.getChildren("col1")
    expect(col1Children.length).toBe(3) // taskA, new node, taskB
    const newNode1 = col1Children.find((n: KNode) => n.id !== "taskA" && n.id !== "taskB")!
    expect(newNode1).toBeDefined()

    // The new node should be a task (inherited from current node)
    expect(newNode1.item?.task?.marker).toBe("[ ]")
    expect(newNode1.item?.task?.status).toBe("todo")
    expect(newNode1.item?.list).toBe("-")

    // taskA should still be a task (not corrupted by the save)
    const taskAAfterFirstEnter = app.repo.getNode("taskA")!
    expect(taskAAfterFirstEnter.item?.task?.marker).toBe("[ ]")
    expect(taskAAfterFirstEnter.item?.task?.status).toBe("todo")
    // Content should NOT contain literal "[ ]" — that means the marker leaked into content
    expect(taskAAfterFirstEnter.content).not.toContain("[ ] [ ]")

    // Step 3: Type "asdf" in the new (empty) task node
    app.press("a")
    app.press("s")
    app.press("d")
    app.press("f")

    // Step 4: Press Enter again — should create another task sibling
    app.press("Enter")

    // Verify taskA is STILL a task (not converted to regular li)
    const taskAAfterSecondEnter = app.repo.getNode("taskA")!
    expect(taskAAfterSecondEnter.item?.task?.marker).toBe("[ ]")
    expect(taskAAfterSecondEnter.item?.task?.status).toBe("todo")
    expect(taskAAfterSecondEnter.item?.list).toBe("-")
    // Content must not have literal "[ ]" leaked in
    expect(taskAAfterSecondEnter.content).not.toMatch(/\[ \] \[ \]/)

    // Verify the "asdf" node is saved as a task with correct content
    const asdfNode = app.repo.getNode(newNode1.id)!
    expect(asdfNode.item?.task?.marker).toBe("[ ]")
    expect(asdfNode.item?.task?.status).toBe("todo")
    // Content should include "asdf" — either as raw or with task prefix
    const asdfText = asdfNode.content ?? ""
    expect(asdfText).toContain("asdf")
    // Content should NOT contain literal unstructured "[ ]"
    expect(asdfText).not.toMatch(/\[ \].*\[ \]/)

    // Verify the newest node (created by second Enter) is also a task
    const col1ChildrenAfter = app.repo.getChildren("col1")
    expect(col1ChildrenAfter.length).toBe(4) // taskA, asdf node, newest node, taskB
    const newestNode = col1ChildrenAfter.find(
      (n: KNode) => n.id !== "taskA" && n.id !== "taskB" && n.id !== newNode1.id,
    )!
    expect(newestNode).toBeDefined()
    expect(newestNode.item?.task?.marker).toBe("[ ]")
    expect(newestNode.item?.task?.status).toBe("todo")
    expect(newestNode.item?.list).toBe("-")
  })

  // BUG VARIANT 2: Tasks with prefixed content (as produced by split or
  // real vault materialization where content = "- [ ] text").
  // Targets: handleTitleSave re-adding the task marker prefix when content
  // already has it, causing double-prefix corruption; and task type loss
  // during repeated Enter cycles.
  // NOTE: This test passes with fake repo because handleTitleSave correctly
  // extracts the marker from content. The real bug likely involves the
  // markdown->DB round-trip (fs sync) which is not exercised in fake repo tests.
  // A .slow.spec with withTestEnv (real DB + vault) is needed to fully reproduce.
  test.skip("repeated Enter on prefixed-content task does not double-prefix or lose task type", () => {
    // Simulate real vault storage: content includes the "- [ ] " prefix
    const nodes = item("board", item("col1", item("taskA"), item("taskB")))
    // Patch content to match real vault format (content includes task prefix)
    for (const n of nodes) {
      if (n.id === "taskA") n.content = "- [ ] taskA"
      if (n.id === "taskB") n.content = "- [ ] taskB"
    }
    using app = createTestApp(() => nodes)

    // Verify initial state
    const taskA = app.repo.getNode("taskA")!
    expect(taskA.item?.task?.marker).toBe("[ ]")
    expect(taskA.content).toBe("- [ ] taskA")

    // Step 1: Enter edit mode on taskA
    app.expect("#taskA[data-cursor]").toExist()
    app.press("Enter")

    // Step 2: Enter at end of title — new task sibling
    app.press("Enter")

    // taskA content should not be double-prefixed (e.g. "- [ ] [ ] taskA")
    const taskAAfter = app.repo.getNode("taskA")!
    expect(taskAAfter.item?.task?.marker).toBe("[ ]")
    expect(taskAAfter.content).not.toMatch(/\[ \].*\[ \]/)

    // Step 3: Type "asdf" and press Enter
    app.press("a")
    app.press("s")
    app.press("d")
    app.press("f")
    app.press("Enter")

    // taskA must still have task_marker (not converted to regular li)
    const taskAFinal = app.repo.getNode("taskA")!
    expect(taskAFinal.item?.task?.marker).toBe("[ ]")
    expect(taskAFinal.item?.task?.status).toBe("todo")
    // Content must not have accumulated multiple "[ ]" prefixes
    expect(taskAFinal.content).not.toMatch(/\[ \].*\[ \]/)

    // All created siblings should be tasks
    const children = app.repo.getChildren("col1")
    for (const child of children) {
      expect(child.item?.task?.marker).toBe("[ ]")
      expect(child.item?.list).toBe("-")
    }
  })

  // Enter at end of task title with visible children → first child inherits task type.
  // Regression: handleAddNodeChildFirst created plain "h" nodes without task properties.
  test("Enter on task with visible children creates task first child", () => {
    const nodes = item("board", item("col1", item("parentTask", item("existingChild")), item("sibling")))
    // Patch parentTask to be a task (item() makes nodes with children folders by default)
    for (const n of nodes) {
      if (n.id === "parentTask") {
        n.item = { ...n.item, task: { marker: "[ ]", status: "todo" } }
        n.item = { ...n.item, list: "-" }
      }
    }
    using app = createTestApp(() => nodes)

    // Verify parentTask is a task
    const parentTask = app.repo.getNode("parentTask")!
    expect(parentTask.item?.task?.marker).toBe("[ ]")
    expect(parentTask.item?.task?.status).toBe("todo")
    expect(parentTask.item?.list).toBe("-")

    // Navigate to parentTask and enter edit mode
    app.expect("#parentTask[data-cursor]").toExist()
    app.press("Enter") // enter inline edit, cursor at end

    // Press Enter at end — parentTask has visible children, so new node becomes first child
    app.press("Enter")

    // Exit edit mode on the new node
    app.press("Escape")

    // New node should be a child of parentTask (not a sibling)
    const parentChildren = app.repo.getChildren("parentTask")
    expect(parentChildren.length).toBe(2) // new node + existingChild
    const newNode = parentChildren.find((n: KNode) => n.id !== "existingChild")!
    expect(newNode).toBeDefined()

    // The new child must inherit task properties from the parent
    expect(newNode.item?.task?.marker).toBe("[ ]")
    expect(newNode.item?.task?.status).toBe("todo")
    expect(newNode.item?.list).toBe("-")

    // existingChild should still be present and unchanged
    expect(parentChildren.some((n: KNode) => n.id === "existingChild")).toBe(true)
  })
})

// =============================================================================
// Delete — DB + Screen Consistency (km-tui.delete-noop)
// =============================================================================

describe("Delete consistency — node removed from BOTH DB and screen", () => {
  test("delete removes node from repo AND screen", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b"), item("1c"))))
    app.expect("#1a[data-cursor]").toExist()

    app.command("delete_node")

    // BOTH checks — screen AND repo must agree
    app.expect("#1a").not.toExist()
    expect(app.repo.getNode("1a")).toBeNull()

    // Cursor moved to surviving card
    app.expect("#1b[data-cursor]").toExist()
  })

  test("delete middle card: DB and screen consistent", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b"), item("1c"))))
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()

    app.command("delete_node")

    app.expect("#1b").not.toExist()
    expect(app.repo.getNode("1b")).toBeNull()
    // Cursor on next surviving card
    app.expect("#1c[data-cursor]").toExist()
    // Other cards still exist
    expect(app.repo.getNode("1a")).not.toBeNull()
    expect(app.repo.getNode("1c")).not.toBeNull()
  })

  test("delete last card: cursor moves to previous, DB agrees", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b"))))
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()

    app.command("delete_node")

    app.expect("#1b").not.toExist()
    expect(app.repo.getNode("1b")).toBeNull()
    app.expect("#1a[data-cursor]").toExist()
    expect(app.repo.getNode("1a")).not.toBeNull()
  })

  test("delete then navigate: no stale references", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b"), item("1c"))))
    app.expect("#1a[data-cursor]").toExist()

    // Delete 1a, cursor → 1b
    app.command("delete_node")
    app.expect("#1b[data-cursor]").toExist()

    // Navigate down to 1c
    app.command("cursor_down")
    app.expect("#1c[data-cursor]").toExist()

    // Navigate back up
    app.command("cursor_up")
    app.expect("#1b[data-cursor]").toExist()

    // No ghost of 1a
    app.expect("#1a").not.toExist()
    expect(app.repo.getNode("1a")).toBeNull()
  })

  test("multi-select delete removes all selected from DB and screen", () => {
    using app = createTestApp(() =>
      item("board", item("col1", item("keep-1"), item("del-A"), item("del-B"), item("keep-2"))),
    )

    // Navigate to del-A
    app.command("cursor_down")
    app.expect("#del-A[data-cursor]").toExist()

    // Extend selection down to cover del-A and del-B
    app.press("shift+ArrowDown")

    // Delete selected cards
    app.command("delete_node")

    // Both should be gone from DB
    expect(app.repo.getNode("del-A")).toBeNull()
    expect(app.repo.getNode("del-B")).toBeNull()

    // And from screen
    app.expect("#del-A").not.toExist()
    app.expect("#del-B").not.toExist()

    // Surviving cards remain
    expect(app.repo.getNode("keep-1")).not.toBeNull()
    expect(app.repo.getNode("keep-2")).not.toBeNull()
  })

  test("undo after delete restores node in DB and screen", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b"))))
    app.expect("#1a[data-cursor]").toExist()

    app.command("delete_node")
    app.expect("#1a").not.toExist()
    expect(app.repo.getNode("1a")).toBeNull()

    // Undo
    app.command("undo")

    // Node should be back in both DB and screen
    expect(app.repo.getNode("1a")).not.toBeNull()
    app.expect("#1a").toExist()
  })
})

// =============================================================================
// Delete Sub-Sub-Item — No [error] (km-tui.delete-shows-error)
// =============================================================================

describe("Delete sub-sub-item renders cleanly, no [error]", () => {
  test("deleting first of two sub-sub-items removes it without [error]", () => {
    // Structure: board > col > card > sub1 + sub2
    // Zoom into col so card becomes a column, sub1/sub2 become cards
    // Then zoom again into card so sub1/sub2 are navigable
    using app = createTestApp(() => item("board", item("col", item("card", item("sub1"), item("sub2")))))
    app.expect("#card[data-cursor]").toExist()

    // Zoom twice: first into col (card becomes column), then into card
    app.command("zoom_inwards")
    app.navigateTo("sub1")
    app.expect("#sub1[data-cursor]").toExist()

    // Delete sub1
    app.command("delete_node")

    // Screen must NOT contain [error]
    expect(app.text).not.toContain("[error]")

    // sub1 should be gone from both screen and repo
    app.expect("#sub1").not.toExist()
    expect(app.repo.getNode("sub1")).toBeNull()

    // sub2 should still exist
    app.expect("#sub2").toExist()
    expect(app.repo.getNode("sub2")).not.toBeNull()
  })

  test("deleting sub-item via repo directly does not show [error] on re-render", () => {
    // Simulates the case where a child node is deleted and the parent re-renders
    using app = createTestApp(() => item("board", item("col", item("card", item("sub1"), item("sub2")))))

    // Directly delete sub1 from the repo (simulating external deletion)
    app.repo.deleteNode("sub1")
    // Force re-render by pressing a no-op key
    app.press("Escape")

    // Screen must NOT contain [error]
    expect(app.text).not.toContain("[error]")
  })
})

// =============================================================================
// Enter After Edit — Sibling Creation (km-tui.enter-jumps-board)
// =============================================================================

describe("Enter after edit creates sibling, not board jump", () => {
  test("Enter during title edit at end creates sibling (not board jump)", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b"))))

    // Enter edit mode on 1a
    app.press("Enter")
    // Move cursor to end of content (it should already be at end)
    app.press("ctrl+e")
    // Press Enter to create sibling
    app.press("Enter")

    // Should have 3 items now (1a + new sibling + 1b)
    const colChildren = app.repo.getChildren("col1")
    expect(colChildren.length).toBe(3)

    // Cursor should NOT be on column header or board
    // The new sibling should be in edit mode (inline editing)
    // We can verify by checking that we're NOT at the column level
    expect(app.text).toContain("1a")
    expect(app.text).toContain("1b")
  })

  test("Enter → type → Enter creates chain of siblings at card level", () => {
    using app = createTestApp(() => item("board", item("col1", item("1a"))))

    app.press("Enter") // edit 1a
    app.press("Enter") // save + new sibling (editing new sibling)
    app.press("Enter") // save new sibling + another new sibling

    // Should have 3 items in column
    const colChildren = app.repo.getChildren("col1")
    expect(colChildren.length).toBe(3)
  })
})

// =============================================================================
// Regression: edit-save-repro.test.ts (bead: km-tui.edit-save-broken)
// =============================================================================

describe("Regression: edit-save-repro — Enter + type + Enter/Escape saves text on new node", () => {
  // === Scenario 1: Task cards (most common) ===

  test("Enter on task card → type → Escape: saves text to NEW sibling", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))

    app.expect("#task1[data-cursor]").toExist()

    // Enter edit mode on task1, then Enter at end → creates new task sibling
    app.press("Enter")
    app.press("Enter")

    // Type text into the new node
    for (const c of "hello world") {
      if (c === " ") app.press("Space")
      else app.press(c)
    }

    // Escape → save and exit
    app.press("Escape")

    // Text should be on screen
    expect(app).toContainText("hello world")

    // Text should be in repo
    const children = app.repo.getChildren("col")
    const newNode = children.find((c) => (c.content ?? "").includes("hello world"))
    expect(newNode).toBeDefined()
  })

  test("Enter on task card → type → Enter: saves first node, creates second", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))

    app.expect("#task1[data-cursor]").toExist()
    app.press("Enter") // edit task1
    app.press("Enter") // new sibling A, edit A

    // Type in node A
    for (const c of "nodeA") app.press(c)

    // Enter again → save A, create node B, edit B
    app.press("Enter")

    // "nodeA" should be visible (saved before creating B)
    expect(app).toContainText("nodeA")

    // Verify in repo
    const children = app.repo.getChildren("col")
    const nodeA = children.find((c) => (c.content ?? "").includes("nodeA"))
    expect(nodeA).toBeDefined()

    // Escape from B
    app.press("Escape")
  })

  // === Scenario 2: 'o' insert creates mdsection for non-task parents ===

  test("'o' on non-task heading card → type → Escape: saves text (no untitled section)", () => {
    using app = createTestApp(item("board", item("col", item.section("heading-card"), item("task2"))))

    app.expect("#heading-card[data-cursor]").toExist()

    // 'o' in normal mode → INSERT_BELOW → handleAddNodeAfter
    app.press("o")

    // Type text
    for (const c of "new text") {
      if (c === " ") app.press("Space")
      else app.press(c)
    }

    // Escape
    app.press("Escape")

    // Verify text is saved and displayed
    expect(app).toContainText("new text")
    expect(app.text).not.toContain("(untitled section)")

    // Verify in repo
    const children = app.repo.getChildren("col")
    const newNode = children.find((c) => c.id !== "heading-card" && c.id !== "task2")
    expect(newNode).toBeDefined()
    expect(newNode!.content).toContain("new text")
  })

  // === Scenario 3: Multiple rapid Enter + type sequences ===

  test("rapid Enter-type-Enter-type chain preserves all text", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))

    app.press("Enter") // edit task1
    app.press("Enter") // new sibling A

    for (const c of "first") app.press(c)
    app.press("Enter") // save A, new sibling B

    for (const c of "second") app.press(c)
    app.press("Enter") // save B, new sibling C

    for (const c of "third") app.press(c)
    app.press("Escape") // save C

    expect(app).toContainText("first")
    expect(app).toContainText("second")
    expect(app).toContainText("third")
  })

  // === Scenario 4: extractProps data inheritance ===

  test("new node created via Enter does NOT inherit data.name from source node", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))

    // Manually set data.name on task1 to simulate real vault node
    app.repo.updateNode("task1", { data: { name: "Old Name" } })

    app.press("Enter") // edit task1
    app.press("Enter") // new sibling (extractProps should NOT copy data)

    // Type text into new node
    for (const c of "New Text") {
      if (c === " ") app.press("Space")
      else app.press(c)
    }
    app.press("Escape")

    // The new node should show "New Text", not "Old Name"
    expect(app).toContainText("New Text")

    // Check that the new node's data.name is NOT inherited from task1
    const children = app.repo.getChildren("col")
    const newNode = children.find((c) => c.id !== "task1" && c.id !== "task2")
    expect(newNode).toBeDefined()
    // The content should be saved
    expect(newNode!.content).toContain("New Text")
    // data should NOT be inherited from source — it's a system field
    expect(newNode!.data?.name).toBeUndefined()
  })
})

// =============================================================================
// Degradation stays in edit mode (backspace/delete at node boundaries)
// =============================================================================

describe("Degradation stays in edit mode", () => {
  test("backspace at pos 0 degrades task trait and stays in edit mode", () => {
    using app = createTestApp(() => item("board", item("col1", item("first"), item("second"))))

    app.command("cursor_down")
    app.press("Enter")
    app.expectEditing("second")
    app.press("ctrl+a")

    // Backspace at position 0 degrades the task trait (strips checkbox)
    app.press("Backspace")

    // After degradation, should STAY in edit mode on the same node
    app.expectEditing("second")

    // Node should still exist but no longer be a task
    const node = app.repo.getNode("second")
    expect(node).toBeDefined()
    expect(node?.item?.task).toBeUndefined()

    // Can still type — proving edit mode is active
    app.press("X")
    app.press("Escape")
    expect(app.repo.getNode("second")?.content).toBe("Xsecond")
  })

  test("forward-delete at end degrades next sibling and stays in edit mode", () => {
    using app = createTestApp(() => item("board", item("col1", item("alpha"), item("beta"))))

    app.press("Enter")
    app.expectEditing("alpha")

    // Delete at end — degrades beta's task trait
    app.press("Delete")

    // After degradation, should STAY in edit mode on alpha
    app.expectEditing("alpha")

    // Beta should still exist but no longer be a task
    const beta = app.repo.getNode("beta")
    expect(beta).toBeDefined()
    expect(beta?.item?.task).toBeUndefined()

    // Can still type on alpha — proving edit mode is active
    app.press("!")
    app.press("Escape")
    expect(app.repo.getNode("alpha")?.content).toBe("alpha!")
  })
})

// =============================================================================
// Empty node deletion stays in edit mode on neighbor
// =============================================================================

describe("Edit-after-delete", () => {
  test("backspace on empty card stays in edit mode on previous sibling", () => {
    using app = createTestApp(() => item("board", item("col1", item("prev"), item("x"), item("next"))))
    app.command("cursor_down") // cursor → x
    app.press("Enter") // edit "x"
    app.expectEditing("x")
    app.press("Backspace") // "x" → ""
    app.press("Backspace") // delete empty → edit prev at end

    // x should be deleted
    expect(app.repo.getNode("x")).toBeNull()
    // Should be editing "prev" now
    app.expectEditing("prev")
    // Verify we can type into prev
    app.press("!")
    app.press("Escape")
    expect(app.repo.getNode("prev")?.content).toBe("prev!")
  })

  test("forward-delete on empty card stays in edit mode on next sibling", () => {
    using app = createTestApp(() => item("board", item("col1", item("prev"), item("x"), item("next"))))
    app.command("cursor_down") // cursor → x
    app.press("Enter") // edit "x", cursor at end
    app.expectEditing("x")
    app.press("Backspace") // "x" → "", cursor at 0
    app.press("Delete") // delete empty → edit next at start

    // x should be deleted
    expect(app.repo.getNode("x")).toBeNull()
    // Should be editing "next" now
    app.expectEditing("next")
    // Verify we can type into next at start
    app.press("!")
    app.press("Escape")
    expect(app.repo.getNode("next")?.content).toBe("!next")
  })
})
