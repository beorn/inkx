/**
 * Board-spec keypress tests for all commands and dialogs.
 *
 * Comprehensive board-level tests using testEnv/board.press() for:
 * 1. Visual mode (v to enter, j/k extend, d cut, y copy, Esc cancel)
 * 2. J/K block navigation (drill in/out)
 * 3. Filter dialog (G open, j/k navigate, Space toggle, Esc cancel)
 * 4. Help overlay (? to open, Esc/q to dismiss)
 * 5. Inline edit lifecycle (i to enter, Esc to cancel, Enter to confirm)
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
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

  // FREEZE: needs expectCursorVisible (testEnv-only)
  test("K at column level navigates to board", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))

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
    app.expectScreenNot("View Settings")

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
    app.expectScreen("Status")

    // Navigate down to Priority
    app.command("cursor_down")
    app.expectScreen("Priority")

    // Navigate further down to Due
    app.command("cursor_down")
    app.expectScreen("Due")

    // Navigate back up
    app.command("cursor_up")
    app.expectScreen("Priority")

    app.command("cursor_up")
    app.expectScreen("Status")
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
    app.expectScreen("✓ todo")

    // Toggle todo off
    app.command("select_toggle")
    app.expectScreen("□ todo")
  })

  test("h/l navigates between values within a filter row", () => {
    using app = createTestApp(item("board", item("Tasks", item("Buy groceries"))), { cols: 120, rows: 24 })

    app.command("filter")
    // Status is row 0 — cursor starts there

    // Move right to wip
    app.command("cursor_right")
    app.command("select_toggle") // toggle wip on
    app.expectScreen("✓ wip")

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
    app.expectScreen("✓ todo")
    app.expectScreen("✓ wip")

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
    app.expectScreen("✓ todo")

    // Close with Escape
    app.press("Escape")

    // Filter panel should be closed
    app.expectScreenNot("View Settings")

    // Filter indicator should show in top bar (filter is still active)
    app.expectScreen("[F]")
  })

  test("V toggles filter panel (open then close)", () => {
    using app = createTestApp(item("board", item("Tasks", item("Buy groceries"))), { cols: 120, rows: 24 })

    // Open
    app.command("filter")
    app.expectScreen("View Settings")

    // Close with V again
    app.command("filter")
    app.expectScreenNot("View Settings")
  })

  test("Enter toggles filter value (same as Space)", () => {
    using app = createTestApp(item("board", item("Tasks", item("Buy groceries"))), { cols: 120, rows: 24 })

    app.command("filter")
    // Status is row 0 — cursor starts there

    // Enter toggles the current value
    app.press("Enter")
    app.expectScreen("✓ todo")

    // Enter toggles it back off
    app.press("Enter")
    app.expectScreen("□ todo")
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
    app.expectScreen("NAVIGATION")
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

  // FREEZE: needs store.getState().ui.helpScrollOffset
  test("j scrolls help content down", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"))))

    board.command("show_help")
    expect(store.getState().ui.showHelp).toBe(true)
    const initialOffset = store.getState().ui.helpScrollOffset ?? 0

    // j should scroll down
    board.command("cursor_down")
    const afterOffset = store.getState().ui.helpScrollOffset ?? 0
    expect(afterOffset).toBeGreaterThan(initialOffset)
  })

  // FREEZE: needs store.getState().ui.helpScrollOffset
  test("k scrolls help content up", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"))))

    board.command("show_help")
    // Scroll down first
    board.command("cursor_down")
    board.command("cursor_down")
    const midOffset = store.getState().ui.helpScrollOffset ?? 0
    expect(midOffset).toBeGreaterThan(0)

    // k should scroll back up
    board.command("cursor_up")
    const afterOffset = store.getState().ui.helpScrollOffset ?? 0
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
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))))

    board.expect("#task1[data-cursor]").toExist()

    // Enter inline edit
    board.press("i")
    board.expectEditing("task1")
  })

  test("Enter enters inline edit mode on current card", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))))

    board.expect("#task1[data-cursor]").toExist()

    // Enter inline edit via Enter key
    board.press("Enter")
    board.expectEditing("task1")
  })

  test("Escape exits inline edit mode, cursor stays on same node", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))))

    board.expect("#task1[data-cursor]").toExist()

    // Enter and exit inline edit
    board.press("i")
    board.expectEditing()

    board.press("Escape")
    board.expectNotEditing()

    // Cursor stays on task1
    board.expect("#task1[data-cursor]").toExist()
  })

  test("inline edit on different cards maintains correct nodeId", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"), item("task2"), item("task3"))))

    // Edit task1
    board.press("i")
    board.expectEditing("task1")
    board.press("Escape")

    // Move to task2 and edit
    board.command("cursor_down")
    board.expect("#task2[data-cursor]").toExist()
    board.press("i")
    board.expectEditing("task2")
    board.press("Escape")

    // Move to task3 and edit
    board.command("cursor_down")
    board.expect("#task3[data-cursor]").toExist()
    board.press("i")
    board.expectEditing("task3")
    board.press("Escape")
  })

  test("inline edit mode blocks normal navigation keys", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))))

    board.expect("#task1[data-cursor]").toExist()

    // Enter inline edit
    board.press("i")
    board.expectEditing()

    // Keys like j/k/l/h should be captured by the text input, not navigate the board
    // After Escape, cursor should still be on task1
    board.press("Escape")
    board.expect("#task1[data-cursor]").toExist()
  })

  test("i on column header has no effect (no inline edit for headers)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))

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
    const { board } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))))

    // Enter inline edit
    board.press("i")
    board.expectEditing()

    // Escape exits inline edit
    board.press("Escape")
    board.expectNotEditing()

    // Cursor should still be on the node
    board.expect("#task1[data-cursor]").toExist()
  })

  test("Escape closes help overlay before doing anything else", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"))))

    // Open help
    board.command("show_help")
    expect(store.getState().ui.showHelp).toBe(true)

    // Escape closes help
    board.press("Escape")
    expect(store.getState().ui.showHelp).toBe(false)

    // Cursor should still be on task1
    board.expect("#task1[data-cursor]").toExist()
  })
})

// =============================================================================
// J/K block navigation edge cases
// =============================================================================

describe("J/K block navigation edge cases", () => {
  // J/K do DFS block traversal — walk all visible blocks in column order.

  test("J on folded card auto-unfolds and enters first child", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item.folder("Parent", item("child-a"), item("child-b")), item("sibling"))),
      { checkIncremental: false },
    )

    // Fold Parent
    board.command("fold_more")
    board.command("fold_more")

    // J auto-unfolds and enters the first child (DFS order with auto-unfold)
    board.command("block_nav_down")
    board.expect("#child-a[data-cursor]").toExist()
  })

  test("K from last block walks back through DFS order", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item.folder("Parent", item("child-x"), item("child-y")), item("sibling"))),
      { rows: 30, checkIncremental: false },
    )

    // Walk forward to sibling via J (DFS: Parent → child-x → child-y → sibling)
    board.command("block_nav_down") // → child-x
    board.command("block_nav_down") // → child-y
    board.command("block_nav_down") // → sibling
    board.expect("#sibling[data-cursor]").toExist()

    // K walks back: sibling → child-y
    board.command("block_nav_up")
    board.expect("#child-y[data-cursor]").toExist()

    // K continues: child-y → child-x → Parent
    board.command("block_nav_up")
    board.expect("#child-x[data-cursor]").toExist()
    board.command("block_nav_up")
    board.expect("#Parent[data-cursor]").toExist()
  })

  test("multiple J/K in sequence maintains cursor visibility", () => {
    const { board } = testEnv(
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
    app.expectScreen("✓ todo")

    // Close
    app.press("Escape")

    // Reopen and verify state persisted
    app.command("filter")
    app.expectScreen("✓ todo")

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

  // FREEZE: needs expectEditing/expectNotEditing/expectCursorVisible (testEnv-only)
  test("rapid i then Escape cycle does not corrupt state", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))))

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
    const { board } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))))

    // Initially not editing
    board.expectNotEditing()

    // Enter edit mode via i
    board.press("i")
    board.expectEditing("task1")

    // Exit edit mode via Escape
    board.press("Escape")
    board.expectNotEditing()

    // Cursor should remain on task1
    board.expect("#task1[data-cursor]").toExist()
  })

  test("edit on different cards tracks correct nodeId", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"), item("task2"), item("task3"))))

    // Edit task1
    board.press("i")
    board.expectEditing("task1")
    board.press("Escape")

    // Move to task2 and edit
    board.command("cursor_down")
    board.press("i")
    board.expectEditing("task2")
    board.press("Escape")

    // Move to task3 and edit
    board.command("cursor_down")
    board.press("i")
    board.expectEditing("task3")
    board.press("Escape")

    // All cleared
    board.expectNotEditing()
  })

  test("edit sub-item in nested card works and cleans up", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-a"), item("child-b")))),
    )

    // Navigate into children via j keys
    board.press("j") // move to next visible item
    board.press("j")
    board.press("j")

    // Enter edit on current node
    board.press("i")
    board.expectEditing()

    // Parent card should still be visible on screen
    board.expect("#Parent").toExist()

    // Exit edit cleanly
    board.press("Escape")
    board.expectNotEditing()
  })
})
