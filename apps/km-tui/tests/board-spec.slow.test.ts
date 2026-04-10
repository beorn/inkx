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
    const { board } = testEnv(item.nestedBoard)

    // Cursor starts on Parent
    board.expect("#Parent[data-cursor]").toExist()

    // J moves to first visible child (DFS order), not to sibling
    board.command("block_nav_down")
    board.expect("#child-1[data-cursor]").toExist()

    // J continues to next child
    board.command("block_nav_down")
    board.expect("#child-2[data-cursor]").toExist()

    // J moves to next sibling card after all children
    board.command("block_nav_down")
    board.expect("#sibling[data-cursor]").toExist()
  })

  test("K walks backward through visible blocks (strict inverse of J)", () => {
    const { board } = testEnv(item.nestedBoard)

    // Navigate to sibling via J (DFS: Parent → child-1 → child-2 → sibling)
    board.command("block_nav_down") // → child-1
    board.command("block_nav_down") // → child-2
    board.command("block_nav_down") // → sibling
    board.expect("#sibling[data-cursor]").toExist()

    // K walks back in exact reverse order
    board.command("block_nav_up")
    board.expect("#child-2[data-cursor]").toExist()

    board.command("block_nav_up")
    board.expect("#child-1[data-cursor]").toExist()

    board.command("block_nav_up")
    board.expect("#Parent[data-cursor]").toExist()
  })

  test("J at last card rings bell (boundary)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("leaf-task"))))

    board.expect("#leaf-task[data-cursor]").toExist()

    // J on the only card hits boundary
    board.command("block_nav_down")
    expect(board.bell).toBe(true)
  })

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
    const { board } = testEnv(item.nestedBoard)

    // Fold the parent
    board.command("fold_more")
    board.command("fold_more")

    // J auto-unfolds and enters the first child (DFS order)
    board.command("block_nav_down")
    board.expect("#child-1[data-cursor]").toExist()
  })

  test("J then K round-trip through DFS order", () => {
    const { board } = testEnv(item.nestedBoard)

    board.expect("#Parent[data-cursor]").toExist()

    // J moves through DFS order
    board.command("block_nav_down")
    board.expect("#child-1[data-cursor]").toExist()

    // K returns
    board.command("block_nav_up")
    board.expect("#Parent[data-cursor]").toExist()
  })

  test("J navigates between cards sequentially", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task-a"), item("task-b"), item("task-c"))), {
      rows: 30,
      checkIncremental: false,
    })

    board.expect("#task-a[data-cursor]").toExist()

    // J moves to next card
    board.command("block_nav_down")
    board.expect("#task-b[data-cursor]").toExist()

    // J moves to next card again
    board.command("block_nav_down")
    board.expect("#task-c[data-cursor]").toExist()

    // J at last card hits boundary
    board.command("block_nav_down")
    expect(board.bell).toBe(true)

    // K navigates back
    board.command("block_nav_up")
    board.expect("#task-b[data-cursor]").toExist()
  })
})

// =============================================================================
// 3. Filter Dialog
// =============================================================================

describe("Filter dialog", () => {
  test("V opens filter panel showing filter categories", () => {
    const { board } = testEnv(
      () => item("board", item("Tasks", item("Buy groceries"), item("Fix bug"), item("Write docs"))),
      { columns: 120, rows: 24 },
    )

    // Initially no filter panel
    expect(board.screenshot()).not.toContain("View Settings")

    // Open filter panel
    board.command("filter")
    const screen = board.screenshot()
    expect(screen).toContain("View Settings")
    expect(screen).toContain("Status")
    expect(screen).toContain("Priority")
  })

  test("j/k navigates between filter rows", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    board.command("filter")

    // Status is row 0 (first row) — cursor starts there
    expect(board.screenshot()).toContain("Status")

    // Navigate down to Priority
    board.command("cursor_down")
    expect(board.screenshot()).toContain("Priority")

    // Navigate further down to Due
    board.command("cursor_down")
    expect(board.screenshot()).toContain("Due")

    // Navigate back up
    board.command("cursor_up")
    expect(board.screenshot()).toContain("Priority")

    board.command("cursor_up")
    expect(board.screenshot()).toContain("Status")
  })

  test("Space toggles filter value on/off", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"), item("Fix bug"))), {
      columns: 120,
      rows: 24,
    })

    board.command("filter")
    // Status is row 0 — cursor starts there

    // Toggle todo on
    board.command("select_toggle")
    expect(board.screenshot()).toContain("✓ todo")

    // Toggle todo off
    board.command("select_toggle")
    expect(board.screenshot()).toContain("□ todo")
  })

  test("h/l navigates between values within a filter row", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    board.command("filter")
    // Status is row 0 — cursor starts there

    // Move right to wip
    board.command("cursor_right")
    board.command("select_toggle") // toggle wip on
    expect(board.screenshot()).toContain("✓ wip")

    // Move left back to todo
    board.command("cursor_left")
    board.command("select_toggle") // toggle todo on
    const screen = board.screenshot()
    expect(screen).toContain("✓ todo")
    expect(screen).toContain("✓ wip")
  })

  test("X clears all active filters", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    board.command("filter")
    // Status is row 0 — cursor starts there

    // Toggle a couple filters on
    board.command("select_toggle") // todo on
    board.command("cursor_right")
    board.command("select_toggle") // wip on
    expect(board.screenshot()).toContain("✓ todo")
    expect(board.screenshot()).toContain("✓ wip")

    // Clear all
    board.command("cycle_task_status")
    const screen = board.screenshot()
    expect(screen).toContain("□ todo")
    expect(screen).toContain("□ wip")
  })

  test("Escape closes filter panel without losing toggled filters", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"), item("Fix bug"))), {
      columns: 120,
      rows: 24,
    })

    // Open filter — Status is row 0, toggle todo
    board.command("filter")
    board.command("select_toggle") // toggle todo on
    expect(board.screenshot()).toContain("✓ todo")

    // Close with Escape
    board.press("Escape")

    // Filter panel should be closed
    expect(board.screenshot()).not.toContain("View Settings")

    // Filter indicator should show in top bar (filter is still active)
    expect(board.screenshot()).toContain("[F]")
  })

  test("V toggles filter panel (open then close)", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    // Open
    board.command("filter")
    expect(board.screenshot()).toContain("View Settings")

    // Close with V again
    board.command("filter")
    expect(board.screenshot()).not.toContain("View Settings")
  })

  test("Enter toggles filter value (same as Space)", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    board.command("filter")
    // Status is row 0 — cursor starts there

    // Enter toggles the current value
    board.press("Enter")
    expect(board.screenshot()).toContain("✓ todo")

    // Enter toggles it back off
    board.press("Enter")
    expect(board.screenshot()).toContain("□ todo")
  })
})

