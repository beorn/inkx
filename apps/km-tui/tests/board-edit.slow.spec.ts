/**
 * Board Acceptance Tests - Edit & Move Operations
 *
 * Tests for card shifting (opt+j/k/h/l), deletion (D), inline editing (Enter),
 * undo/redo (Control+z/y), and move mode (m).
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"

// =============================================================================
// Edit Operations
// =============================================================================

describe("Edit Operations", () => {
  test("opt+j shifts card down within column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    // Shift 1a down (swaps with 1b)
    board.press("opt+j")

    // Cursor should follow the moved card
    board.expect("#1a[data-cursor]").toExist()

    // Verify order changed: 1b should now be above 1a
    const bBox = board.q("#1b").boundingBox()
    const aBox = board.q("#1a").boundingBox()
    expect(bBox!.y).toBeLessThan(aBox!.y)
  })

  test("opt+k shifts card up within column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))),
    )
    // Move to 1b
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()

    // Shift 1b up (swaps with 1a)
    board.press("opt+k")

    // Cursor should follow the moved card
    board.expect("#1b[data-cursor]").toExist()

    // Verify order changed: 1b should now be above 1a
    const bBox = board.q("#1b").boundingBox()
    const aBox = board.q("#1a").boundingBox()
    expect(bBox!.y).toBeLessThan(aBox!.y)
  })

  test("opt+j at bottom boundary does nothing", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()

    board.press("opt+j")

    board.expect("#1b[data-cursor]").toExist()
    const aBox = board.q("#1a").boundingBox()
    const bBox = board.q("#1b").boundingBox()
    expect(aBox!.y).toBeLessThan(bBox!.y)
  })

  test("opt+k at top boundary does nothing", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("opt+k")

    board.expect("#1a[data-cursor]").toExist()
    const aBox = board.q("#1a").boundingBox()
    const bBox = board.q("#1b").boundingBox()
    expect(aBox!.y).toBeLessThan(bBox!.y)
  })

  test("opt+j then opt+k round-trips card back to original position", () => {
    const { board } = testEnv(item.simpleBoard)
    board.expect("#1a[data-cursor]").toExist()

    // Shift down then back up — should return to original position
    board.press("opt+j")
    board.press("opt+k")

    board.expect("#1a[data-cursor]").toExist()
    // 1a should be back at the top
    const aBox = board.q("#1a").boundingBox()
    const bBox = board.q("#1b").boundingBox()
    const cBox = board.q("#1c").boundingBox()
    expect(aBox!.y).toBeLessThan(bBox!.y)
    expect(bBox!.y).toBeLessThan(cBox!.y)
  })

  test("Multiple opt+j shifts card through all positions", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"), item("1c"), item("1d"))))
    board.expect("#1a[data-cursor]").toExist()

    // Shift 1a all the way down
    board.press("opt+j")
    board.press("opt+j")
    board.press("opt+j")

    // 1a should be at the bottom
    board.expect("#1a[data-cursor]").toExist()
    const bBox = board.q("#1b").boundingBox()
    const cBox = board.q("#1c").boundingBox()
    const dBox = board.q("#1d").boundingBox()
    const aBox = board.q("#1a").boundingBox()
    expect(bBox!.y).toBeLessThan(cBox!.y)
    expect(cBox!.y).toBeLessThan(dBox!.y)
    expect(dBox!.y).toBeLessThan(aBox!.y)
  })

  test("opt+k then opt+j round-trips card back to original position", () => {
    const { board } = testEnv(item.simpleBoard)
    // Move to 1b
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()

    // Shift up then back down — should return to original position
    board.press("opt+k")
    board.press("opt+j")

    board.expect("#1b[data-cursor]").toExist()
    // Order should be original: 1a, 1b, 1c
    const aBox = board.q("#1a").boundingBox()
    const bBox = board.q("#1b").boundingBox()
    const cBox = board.q("#1c").boundingBox()
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
    const { board } = testEnv(() => nodes)
    board.expect("#1a[data-cursor]").toExist()

    // Shift 1a down — should move to position 1, not the bottom
    board.press("opt+j")

    board.expect("#1a[data-cursor]").toExist()
    const aBox = board.q("#1a").boundingBox()
    const bBox = board.q("#1b").boundingBox()
    const cBox = board.q("#1c").boundingBox()
    // 1b should be above 1a, 1a above 1c
    expect(bBox!.y).toBeLessThan(aBox!.y)
    expect(aBox!.y).toBeLessThan(cBox!.y)
  })

  test("opt+l shifts card right to next column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("opt+l")

    // Card should now be in col2, cursor follows
    board.expect("#1a[data-cursor]").toExist()

    // 1a should now be horizontally aligned with col2 content
    const aBox = board.q("#1a").boundingBox()
    const twoABox = board.q("#2a").boundingBox()
    expect(aBox!.x).toBe(twoABox!.x)
  })

  test("opt+h shifts card left to previous column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b"))))
    // Navigate to col2
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()

    board.press("opt+h")

    // Card should now be in col1, cursor follows
    board.expect("#2a[data-cursor]").toExist()

    // 2a should now be in the same column as 1a (col1).
    // Body cards: selected (2a) has side borders, unselected (1a) has paddingLeft,
    // so nodeBox.x may differ by 1. Check they are in the same column region.
    const twoABox = board.q("#2a").boundingBox()
    const oneABox = board.q("#1a").boundingBox()
    expect(Math.abs(twoABox!.x - oneABox!.x)).toBeLessThanOrEqual(1)
  })

  test("opt+l at rightmost column does nothing", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()

    board.press("opt+l")

    board.expect("#2a[data-cursor]").toExist()
  })

  test("opt+h at leftmost column does nothing", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("opt+h")

    board.expect("#1a[data-cursor]").toExist()
  })

  test("opt+l at column header shifts column right", () => {
    const { board } = testEnv(item.multiColBoard)
    // Navigate to column header level
    board.command("cursor_up")
    board.expect("#col1[data-cursor]").toExist()

    board.press("opt+l")

    // Cursor should follow the moved column
    board.expect("#col1[data-cursor]").toExist()
    // col1 should now be to the right of col2
    const col1Box = board.q("#col1").boundingBox()
    const col2Box = board.q("#col2").boundingBox()
    expect(col2Box!.x).toBeLessThan(col1Box!.x)
  })

  test("opt+h at column header shifts column left", () => {
    const { board } = testEnv(item.multiColBoard)
    // Navigate to col2 header
    board.command("cursor_right")
    board.command("cursor_up")
    board.expect("#col2[data-cursor]").toExist()

    board.press("opt+h")

    // Cursor should follow the moved column
    board.expect("#col2[data-cursor]").toExist()
    // col2 should now be to the left of col1
    const col1Box = board.q("#col1").boundingBox()
    const col2Box = board.q("#col2").boundingBox()
    expect(col2Box!.x).toBeLessThan(col1Box!.x)
  })

  test("opt+l at rightmost column header does nothing", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    board.command("cursor_right")
    board.command("cursor_up")
    board.expect("#col2[data-cursor]").toExist()

    board.press("opt+l")

    board.expect("#col2[data-cursor]").toExist()
    // Order unchanged
    const col1Box = board.q("#col1").boundingBox()
    const col2Box = board.q("#col2").boundingBox()
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
    const { board, repo } = testEnv(() => nodes, { columns: 160 })
    board.command("cursor_up")
    board.expect("#col1[data-cursor]").toExist()

    board.press("opt+l")

    board.expect("#col1[data-cursor]").toExist()
    // col1 moved right — verify via sort order instead of bounding box
    // (bounding box depends on viewport scroll position)
    const col1Idx = repo.getNode("col1")?.parent_idx ?? -1
    const col2Idx = repo.getNode("col2")?.parent_idx ?? -1
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
    const { board, repo } = testEnv(() => nodes)
    board.command("cursor_up")
    board.expect("#col1[data-cursor]").toExist()

    // Should complete instantly — only 2 columns normalized, not all 20
    board.press("opt+l")

    board.expect("#col1[data-cursor]").toExist()
    // Verify col1 moved right via sort order (not bounding box — col2 may be off-screen)
    const col1Idx = repo.getNode("col1")?.parent_idx ?? -1
    const col2Idx = repo.getNode("col2")?.parent_idx ?? -1
    expect(col1Idx).toBeGreaterThan(col2Idx)
  })

  test("opt+l at column header works correctly with virtual body column present", () => {
    // When the board has body content (paragraphs before headings), a virtual __body__
    // column is inserted at index 0, shifting real column array indices by 1.
    // normalizeColumnSortOrders must use shared parent_idx values, not array positions.
    const nodes = [
      ...item("board", item.paragraph("Board description"), item("col1", item("1a")), item("col2", item("2a"))),
    ]
    // Force duplicate parent_idx to trigger normalization
    for (const n of nodes) {
      if (n.type === "h" && n.parent_id === "board") n.parent_idx = 0
    }
    const { board, repo } = testEnv(() => nodes, { columns: 160 })
    // Navigate past the virtual body column to col1 header
    board.command("cursor_right")
    board.command("cursor_up")
    board.expect("#col1[data-cursor]").toExist()

    board.press("opt+l")

    board.expect("#col1[data-cursor]").toExist()
    // col1 should have moved right of col2
    const col1Idx = repo.getNode("col1")?.parent_idx ?? -1
    const col2Idx = repo.getNode("col2")?.parent_idx ?? -1
    expect(col1Idx).toBeGreaterThan(col2Idx)
  })

  test("opt+h at leftmost column header does nothing", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    board.command("cursor_up")
    board.expect("#col1[data-cursor]").toExist()

    board.press("opt+h")

    board.expect("#col1[data-cursor]").toExist()
    const col1Box = board.q("#col1").boundingBox()
    const col2Box = board.q("#col2").boundingBox()
    expect(col1Box!.x).toBeLessThan(col2Box!.x)
  })

  test("Shift column left multiple times then zoom in doesn't crash", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a")),
        item("col2", item("2a")),
        item("col3", item("3a"), item("3b"), item("3c")),
        item("col4", item("4a")),
      ),
    )
    // Navigate to col3 header (right to col2, then right to col3, then up to header)
    board.command("cursor_right")
    board.command("cursor_right")
    board.command("cursor_up")
    board.expect("#col3[data-cursor]").toExist()

    // Shift col3 left twice (col3 → position 1 → position 0)
    board.press("opt+h")
    board.expect("#col3[data-cursor]").toExist()
    board.press("opt+h")
    board.expect("#col3[data-cursor]").toExist()

    // Zoom in ('z' = zoom_inwards) — should not throw "cursor node not in repo"
    board.command("zoom_inwards")

    // After zoom, root should be col3 and cursor on first child
    board.expect("#3a[data-cursor]").toExist()
  })

  test("Backspace deletes the selected node", () => {
    const { board } = testEnv(item.simpleBoard)
    board.expect("#1a[data-cursor]").toExist()

    board.press("Backspace")

    // 1a should be gone
    board.expect("#1a").not.toExist()
    // Cursor should move to next card
    const output = board.screenshot()
    expect(output).toContain("1b")
  })

  test("Backspace on last card in column moves cursor to previous card", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()

    board.press("Backspace")

    board.expect("#1b").not.toExist()
    board.expect("#1a[data-cursor]").toExist()
  })

  test("Enter in normal mode enters inline edit", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("Enter")

    // Should be in edit mode - typing should not navigate
    board.command("cursor_down")
    board.command("cursor_up")

    // Board should still show both cards (didn't navigate)
    const output = board.screenshot()
    expect(output).toContain("1a")
    expect(output).toContain("1b")
  })

  test("Control+z undo is unimplemented (no crash)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("Control+z")

    board.expect("#1a[data-cursor]").toExist()
    const output = board.screenshot()
    expect(output).toContain("1a")
    expect(output).toContain("1b")
  })

  test("Control+y redo is unimplemented (no crash)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("Control+y")

    board.expect("#1a[data-cursor]").toExist()
    const output = board.screenshot()
    expect(output).toContain("1a")
    expect(output).toContain("1b")
  })
})

// =============================================================================
// Delete Confirmation Dialog
// =============================================================================

describe("Delete Confirmation", () => {
  test("Backspace on node with children shows confirmation dialog", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("other"))),
    )
    board.expect("#parent[data-cursor]").toExist()

    board.press("Backspace")

    // Confirmation dialog should be visible
    const output = board.screenshot()
    expect(output).toContain("Delete")
    expect(output).toContain("parent")
    expect(output).toContain("will be deleted")

    // Parent should still exist (not deleted yet)
    board.expect("#parent").toExist()
  })

  test("Enter confirms delete from confirmation dialog", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("other"))),
    )
    board.press("Backspace") // show confirm dialog
    board.press("Enter") // confirm delete

    // Parent and children should be gone
    board.expect("#parent").not.toExist()
    board.expect("#child1").not.toExist()
    board.expect("#child2").not.toExist()

    // Cursor should be on remaining card
    board.expect("#other[data-cursor]").toExist()
  })

  test("Escape cancels delete confirmation dialog", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("child1")), item("other"))))
    board.press("Backspace") // show confirm dialog
    board.press("Escape") // cancel

    // Everything should still be there
    board.expect("#parent").toExist()
    board.expect("#child1").toExist()
    board.expect("#parent[data-cursor]").toExist()
  })

  test("Backspace on column header shows confirmation for column delete", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    // Navigate to column header (k from first card)
    board.command("cursor_up")
    board.expect("#col1[data-cursor]").toExist()

    board.press("Backspace")

    // Confirmation dialog should be visible with child count
    const output = board.screenshot()
    expect(output).toContain("Delete")
    expect(output).toContain("col1")
    expect(output).toContain("will be deleted")

    // Column should still exist
    board.expect("#col1").toExist()
  })

  test("Enter confirms column delete, cursor moves to adjacent column", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    // Navigate to col1 header
    board.command("cursor_up")
    board.expect("#col1[data-cursor]").toExist()

    board.press("Backspace") // show confirm
    board.press("Enter") // confirm delete

    // col1 and its children should be gone
    board.expect("#col1").not.toExist()
    board.expect("#1a").not.toExist()
    board.expect("#1b").not.toExist()

    // col2 should still exist
    board.expect("#col2").toExist()
    expect(repo.getNode("2a")).toBeTruthy()
  })
})

// =============================================================================
// Move Mode
// =============================================================================

describe("Move Mode", () => {
  test("m enters move mode, shows MOVE indicator", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.command("enter_move_mode")

    const output = board.screenshot()
    expect(output).toContain("MOVE")
  })

  test("Escape in move mode cancels and restores cursor", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    board.command("enter_move_mode")
    expect(board.screenshot()).toContain("MOVE")

    // Navigate to different column while in move mode
    board.command("cursor_right")

    // Cancel move mode
    board.press("Escape")

    expect(board.screenshot()).not.toMatch(/\bMOVE\b/)
    // Cursor should be restored to original position (1a)
    board.expect("#1a[data-cursor]").toExist()
  })

  test("Enter in move mode confirms move to target column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    board.command("enter_move_mode")
    expect(board.screenshot()).toContain("MOVE")

    // Navigate to col2
    board.command("cursor_right")

    // Confirm move
    board.press("Enter")

    expect(board.screenshot()).not.toMatch(/\bMOVE\b/)

    // 1a should now be in col2 (alongside 2a).
    // Body cards: selected (1a) has side borders, unselected (2a) has paddingLeft,
    // so nodeBox.x may differ by 1. Check they are in the same column region.
    const oneABox = board.q("#1a").boundingBox()
    const twoABox = board.q("#2a").boundingBox()
    expect(Math.abs(oneABox!.x - twoABox!.x)).toBeLessThanOrEqual(1)
  })

  test("move mode allows navigation to pick target", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.command("enter_move_mode")

    // Can navigate while in move mode
    board.command("cursor_right")
    expect(board.screenshot()).toContain("MOVE")

    // Escape to cancel
    board.press("Escape")
    expect(board.screenshot()).not.toMatch(/\bMOVE\b/)
  })

  test("move mode on single card in single column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("only"))))
    board.expect("#only[data-cursor]").toExist()

    board.command("enter_move_mode")
    expect(board.screenshot()).toContain("MOVE")

    board.press("Escape")
    expect(board.screenshot()).not.toMatch(/\bMOVE\b/)
    board.expect("#only[data-cursor]").toExist()
  })

  test("no MOVE indicator in normal navigation mode", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
    )

    // Navigate normally - no MOVE indicator
    board.command("cursor_down")
    expect(board.screenshot()).not.toContain("MOVE")

    board.command("cursor_right")
    expect(board.screenshot()).not.toContain("MOVE")

    board.command("cursor_up")
    expect(board.screenshot()).not.toContain("MOVE")
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
    const { board, repo } = testEnv(() => item("board", item("col1", item("taskA"), item("taskB"))))

    // Verify initial state: both items are tasks (item() creates tasks by default for leaf nodes)
    const taskA = repo.getNode("taskA")!
    expect(taskA.task_marker).toBe("[ ]")
    expect(taskA.task_status).toBe("todo")
    expect(taskA.list_marker).toBe("-")

    const taskB = repo.getNode("taskB")!
    expect(taskB.task_marker).toBe("[ ]")

    // Step 1: Navigate to taskA and enter edit mode
    board.expect("#taskA[data-cursor]").toExist()
    board.press("Enter") // enter inline edit

    // Step 2: Press Enter at end of title — should create a new task sibling after taskA
    board.press("Enter")

    // Find the newly created node (not taskA, not taskB)
    const col1Children = repo.getChildren("col1")
    expect(col1Children.length).toBe(3) // taskA, new node, taskB
    const newNode1 = col1Children.find((n: KNode) => n.id !== "taskA" && n.id !== "taskB")!
    expect(newNode1).toBeDefined()

    // The new node should be a task (inherited from current node)
    expect(newNode1.task_marker).toBe("[ ]")
    expect(newNode1.task_status).toBe("todo")
    expect(newNode1.list_marker).toBe("-")

    // taskA should still be a task (not corrupted by the save)
    const taskAAfterFirstEnter = repo.getNode("taskA")!
    expect(taskAAfterFirstEnter.task_marker).toBe("[ ]")
    expect(taskAAfterFirstEnter.task_status).toBe("todo")
    // Content should NOT contain literal "[ ]" — that means the marker leaked into content
    expect(taskAAfterFirstEnter.content).not.toContain("[ ] [ ]")

    // Step 3: Type "asdf" in the new (empty) task node
    board.press("a")
    board.press("s")
    board.press("d")
    board.press("f")

    // Step 4: Press Enter again — should create another task sibling
    board.press("Enter")

    // Verify taskA is STILL a task (not converted to regular li)
    const taskAAfterSecondEnter = repo.getNode("taskA")!
    expect(taskAAfterSecondEnter.task_marker).toBe("[ ]")
    expect(taskAAfterSecondEnter.task_status).toBe("todo")
    expect(taskAAfterSecondEnter.list_marker).toBe("-")
    // Content must not have literal "[ ]" leaked in
    expect(taskAAfterSecondEnter.content).not.toMatch(/\[ \] \[ \]/)

    // Verify the "asdf" node is saved as a task with correct content
    const asdfNode = repo.getNode(newNode1.id)!
    expect(asdfNode.task_marker).toBe("[ ]")
    expect(asdfNode.task_status).toBe("todo")
    // Content should include "asdf" — either as raw or with task prefix
    const asdfText = asdfNode.content ?? ""
    expect(asdfText).toContain("asdf")
    // Content should NOT contain literal unstructured "[ ]"
    expect(asdfText).not.toMatch(/\[ \].*\[ \]/)

    // Verify the newest node (created by second Enter) is also a task
    const col1ChildrenAfter = repo.getChildren("col1")
    expect(col1ChildrenAfter.length).toBe(4) // taskA, asdf node, newest node, taskB
    const newestNode = col1ChildrenAfter.find(
      (n: KNode) => n.id !== "taskA" && n.id !== "taskB" && n.id !== newNode1.id,
    )!
    expect(newestNode).toBeDefined()
    expect(newestNode.task_marker).toBe("[ ]")
    expect(newestNode.task_status).toBe("todo")
    expect(newestNode.list_marker).toBe("-")
  })

  // BUG VARIANT 2: Tasks with prefixed content (as produced by splitNode or
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
    const { board, repo } = testEnv(() => nodes)

    // Verify initial state
    const taskA = repo.getNode("taskA")!
    expect(taskA.task_marker).toBe("[ ]")
    expect(taskA.content).toBe("- [ ] taskA")

    // Step 1: Enter edit mode on taskA
    board.expect("#taskA[data-cursor]").toExist()
    board.press("Enter")

    // Step 2: Enter at end of title — new task sibling
    board.press("Enter")

    // taskA content should not be double-prefixed (e.g. "- [ ] [ ] taskA")
    const taskAAfter = repo.getNode("taskA")!
    expect(taskAAfter.task_marker).toBe("[ ]")
    expect(taskAAfter.content).not.toMatch(/\[ \].*\[ \]/)

    // Step 3: Type "asdf" and press Enter
    board.press("a")
    board.press("s")
    board.press("d")
    board.press("f")
    board.press("Enter")

    // taskA must still have task_marker (not converted to regular li)
    const taskAFinal = repo.getNode("taskA")!
    expect(taskAFinal.task_marker).toBe("[ ]")
    expect(taskAFinal.task_status).toBe("todo")
    // Content must not have accumulated multiple "[ ]" prefixes
    expect(taskAFinal.content).not.toMatch(/\[ \].*\[ \]/)

    // All created siblings should be tasks
    const children = repo.getChildren("col1")
    for (const child of children) {
      expect(child.task_marker).toBe("[ ]")
      expect(child.list_marker).toBe("-")
    }
  })
})
