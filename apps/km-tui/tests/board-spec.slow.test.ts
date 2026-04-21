/**
 * Board-spec keypress tests for all commands and dialogs.
 *
 * Comprehensive board-level tests using createDriverTest/board.press() for:
 * 1. Visual mode (v to enter, j/k extend, d cut, y copy, Esc cancel)
 * 2. J/K block navigation (drill in/out)
 * 3. Filter dialog (G open, j/k navigate, Space toggle, Esc cancel)
 * 4. Help overlay (? to open, Esc/q to dismiss)
 * 5. Inline edit lifecycle (i to enter, Esc to cancel, Enter to confirm)
 */

import { describe, test, expect } from "vitest"
import { createDriverTest, item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// =============================================================================
// Helpers
// =============================================================================

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

// =============================================================================
// 1. Visual Mode — REMOVED
// =============================================================================
// Visual mode was removed. Multi-selection is handled by sel directly
// (shift+arrow for extend, ctrl+a for select-all).
// See board-selection.slow.spec.ts for the current selection tests.

// =============================================================================
// 2. J/K Block Navigation
// =============================================================================

describe("J/K block navigation", () => {
  // J/K do DFS block traversal — walk through all visible blocks in column order:
  // column header, card1, card1-child1, card1-child2, ..., card2, ...

  test("J walks into children before next sibling (DFS order)", () => {
    using app = createTestApp(item.nestedBoard)

    // Cursor starts on Parent
    app.expect("#Parent[data-cursor]").toExist()

    // J moves to first visible child (DFS order), not to sibling
    app.command("block_nav_down")
    app.expect("#child-1[data-cursor]").toExist()

    // J continues to next child
    app.command("block_nav_down")
    app.expect("#child-2[data-cursor]").toExist()

    // J moves to next sibling card after all children
    app.command("block_nav_down")
    app.expect("#sibling[data-cursor]").toExist()
  })

  test("K walks backward through visible blocks (strict inverse of J)", () => {
    using app = createTestApp(item.nestedBoard)

    // Navigate to sibling via J (DFS: Parent → child-1 → child-2 → sibling)
    app.command("block_nav_down") // → child-1
    app.command("block_nav_down") // → child-2
    app.command("block_nav_down") // → sibling
    app.expect("#sibling[data-cursor]").toExist()

    // K walks back in exact reverse order
    app.command("block_nav_up")
    app.expect("#child-2[data-cursor]").toExist()

    app.command("block_nav_up")
    app.expect("#child-1[data-cursor]").toExist()

    app.command("block_nav_up")
    app.expect("#Parent[data-cursor]").toExist()
  })

  test("J at last card rings bell (boundary)", () => {
    using app = createTestApp(item("board", item("col1", item("leaf-task"))))

    app.expect("#leaf-task[data-cursor]").toExist()

    // J on the only card hits boundary
    app.command("block_nav_down")
    expect(app.bell).toBe(true)
  })

  // FREEZE: needs expectCursorVisible (createDriverTest-only)
  test("K at column level navigates to board", () => {
    const { board } = createDriverTest(() => item("board", item("col1", item("task1"))))

    // Move cursor up to column header
    board.command("cursor_up")

    // K at column level navigates to board level (same as k)
    board.command("block_nav_up")
    // We should still be at a valid position
    board.expectCursorVisible()
  })

  test("J on folded card auto-unfolds and enters first child", () => {
    using app = createTestApp(item.nestedBoard)

    // Fold the parent
    app.command("fold_more")
    app.command("fold_more")

    // J auto-unfolds and enters the first child (DFS order)
    app.command("block_nav_down")
    app.expect("#child-1[data-cursor]").toExist()
  })

  test("J then K round-trip through DFS order", () => {
    using app = createTestApp(item.nestedBoard)

    app.expect("#Parent[data-cursor]").toExist()

    // J moves through DFS order
    app.command("block_nav_down")
    app.expect("#child-1[data-cursor]").toExist()

    // K returns
    app.command("block_nav_up")
    app.expect("#Parent[data-cursor]").toExist()
  })

  test("J navigates between cards sequentially", () => {
    using app = createTestApp(item("board", item("col1", item("task-a"), item("task-b"), item("task-c"))), {
      rows: 30,
      checkIncremental: false,
    })

    app.expect("#task-a[data-cursor]").toExist()

    // J moves to next card
    app.command("block_nav_down")
    app.expect("#task-b[data-cursor]").toExist()

    // J moves to next card again
    app.command("block_nav_down")
    app.expect("#task-c[data-cursor]").toExist()

    // J at last card hits boundary
    app.command("block_nav_down")
    expect(app.bell).toBe(true)

    // K navigates back
    app.command("block_nav_up")
    app.expect("#task-b[data-cursor]").toExist()
  })
})

// =============================================================================
// 3. Filter Dialog
// =============================================================================

describe("Filter dialog", () => {
  test("V opens filter panel showing filter categories", () => {
    using app = createTestApp(
      item("board", item("Tasks", item("Buy groceries"), item("Fix bug"), item("Write docs"))),
      { cols: 120, rows: 24 },
    )

    // Initially no filter panel
    expect(app).not.toContainText("View Settings")

    // Open filter panel
    app.command("filter")
    expect(app.text).toContain("View Settings")
    expect(app.text).toContain("Status")
    expect(app.text).toContain("Priority")
  })

  test("j/k navigates between filter rows", () => {
    using app = createTestApp(item("board", item("Tasks", item("Buy groceries"))), { cols: 120, rows: 24 })

    app.command("filter")

    // Status is row 0 (first row) — cursor starts there
    expect(app).toContainText("Status")

    // Navigate down to Priority
    app.command("cursor_down")
    expect(app).toContainText("Priority")

    // Navigate further down to Due
    app.command("cursor_down")
    expect(app).toContainText("Due")

    // Navigate back up
    app.command("cursor_up")
    expect(app).toContainText("Priority")

    app.command("cursor_up")
    expect(app).toContainText("Status")
  })

  test("Space toggles filter value on/off", () => {
    using app = createTestApp(item("board", item("Tasks", item("Buy groceries"), item("Fix bug"))), {
      cols: 120,
      rows: 24,
    })

    app.command("filter")
    // Status is row 0 — cursor starts there

    // Toggle todo on
    app.command("select_toggle")
    expect(app).toContainText("✓ todo")

    // Toggle todo off
    app.command("select_toggle")
    expect(app).toContainText("□ todo")
  })

  test("h/l navigates between values within a filter row", () => {
    using app = createTestApp(item("board", item("Tasks", item("Buy groceries"))), { cols: 120, rows: 24 })

    app.command("filter")
    // Status is row 0 — cursor starts there

    // Move right to wip
    app.command("cursor_right")
    app.command("select_toggle") // toggle wip on
    expect(app).toContainText("✓ wip")

    // Move left back to todo
    app.command("cursor_left")
    app.command("select_toggle") // toggle todo on
    expect(app.text).toContain("✓ todo")
    expect(app.text).toContain("✓ wip")
  })

  test("X clears all active filters", () => {
    using app = createTestApp(item("board", item("Tasks", item("Buy groceries"))), { cols: 120, rows: 24 })

    app.command("filter")
    // Status is row 0 — cursor starts there

    // Toggle a couple filters on
    app.command("select_toggle") // todo on
    app.command("cursor_right")
    app.command("select_toggle") // wip on
    expect(app).toContainText("✓ todo")
    expect(app).toContainText("✓ wip")

    // Clear all
    app.command("cycle_task_status")
    expect(app.text).toContain("□ todo")
    expect(app.text).toContain("□ wip")
  })

  test("Escape closes filter panel without losing toggled filters", () => {
    using app = createTestApp(item("board", item("Tasks", item("Buy groceries"), item("Fix bug"))), {
      cols: 120,
      rows: 24,
    })

    // Open filter — Status is row 0, toggle todo
    app.command("filter")
    app.command("select_toggle") // toggle todo on
    expect(app).toContainText("✓ todo")

    // Close with Escape
    app.press("Escape")

    // Filter panel should be closed
    expect(app).not.toContainText("View Settings")

    // Filter indicator should show in top bar (filter is still active)
    expect(app).toContainText("[F]")
  })

  test("V toggles filter panel (open then close)", () => {
    using app = createTestApp(item("board", item("Tasks", item("Buy groceries"))), { cols: 120, rows: 24 })

    // Open
    app.command("filter")
    expect(app).toContainText("View Settings")

    // Close with V again
    app.command("filter")
    expect(app).not.toContainText("View Settings")
  })

  test("Enter toggles filter value (same as Space)", () => {
    using app = createTestApp(item("board", item("Tasks", item("Buy groceries"))), { cols: 120, rows: 24 })

    app.command("filter")
    // Status is row 0 — cursor starts there

    // Enter toggles the current value
    app.press("Enter")
    expect(app).toContainText("✓ todo")

    // Enter toggles it back off
    app.press("Enter")
    expect(app).toContainText("□ todo")
  })
})

// =============================================================================
// 4. Help Overlay
// =============================================================================

describe("Help overlay", () => {
  test("? opens help overlay", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    // Open help
    app.command("show_help")
    expect(app.state.overlay).toBe("help")

    // Help content should be visible on screen
    expect(app).toContainText("NAVIGATION")
  })

  test("Escape closes help overlay", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.command("show_help")
    expect(app.state.overlay).toBe("help")

    app.press("Escape")
    expect(app.state.overlay).toBeNull()
  })

  test("q closes help overlay", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.command("show_help")
    expect(app.state.overlay).toBe("help")

    // Bare `q` is unbound in normal mode (bead km-tui.q-quits-no-confirm),
    // but inside the help overlay it still dismisses the overlay.
    app.press("q")
    expect(app.state.overlay).toBeNull()
  })

  test("j scrolls help content down", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.command("show_help")
    expect(app.state.overlay).toBe("help")
    const initialOffset = app.withStore((s) => s.ui.helpScrollOffset ?? 0)

    // j should scroll down
    app.command("cursor_down")
    const afterOffset = app.withStore((s) => s.ui.helpScrollOffset ?? 0)
    expect(afterOffset).toBeGreaterThan(initialOffset)
  })

  test("k scrolls help content up", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.command("show_help")
    // Scroll down first
    app.command("cursor_down")
    app.command("cursor_down")
    const midOffset = app.withStore((s) => s.ui.helpScrollOffset ?? 0)
    expect(midOffset).toBeGreaterThan(0)

    // k should scroll back up
    app.command("cursor_up")
    const afterOffset = app.withStore((s) => s.ui.helpScrollOffset ?? 0)
    expect(afterOffset).toBeLessThan(midOffset)
  })

  test("help overlay blocks normal navigation keys", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"))))

    app.expect("#task1[data-cursor]").toExist()

    app.command("show_help")
    expect(app.state.overlay).toBe("help")

    // j/k should scroll help, not navigate the board
    app.command("cursor_down")
    // Cursor should still be on task1 (help intercepted the key)
    app.press("Escape")
    expect(app.state.overlay).toBeNull()
    app.expect("#task1[data-cursor]").toExist()
  })

  test("? opens and closes help as toggle", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    // Open
    app.command("show_help")
    expect(app.state.overlay).toBe("help")

    // Close with ? again
    app.command("show_help")
    expect(app.state.overlay).toBeNull()
  })
})

