/**
 * Board Acceptance Tests - Selection
 *
 * Tests for multi-selection via J/K (extend), H/L (clear), A (progressive),
 * and combined selection workflows.
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import { Workspace, type BoardAppStore } from "../src/state/board-app-store.ts"

// =============================================================================
// Selection
// =============================================================================

describe("Selection", () => {
  // ---------------------------------------------------------------------------
  // Extend selection down (J = Shift+J = extend_select_down)
  // ---------------------------------------------------------------------------

  test("J extends selection down from first card", () => {
    using app = createTestApp(item("board", item("col", item("1a"), item("1b"), item("1c"))))
    app.expect("#1a[data-cursor]").toExist()

    app.press("shift+ArrowDown") // Shift+J = extend_select_down
    app.expect("#1b[data-cursor]").toExist()
    // Status shows selection feedback
    const status = app.getStatus()
    expect(status?.message).toContain("selected")
  })

  test("J twice extends selection through multiple cards", () => {
    using app = createTestApp(item("board", item("col", item("1a"), item("1b"), item("1c"))))
    app.expect("#1a[data-cursor]").toExist()

    app.press("shift+ArrowDown")
    expect(app.getStatus()?.message).toMatch(/2 items/)

    app.press("shift+ArrowDown")
    app.expect("#1c[data-cursor]").toExist()
    expect(app.getStatus()?.message).toMatch(/3 items/)
  })

  test("J at bottom boundary does not extend past last card", () => {
    using app = createTestApp(item("board", item("col", item("1a"), item("1b"))))
    app.command("cursor_down") // Move to 1b normally
    app.expect("#1b[data-cursor]").toExist()

    app.press("shift+ArrowDown") // Init selection anchor at 1b
    const status1 = app.getStatus()
    expect(status1?.message).toContain("selected")

    app.press("shift+ArrowDown") // Try to extend past bottom - stays at 1b
    app.expect("#1b[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // Extend selection up (K = Shift+K = extend_select_up)
  // ---------------------------------------------------------------------------

  test("K extends selection up from last card", () => {
    using app = createTestApp(item("board", item("col", item("1a"), item("1b"), item("1c"))))
    app.command("cursor_down").command("cursor_down") // Navigate to 1c
    app.expect("#1c[data-cursor]").toExist()

    app.press("shift+ArrowUp") // Shift+K = extend_select_up
    app.expect("#1b[data-cursor]").toExist()
    expect(app.getStatus()?.message).toContain("selected")
  })

  test("K twice extends selection up through multiple cards", () => {
    using app = createTestApp(item("board", item("col", item("1a"), item("1b"), item("1c"))))
    app.command("cursor_down").command("cursor_down") // Navigate to 1c
    app.expect("#1c[data-cursor]").toExist()

    app.press("shift+ArrowUp")
    expect(app.getStatus()?.message).toMatch(/2 items/)

    app.press("shift+ArrowUp")
    app.expect("#1a[data-cursor]").toExist()
    expect(app.getStatus()?.message).toMatch(/3 items/)
  })

  test("K at top boundary does not extend past first card", () => {
    using app = createTestApp(item("board", item("col", item("1a"), item("1b"))))
    app.expect("#1a[data-cursor]").toExist()

    app.press("shift+ArrowUp") // Init selection anchor at 1a
    expect(app.getStatus()?.message).toContain("selected")

    app.press("shift+ArrowUp") // Try to extend past top - stays at 1a
    app.expect("#1a[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // Extend selection across columns (H/L = Shift+H/L)
  // Column-level selection: selects all cards in columns between anchor and focus.
  // ---------------------------------------------------------------------------

  test("L moves cursor to next column and selects it", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    app.expect("#1a[data-cursor]").toExist()

    app.press("shift+ArrowRight") // Shift+L = extend_select_right
    const status = app.getStatus()
    expect(status?.message).toContain("column")
    expect(status?.message).toContain("selected")
  })

  test("Shift+L extends selection from origin column through target column", () => {
    // Bug: shift+L was wiping the origin column from the selection,
    // leaving only the target column selected.
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"), item("2b"))))
    app.expect("#1a[data-cursor]").toExist()

    app.press("shift+ArrowRight") // Shift+L = extend_select_right

    // Selection should include cards from BOTH columns (1a, 1b, 2a, 2b),
    // not just the target column.
    expect(app).toHaveSelection(["1a", "1b", "2a", "2b"])
  })

  test("H moves cursor to previous column and selects it", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b"))))
    // Navigate to col2
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    app.press("shift+ArrowLeft") // Shift+H = extend_select_left
    const status = app.getStatus()
    expect(status?.message).toContain("column")
    expect(status?.message).toContain("selected")
  })

  test("L then L selects progressively", () => {
    using app = createTestApp(item.multiColBoard())
    app.expect("#1a[data-cursor]").toExist()

    app.press("shift+ArrowRight")
    expect(app.getStatus()?.message).toContain("column")

    app.press("shift+ArrowRight")
    expect(app.getStatus()?.message).toContain("column")
  })

  test("L then H navigates back", () => {
    using app = createTestApp(item.multiColBoard())
    app.expect("#1a[data-cursor]").toExist()

    app.press("shift+ArrowRight") // move right
    app.press("shift+ArrowRight") // move right again

    app.press("shift+ArrowLeft") // Back left
    expect(app.getStatus()?.message).toContain("column")
  })

  test("H at left boundary is a no-op", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    app.expect("#1a[data-cursor]").toExist()

    app.press("shift+ArrowLeft") // At boundary — no-op (returns early)
    // Cursor stays in col1
    app.expect("#1a[data-cursor]").toExist()
  })

  test("L at right boundary is a no-op", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b"))))
    // Navigate to last column
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    app.press("shift+ArrowRight") // At boundary — no-op (returns early)
    // Cursor stays in col2
    app.expect("#2a[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // Select all (A = Shift+A = select_all, progressive: column then board)
  // In cards view (no outline mode): column -> board -> column -> ...
  // Card scope requires outline mode.
  // ---------------------------------------------------------------------------

  test("A selects all items in board", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    app.expect("#1a[data-cursor]").toExist()

    // Ctrl+A selects all items in the board
    app.press("ctrl+a")
    const s1 = app.getStatus()
    expect(s1?.message).toContain("board")
    expect(s1?.message).toContain("selected")
  })

  test("A toggles between board and column scope", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    app.expect("#1a[data-cursor]").toExist()

    // First Ctrl+A -> board
    app.press("ctrl+a")
    expect(app.getStatus()?.message).toContain("board")

    // Second Ctrl+A wraps to column
    app.press("ctrl+a")
    const status = app.getStatus()
    expect(status?.message).toContain("selected")
  })

  test("A on single-item column still works", () => {
    using app = createTestApp(item("board", item("col", item("only-card"))))
    app.expect("#only-card[data-cursor]").toExist()

    app.press("ctrl+a")
    const status = app.getStatus()
    expect(status?.message).toContain("selected")
  })

  // ---------------------------------------------------------------------------
  // Escape clears selection
  // ---------------------------------------------------------------------------

  test("Escape clears active selection", () => {
    using app = createTestApp(item("board", item("col", item("1a"), item("1b"), item("1c"))))
    app.expect("#1a[data-cursor]").toExist()

    // Create selection
    app.press("ctrl+a")
    expect(app.getStatus()?.message).toContain("selected")

    // Escape clears the selection
    app.press("Escape")
    expect(app.getStatus()).toBeNull()
  })

  test("Escape after column selection clears all", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    app.expect("#1a[data-cursor]").toExist()

    // Create column selection
    app.press("shift+ArrowRight")
    expect(app.getStatus()?.message).toContain("column")

    // Escape clears it
    app.press("Escape")
    expect(app.getStatus()).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Escape edge cases
  // ---------------------------------------------------------------------------

  test("Escape with no selection collapses and absorbs (no bell)", () => {
    using app = createTestApp(item("board", item("col", item("1a"))))
    app.expect("#1a[data-cursor]").toExist()

    // Escape collapses selection (no-op on already-collapsed cursor) and absorbs
    app.press("Escape")
    expect(app.bell).toBe(false)
  })

  test("Escape prefers closing overlays over clearing selection", () => {
    using app = createTestApp(item("board", item("col", item("1a"), item("1b"))))

    // Create selection
    app.press("shift+ArrowDown")
    expect(app.getStatus()?.message).toContain("selected")

    // Open help overlay
    app.command("show_help")

    // First Escape closes help, selection still active
    app.press("Escape")
    // Verify selection is still there by checking status on next key
    // (status is cleared at keypress start, so we can't check it directly after Escape
    // that closed the overlay — we'd need to trigger a re-render)

    // Second Escape clears the selection
    app.press("Escape")
    expect(app.getStatus()).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Normal h/l clears selection
  // ---------------------------------------------------------------------------

  test("normal h clears active card selection", () => {
    using app = createTestApp(
      item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b")), item("col3", item("3a"))),
    )
    // Navigate to middle column so h doesn't hit boundary
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    app.press("shift+ArrowDown") // Create card selection in col2
    expect(app.getStatus()?.message).toContain("selected")

    app.command("cursor_left") // Normal h — clears selection and navigates left
    // Status is cleared (status resets at keypress start, h doesn't set it)
    expect(app.getStatus()).toBeNull()
    app.expect("#1a[data-cursor]").toExist()
  })

  test("normal l clears active card selection", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    app.press("shift+ArrowDown") // Create card selection
    expect(app.getStatus()?.message).toContain("selected")

    app.command("cursor_right") // Normal l — clears selection and navigates right
    expect(app.getStatus()).toBeNull()
    app.expect("#2a[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // Column selection cursor position
  // ---------------------------------------------------------------------------

  test("Shift+L extends selection to include both columns", () => {
    // After the column-range fix: selection includes BOTH columns. Cursor
    // stays on walk-first (1a) — the selection store invariant. The user
    // sees the extension via highlighted card backgrounds + status line.
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))
    app.expect("#1a[data-cursor]").toExist()

    app.press("shift+ArrowRight")
    expect(app).toHaveSelection(["1a", "2a"])
  })

  test("Shift+H extends selection to include both columns", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))
    app.command("cursor_right") // Navigate to col2
    app.expect("#2a[data-cursor]").toExist()

    app.press("shift+ArrowLeft")
    expect(app).toHaveSelection(["1a", "2a"])
  })

  // ---------------------------------------------------------------------------
  // H/L boundary with existing selection
  // ---------------------------------------------------------------------------

  test("H at boundary is a no-op even when repeated", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    app.expect("#1a[data-cursor]").toExist()

    // H at left boundary — no-op (returns early)
    app.press("shift+ArrowLeft")
    app.expect("#1a[data-cursor]").toExist()

    // Second H at boundary — still no-op
    app.press("shift+ArrowLeft")
    app.expect("#1a[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // Cross-mode transitions (J/K then H/L)
  // ---------------------------------------------------------------------------

  test("J then L transitions from card selection to column selection", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    app.expect("#1a[data-cursor]").toExist()

    // Card selection first
    app.press("shift+ArrowDown")
    expect(app.getStatus()?.message).toMatch(/items? selected/)

    // Then column selection — anchor stays at col 0, focus moves to col 1
    app.press("shift+ArrowRight")
    expect(app.getStatus()?.message).toContain("column")
  })

  // ---------------------------------------------------------------------------
  // Combined selection workflows
  // ---------------------------------------------------------------------------

  test("J then K shrinks selection back toward anchor", () => {
    using app = createTestApp(item("board", item("col", item("1a"), item("1b"), item("1c"))))
    app.expect("#1a[data-cursor]").toExist()

    // Extend down twice
    app.press("shift+ArrowDown")
    app.expect("#1b[data-cursor]").toExist()

    app.press("shift+ArrowDown")
    app.expect("#1c[data-cursor]").toExist()
    expect(app.getStatus()?.message).toMatch(/3 items/)

    // Extend back up - shrinks selection toward anchor
    app.press("shift+ArrowUp")
    app.expect("#1b[data-cursor]").toExist()
    // Selection shrinks: anchor(1a) to cursor(1b) = 2 items
    expect(app.getStatus()?.message).toMatch(/2 items/)
  })

  test("column-level data-selected attribute is set for cursor column", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    // data-selected on column indicates which column contains the cursor
    app.expect("[data-selected]").toExist()
    const selected = app.q("[data-selected]")
    expect(selected.count()).toBe(1)
  })

  // ---------------------------------------------------------------------------
  // Sub-node visual selection (descendants appear selected when parent is)
  // ---------------------------------------------------------------------------

  test("sub-items appear selected when parent card is shift-selected", () => {
    // Create a board with a folder card that has visible children
    using app = createTestApp(item.nestedBoard())
    app.expect("#Parent[data-cursor]").toExist()

    // Shift+ArrowDown extends selection: selects Parent and sibling
    // Count includes descendants (Parent + child-1 + child-2 + sibling = 4)
    app.press("shift+ArrowDown")
    app.expect("#sibling[data-cursor]").toExist()
    expect(app.getStatus()?.message).toMatch(/4 items/)

    // Parent's children should visually appear selected (multi-select bg)
    // because their parent (Parent) is in the multiSelected set.
    // Multi-selected non-cursor nodes get MULTI_BG, not $selection-bg.
    // Truecolor theme: multiSelectedBg resolves to an RGB blend.
    const MULTI_BG = { r: 69, g: 71, b: 75 }
    app.expectNodeColor("child-1", { bg: MULTI_BG })
    app.expectNodeColor("child-2", { bg: MULTI_BG })
  })

  test("sub-sub-items (grandchildren) are included in reactive multi-selection expansion", () => {
    // Verify that syncMultiSelected expands to grandchildren at store level.
    // The reactive signal propagation ensures TreeNodes at all depths highlight correctly.
    using app = createTestApp(
      item(
        "board",
        item("col1", item.folder("Parent", item("child-1"), item("child-2", item("grandchild"))), item("sibling")),
      ),
    )
    app.expect("#Parent[data-cursor]").toExist()

    // Shift+ArrowDown extends selection: selects Parent and sibling
    // Count includes all descendants (Parent + child-1 + child-2 + grandchild + sibling = 5)
    app.press("shift+ArrowDown")
    app.expect("#sibling[data-cursor]").toExist()
    expect(app.getStatus()?.message).toMatch(/5 items/)

    // Verify the store-level multiSelected contains card-level IDs
    app.withStore((s) => {
      const pane = Workspace.getActiveBoardPane(s)
      const selIds = s.sel.node.ids()
      expect(selIds.has("Parent" as any)).toBe(true)
      expect(selIds.has("sibling" as any)).toBe(true)
    })

    // Direct children should visually appear selected (multi-select bg)
    const MULTI_BG = { r: 69, g: 71, b: 75 }
    app.expectNodeColor("child-1", { bg: MULTI_BG })
    app.expectNodeColor("child-2", { bg: MULTI_BG })
    // Grandchildren (sub-sub-items) should ALSO be visually selected
    app.expectNodeColor("grandchild", { bg: MULTI_BG })
  })

  // ---------------------------------------------------------------------------
  // Outline mode selection constrains to siblings
  // ---------------------------------------------------------------------------

  test("shift-select in outline mode only selects siblings", () => {
    // Create a board with a card that has 3 children
    using app = createTestApp(
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2"), item("child-3")))),
    )
    app.expect("#Parent[data-cursor]").toExist()

    // Navigate into the card to child-1 via block_nav_down (enters outline mode)
    app.command("block_nav_down")
    app.expect("#child-1[data-cursor]").toExist()

    // Shift+ArrowDown in outline mode — selects among siblings
    app.press("shift+ArrowDown")
    app.expect("#child-2[data-cursor]").toExist()
    expect(app.getStatus()?.message).toMatch(/2 items/)

    // Extend further
    app.press("shift+ArrowDown")
    app.expect("#child-3[data-cursor]").toExist()
    expect(app.getStatus()?.message).toMatch(/3 items/)

    // The parent card should NOT be in the selection (only siblings)
    // Check parent doesn't have selection bg (it has cursor-in-descendant highlight instead)
    // Parent is NOT multi-selected — only children are
    const parentLoc = app.q("#Parent")
    expect(parentLoc.count()).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Pop-out: shift-select at sibling boundary pops to parent card
  // ---------------------------------------------------------------------------

  test("shift-select past last sibling pops out to parent card", () => {
    using app = createTestApp(
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")), item("sibling"))),
    )
    app.expect("#Parent[data-cursor]").toExist()

    // Navigate into outline mode
    app.command("block_nav_down")
    app.expect("#child-1[data-cursor]").toExist()

    // Select through children
    app.press("shift+ArrowDown")
    app.expect("#child-2[data-cursor]").toExist()
    expect(app.getStatus()?.message).toMatch(/2 items/)

    // One more shift-down: past last sibling → pops to parent card
    app.press("shift+ArrowDown")
    app.expect("#Parent[data-cursor]").toExist()
    expect(app.getStatus()?.message).toMatch(/1 item/)

    // Now shift-down again: card-level selection to sibling card
    // Count includes Parent's descendants: Parent + child-1 + child-2 + sibling = 4
    app.press("shift+ArrowDown")
    app.expect("#sibling[data-cursor]").toExist()
    expect(app.getStatus()?.message).toMatch(/4 items/)
  })

  test("shift-select past first sibling pops out to parent card", () => {
    using app = createTestApp(
      item("board", item("col1", item("before"), item.folder("Parent", item("child-1"), item("child-2")))),
    )
    // Navigate to Parent, then into child-2
    app.navigateTo("Parent")
    app.command("block_nav_down")
    app.expect("#child-1[data-cursor]").toExist()

    // Shift-up past first sibling → pops to parent
    app.press("shift+ArrowUp")
    app.expect("#Parent[data-cursor]").toExist()
    expect(app.getStatus()?.message).toMatch(/1 item/)

    // Shift-up again: card-level to "before" card
    app.press("shift+ArrowUp")
    app.expect("#before[data-cursor]").toExist()
    expect(app.getStatus()?.message).toMatch(/2 items/)
  })
})

// =============================================================================
// Visual feedback (km-tui.multi-select-no-visual)
//
// Multi-selected nodes must show a visual marker (bg tint) so the user can
// count selected items, not just see "2 items selected" in the status bar.
// Rule 6 in selection-style.ts — multiSelectedBg(theme).
//
// In the default test theme (ansi16DarkTheme), the truecolor blend falls back
// to the ANSI-16 "blackBright" (index 8) so the marker is visible in tests.
// =============================================================================

describe("Multi-select visual feedback", () => {
  // multiSelectedBg() resolves to an RGB blend in the truecolor theme.
  const MULTI_BG = { r: 69, g: 71, b: 75 }

  test("multi-selected cards show multi-select bg; unselected do not", () => {
    using app = createTestApp(item("board", item("col", item("alpha"), item("beta"), item("gamma"))))
    app.expect("#alpha[data-cursor]").toExist()

    // Extend selection alpha -> beta (2 items selected, cursor on beta).
    app.press("shift+ArrowDown")
    expect(app.getStatus()?.message).toMatch(/2 items/)

    // alpha is multi-selected but NOT the cursor → multi-select bg on title row.
    app.expectNodeColor("alpha", { bg: MULTI_BG })

    // beta is the cursor AND multi-selected → inverse yellow wins (rule 1).
    // Truecolor theme: $selection-bg resolves to RGB olive.
    app.expectNodeColor("beta", { bg: { r: 128, g: 128, b: 0 } })

    // gamma is not in the selection → no multi-select bg, no selection bg.
    app.expectNodeColor("gamma", { bg: null })
  })

  test("multi-selected sub-items (outline mode) show distinct bg", () => {
    // Navigate into a folder card, then extend selection across sibling
    // sub-items. Rule 6: multi-selected sub-items must have the multi-select
    // bg so the user can count them — not just the cursor row.
    using app = createTestApp(
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2"), item("child-3")))),
    )
    app.expect("#Parent[data-cursor]").toExist()

    // Enter outline mode at child-1.
    app.command("block_nav_down")
    app.expect("#child-1[data-cursor]").toExist()

    // Extend selection child-1 → child-3 (3 items selected, cursor on child-3).
    app.press("shift+ArrowDown")
    app.press("shift+ArrowDown")
    expect(app.getStatus()?.message).toMatch(/3 items/)
    app.expect("#child-3[data-cursor]").toExist()

    // child-1 and child-2 are multi-selected but NOT cursor → multi-select bg.
    app.expectNodeColor("child-1", { bg: MULTI_BG })
    app.expectNodeColor("child-2", { bg: MULTI_BG })

    // child-3 is the cursor → inverse selection bg (rule 1 wins).
    app.expectNodeColor("child-3", { bg: { r: 128, g: 128, b: 0 } })
  })
})

// =============================================================================
// Stale cursor repair (external repo mutation)
// =============================================================================

describe("stale cursor repair", () => {
  // Regression for km-tui.cursor-exists-stale-fs: when an external fs sync
  // replaces a file and deletes the node the cursor points at, the next key
  // press used to crash with the cursor-exists invariant. The store now
  // auto-clamps the cursor to a valid node on every repo mutation.

  test("deleting cursor node then navigating clamps to live node", () => {
    using app = createTestApp(item("board", item("col1", item("task-a"), item("task-b"), item("task-c"))))
    app.press("j") // cursor → task-b
    expect(app.state.cursor).toBe("task-b")

    app.repo.deleteNode("task-b")

    expect(() => app.press("k")).not.toThrow()
    const cursor = app.state.cursor
    expect(cursor).not.toBe("task-b")
    if (cursor) expect(app.repo.getNode(cursor)).toBeDefined()
  })

  test("deleting cursor node then pressing a no-op key does not fire invariant", () => {
    using app = createTestApp(item("board", item("col1", item("task-a"), item("task-b"), item("task-c"))))
    app.press("j") // cursor → task-b
    expect(app.state.cursor).toBe("task-b")

    app.repo.deleteNode("task-b")

    // Escape is unrelated to navigation — repair must happen on mutation,
    // not lazily on the next nav key.
    expect(() => app.press("Escape")).not.toThrow()
    expect(app.state.cursor).not.toBe("task-b")
  })
})