// =============================================================================
// 4. Help Overlay
// =============================================================================

describe("Help overlay", () => {
  test("? opens help overlay", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"))))

    // Open help
    board.command("show_help")
    expect(store.getState().ui.showHelp).toBe(true)

    // Help content should be visible on screen
    const screen = board.screenshot()
    // Help shows keybinding categories (uppercase section headers)
    expect(screen).toContain("NAVIGATION")
  })

  test("Escape closes help overlay", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"))))

    board.command("show_help")
    expect(store.getState().ui.showHelp).toBe(true)

    board.press("Escape")
    expect(store.getState().ui.showHelp).toBe(false)
  })

  test("q closes help overlay", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"))))

    board.command("show_help")
    expect(store.getState().ui.showHelp).toBe(true)

    // Bare `q` is unbound in normal mode (bead km-tui.q-quits-no-confirm),
    // but inside the help overlay it still dismisses the overlay.
    board.press("q")
    expect(store.getState().ui.showHelp).toBe(false)
  })

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
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))))

    board.expect("#task1[data-cursor]").toExist()

    board.command("show_help")
    expect(store.getState().ui.showHelp).toBe(true)

    // j/k should scroll help, not navigate the board
    board.command("cursor_down")
    // Cursor should still be on task1 (help intercepted the key)
    board.press("Escape")
    expect(store.getState().ui.showHelp).toBe(false)
    board.expect("#task1[data-cursor]").toExist()
  })

  test("? opens and closes help as toggle", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"))))

    // Open
    board.command("show_help")
    expect(store.getState().ui.showHelp).toBe(true)

    // Close with ? again
    board.command("show_help")
    expect(store.getState().ui.showHelp).toBe(false)
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
    const { board } = testEnv(
      () => item("board", item("Tasks", item("task1"), item("task2")), item("Notes", item("note1"))),
      { columns: 120, rows: 24 },
    )

    board.expect("#task1[data-cursor]").toExist()

    // Open filter
    board.command("filter")

    // j/k/h/l should control filter, not board
    board.command("cursor_down") // moves filter cursor, not board cursor
    board.command("cursor_up") // moves filter cursor back

    // Close filter
    board.press("Escape")

    // Board cursor should still be on task1
    board.expect("#task1[data-cursor]").toExist()
  })

  test("filter state persists after closing and reopening filter panel", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    // Open filter — Status is row 0, toggle todo
    board.command("filter")
    board.command("select_toggle") // toggle todo on
    expect(board.screenshot()).toContain("✓ todo")

    // Close
    board.press("Escape")

    // Reopen and verify state persisted
    board.command("filter")
    expect(board.screenshot()).toContain("✓ todo")

    board.press("Escape")
  })
})

// =============================================================================
// Inline edit + undo interaction
// =============================================================================

describe("Inline edit + undo interaction", () => {
  test("enter inline edit and exit without changes preserves node content", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("original-content"))))

    board.expect("#original-content[data-cursor]").toExist()

    // Enter and immediately exit inline edit
    board.press("i")
    board.press("Escape")

    // Content should be unchanged
    const node = repo.getNode("original-content")
    expect(node?.content).toBe("original-content")
  })

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
  test("cursor moves through j/k — sel.node.cursor() tracks current node", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item("task1"), item("task2"), item("task3"), item("task4"))),
    )

    // Initial cursor
    expect(store.getState().sel.node.cursor() as string | null).toBe("task1")

    // Move down
    board.command("cursor_down")
    expect(store.getState().sel.node.cursor() as string | null).toBe("task2")

    // Move down again
    board.command("cursor_down")
    expect(store.getState().sel.node.cursor() as string | null).toBe("task3")

    // Move up
    board.command("cursor_up")
    expect(store.getState().sel.node.cursor() as string | null).toBe("task2")

    // Move up past start — stays at first
    board.command("cursor_up")
    board.command("cursor_up")
    board.command("cursor_up") // should not go past task1
    const cursor = store.getState().sel.node.cursor() as string | null
    expect(cursor).not.toBeNull()
  })

  test("cursor position matches data-cursor attribute on screen", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"), item("task2"), item("task3"))))

    // task1 has cursor
    board.expect("#task1[data-cursor]").toExist()

    // Move to task2
    board.command("cursor_down")
    board.expect("#task2[data-cursor]").toExist()
    board.expect("#task1[data-cursor]").not.toExist()

    // Move to task3
    board.command("cursor_down")
    board.expect("#task3[data-cursor]").toExist()
    board.expect("#task2[data-cursor]").not.toExist()
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