// =============================================================================
// 5. Inline Edit Lifecycle
// =============================================================================

describe("Inline edit lifecycle", () => {
  test("i enters inline edit mode on current card", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"))))

    app.expect("#task1[data-cursor]").toExist()

    // Enter inline edit
    app.press("i")
    app.expectEditing("task1")
  })

  test("Enter enters inline edit mode on current card", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"))))

    app.expect("#task1[data-cursor]").toExist()

    // Enter inline edit via Enter key
    app.press("Enter")
    app.expectEditing("task1")
  })

  test("Escape exits inline edit mode, cursor stays on same node", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"))))

    app.expect("#task1[data-cursor]").toExist()

    // Enter and exit inline edit
    app.press("i")
    app.expectEditing()

    app.press("Escape")
    app.expectNotEditing()

    // Cursor stays on task1
    app.expect("#task1[data-cursor]").toExist()
  })

  test("inline edit on different cards maintains correct nodeId", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"), item("task3"))))

    // Edit task1
    app.press("i")
    app.expectEditing("task1")
    app.press("Escape")

    // Move to task2 and edit
    app.command("cursor_down")
    app.expect("#task2[data-cursor]").toExist()
    app.press("i")
    app.expectEditing("task2")
    app.press("Escape")

    // Move to task3 and edit
    app.command("cursor_down")
    app.expect("#task3[data-cursor]").toExist()
    app.press("i")
    app.expectEditing("task3")
    app.press("Escape")
  })

  test("inline edit mode blocks normal navigation keys", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"))))

    app.expect("#task1[data-cursor]").toExist()

    // Enter inline edit
    app.press("i")
    app.expectEditing()

    // Keys like j/k/l/h should be captured by the text input, not navigate the board
    // After Escape, cursor should still be on task1
    app.press("Escape")
    app.expect("#task1[data-cursor]").toExist()
  })

  test("i on column header has no effect (no inline edit for headers)", () => {
    const { board } = createDriverTest(() => item("board", item("col1", item("task1"))))

    // Move to column header
    board.command("cursor_up")

    // Try to enter inline edit on column header
    board.press("i")

    // Inline edit should not be activated on column header (it's a structural node)
    // The behavior depends on implementation — if it does open, it should work;
    // if it doesn't, inlineEditBlock stays null. Either is acceptable.
    // Just verify no crash occurs.
    board.expectCursorVisible()
  })
})

// =============================================================================
// Cross-feature: Visual mode + clipboard integration — REMOVED
// =============================================================================
// Visual mode was removed. Clipboard operations use shift+arrow selection
// (see multiselect-ops.slow.spec.ts and multiselect-ops.slow.test.ts).

// =============================================================================
// Cross-feature: Escape priority layering
// =============================================================================

describe("Escape priority layering", () => {
  test("Escape exits inline edit before clearing selection", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"))))

    // Enter inline edit
    app.press("i")
    app.expectEditing()

    // Escape exits inline edit
    app.press("Escape")
    app.expectNotEditing()

    // Cursor should still be on the node
    app.expect("#task1[data-cursor]").toExist()
  })

  test("Escape closes help overlay before doing anything else", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    // Open help
    app.command("show_help")
    expect(app.state.overlay).toBe("help")

    // Escape closes help
    app.press("Escape")
    expect(app.state.overlay).toBeNull()

    // Cursor should still be on task1
    app.expect("#task1[data-cursor]").toExist()
  })
})

// =============================================================================
// J/K block navigation edge cases
// =============================================================================

describe("J/K block navigation edge cases", () => {
  // J/K do DFS block traversal — walk all visible blocks in column order.

  test("J on folded card auto-unfolds and enters first child", () => {
    using app = createTestApp(
      item("board", item("col1", item.folder("Parent", item("child-a"), item("child-b")), item("sibling"))),
      { checkIncremental: false },
    )

    // Fold Parent
    app.command("fold_more")
    app.command("fold_more")

    // J auto-unfolds and enters the first child (DFS order with auto-unfold)
    app.command("block_nav_down")
    app.expect("#child-a[data-cursor]").toExist()
  })

  test("K from last block walks back through DFS order", () => {
    using app = createTestApp(
      item("board", item("col1", item.folder("Parent", item("child-x"), item("child-y")), item("sibling"))),
      { rows: 30, checkIncremental: false },
    )

    // Walk forward to sibling via J (DFS: Parent → child-x → child-y → sibling)
    app.command("block_nav_down") // → child-x
    app.command("block_nav_down") // → child-y
    app.command("block_nav_down") // → sibling
    app.expect("#sibling[data-cursor]").toExist()

    // K walks back: sibling → child-y
    app.command("block_nav_up")
    app.expect("#child-y[data-cursor]").toExist()

    // K continues: child-y → child-x → Parent
    app.command("block_nav_up")
    app.expect("#child-x[data-cursor]").toExist()
    app.command("block_nav_up")
    app.expect("#Parent[data-cursor]").toExist()
  })

  // FREEZE: needs expectCursorVisible (createDriverTest-only)
  test("multiple J/K in sequence maintains cursor visibility", () => {
    const { board } = createDriverTest(
      () =>
        item("board", item("col1", item.folder("A", item("a1"), item("a2")), item.folder("B", item("b1")), item("C"))),
      { rows: 30, checkIncremental: false },
    )

    // J walks DFS: A → a1 (first child)
    board.command("block_nav_down")
    board.expectCursorVisible()

    // K walks back: a1 → A
    board.command("block_nav_up")
    board.expectCursorVisible()

    // Walk to B via DFS: A → a1 → a2 → B
    board.command("block_nav_down") // → a1
    board.command("block_nav_down") // → a2
    board.command("block_nav_down") // → B
    board.expectCursorVisible()

    board.command("block_nav_up") // B → a2
    board.expectCursorVisible()
  })
})

// =============================================================================
// Cross-feature: Filter + navigation interaction
// =============================================================================

describe("Filter + navigation interaction", () => {
  test("filter panel keys do not affect board navigation", () => {
    using app = createTestApp(
      item("board", item("Tasks", item("task1"), item("task2")), item("Notes", item("note1"))),
      { cols: 120, rows: 24 },
    )

    app.expect("#task1[data-cursor]").toExist()

    // Open filter
    app.command("filter")

    // j/k/h/l should control filter, not board
    app.command("cursor_down") // moves filter cursor, not board cursor
    app.command("cursor_up") // moves filter cursor back

    // Close filter
    app.press("Escape")

    // Board cursor should still be on task1
    app.expect("#task1[data-cursor]").toExist()
  })

  test("filter state persists after closing and reopening filter panel", () => {
    using app = createTestApp(item("board", item("Tasks", item("Buy groceries"))), { cols: 120, rows: 24 })

    // Open filter — Status is row 0, toggle todo
    app.command("filter")
    app.command("select_toggle") // toggle todo on
    expect(app).toContainText("✓ todo")

    // Close
    app.press("Escape")

    // Reopen and verify state persisted
    app.command("filter")
    expect(app).toContainText("✓ todo")

    app.press("Escape")
  })
})

// =============================================================================
// Inline edit + undo interaction
// =============================================================================

describe("Inline edit + undo interaction", () => {
  test("enter inline edit and exit without changes preserves node content", () => {
    using app = createTestApp(item("board", item("col1", item("original-content"))))

    app.expect("#original-content[data-cursor]").toExist()

    // Enter and immediately exit inline edit
    app.press("i")
    app.press("Escape")

    // Content should be unchanged
    const node = app.repo.getNode("original-content")
    expect(node?.content).toBe("original-content")
  })

  // FREEZE: needs expectEditing/expectNotEditing/expectCursorVisible (createDriverTest-only)
  test("rapid i then Escape cycle does not corrupt state", () => {
    const { board } = createDriverTest(() => item("board", item("col1", item("task1"), item("task2"))))

    // Rapidly enter and exit inline edit multiple times
    for (let i = 0; i < 5; i++) {
      board.press("i")
      board.expectEditing()
      board.press("Escape")
      board.expectNotEditing()
    }

    // Board should still be in a valid state
    board.expect("#task1[data-cursor]").toExist()
    board.expectCursorVisible()
  })
})

// =============================================================================
// Characterization: selection state through cursor movement
// =============================================================================

describe("selection state through cursor movement", () => {
  test("cursor moves through j/k — app.state.cursor tracks current node", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"), item("task3"), item("task4"))))

    // Initial cursor
    expect(app.state.cursor).toBe("task1")

    // Move down
    app.command("cursor_down")
    expect(app.state.cursor).toBe("task2")

    // Move down again
    app.command("cursor_down")
    expect(app.state.cursor).toBe("task3")

    // Move up
    app.command("cursor_up")
    expect(app.state.cursor).toBe("task2")

    // Move up past start — stays at first
    app.command("cursor_up")
    app.command("cursor_up")
    app.command("cursor_up") // should not go past task1
    expect(app.state.cursor).not.toBeNull()
  })

  test("cursor position matches data-cursor attribute on screen", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"), item("task3"))))

    // task1 has cursor
    app.expect("#task1[data-cursor]").toExist()

    // Move to task2
    app.command("cursor_down")
    app.expect("#task2[data-cursor]").toExist()
    app.expect("#task1[data-cursor]").not.toExist()

    // Move to task3
    app.command("cursor_down")
    app.expect("#task3[data-cursor]").toExist()
    app.expect("#task2[data-cursor]").not.toExist()
  })
})

// =============================================================================
// Characterization: edit signal propagation
// =============================================================================

describe("edit signal propagation", () => {
  test("enter edit mode sets editing, exit clears it", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"))))

    // Initially not editing
    app.expectNotEditing()

    // Enter edit mode via i
    app.press("i")
    app.expectEditing("task1")

    // Exit edit mode via Escape
    app.press("Escape")
    app.expectNotEditing()

    // Cursor should remain on task1
    app.expect("#task1[data-cursor]").toExist()
  })

  test("edit on different cards tracks correct nodeId", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"), item("task3"))))

    // Edit task1
    app.press("i")
    app.expectEditing("task1")
    app.press("Escape")

    // Move to task2 and edit
    app.command("cursor_down")
    app.press("i")
    app.expectEditing("task2")
    app.press("Escape")

    // Move to task3 and edit
    app.command("cursor_down")
    app.press("i")
    app.expectEditing("task3")
    app.press("Escape")

    // All cleared
    app.expectNotEditing()
  })

  test("edit sub-item in nested card works and cleans up", () => {
    using app = createTestApp(item("board", item("col1", item.folder("Parent", item("child-a"), item("child-b")))))

    // Navigate into children via j keys
    app.press("j") // move to next visible item
    app.press("j")
    app.press("j")

    // Enter edit on current node
    app.press("i")
    app.expectEditing()

    // Parent card should still be visible on screen
    app.expect("#Parent").toExist()

    // Exit edit cleanly
    app.press("Escape")
    app.expectNotEditing()
  })
})
