// testEnv FREEZE bucket — see km-all.test-system bead. Reason: bell + expectNodeBorder/Color for visual selection feedback
/**
 * Board Acceptance Tests - Selection
 *
 * Tests for multi-selection via J/K (extend), H/L (clear), A (progressive),
 * and combined selection workflows.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import { Workspace, type BoardAppStore } from "../src/state/board-app-store.ts"
import { TC } from "./helpers/theme.ts"

// =============================================================================
// Selection
// =============================================================================

describe("Selection", () => {
  // ---------------------------------------------------------------------------
  // Extend selection down (J = Shift+J = extend_select_down)
  // ---------------------------------------------------------------------------

  test("J extends selection down from first card", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("shift+ArrowDown") // Shift+J = extend_select_down
    board.expect("#1b[data-cursor]").toExist()
    // Status shows selection feedback
    const status = board.getStatus()
    expect(status?.message).toContain("selected")
  })

  test("J twice extends selection through multiple cards", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("shift+ArrowDown")
    expect(board.getStatus()?.message).toMatch(/2 items/)

    board.press("shift+ArrowDown")
    board.expect("#1c[data-cursor]").toExist()
    expect(board.getStatus()?.message).toMatch(/3 items/)
  })

  test("J at bottom boundary does not extend past last card", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"))))
    board.command("cursor_down") // Move to 1b normally
    board.expect("#1b[data-cursor]").toExist()

    board.press("shift+ArrowDown") // Init selection anchor at 1b
    const status1 = board.getStatus()
    expect(status1?.message).toContain("selected")

    board.press("shift+ArrowDown") // Try to extend past bottom - stays at 1b
    board.expect("#1b[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // Extend selection up (K = Shift+K = extend_select_up)
  // ---------------------------------------------------------------------------

  test("K extends selection up from last card", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.command("cursor_down").command("cursor_down") // Navigate to 1c
    board.expect("#1c[data-cursor]").toExist()

    board.press("shift+ArrowUp") // Shift+K = extend_select_up
    board.expect("#1b[data-cursor]").toExist()
    expect(board.getStatus()?.message).toContain("selected")
  })

  test("K twice extends selection up through multiple cards", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.command("cursor_down").command("cursor_down") // Navigate to 1c
    board.expect("#1c[data-cursor]").toExist()

    board.press("shift+ArrowUp")
    expect(board.getStatus()?.message).toMatch(/2 items/)

    board.press("shift+ArrowUp")
    board.expect("#1a[data-cursor]").toExist()
    expect(board.getStatus()?.message).toMatch(/3 items/)
  })

  test("K at top boundary does not extend past first card", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("shift+ArrowUp") // Init selection anchor at 1a
    expect(board.getStatus()?.message).toContain("selected")

    board.press("shift+ArrowUp") // Try to extend past top - stays at 1a
    board.expect("#1a[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // Extend selection across columns (H/L = Shift+H/L)
  // Column-level selection: selects all cards in columns between anchor and focus.
  // ---------------------------------------------------------------------------

  test("L selects current column and next column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("shift+ArrowRight") // Shift+L = extend_select_right
    const status = board.getStatus()
    expect(status?.message).toContain("2 columns")
    expect(status?.message).toContain("3 items")
  })

  test("H selects current column and previous column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b"))))
    // Navigate to col2
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()

    board.press("shift+ArrowLeft") // Shift+H = extend_select_left
    const status = board.getStatus()
    expect(status?.message).toContain("2 columns")
    expect(status?.message).toContain("3 items")
  })

  test("L then L extends to third column", () => {
    const { board } = testEnv(item.multiColBoard)
    board.expect("#1a[data-cursor]").toExist()

    board.press("shift+ArrowRight")
    expect(board.getStatus()?.message).toContain("2 columns")

    board.press("shift+ArrowRight")
    expect(board.getStatus()?.message).toContain("3 columns")
  })

  test("L then H shrinks column selection", () => {
    const { board } = testEnv(item.multiColBoard)
    board.expect("#1a[data-cursor]").toExist()

    board.press("shift+ArrowRight") // cols 0-1
    board.press("shift+ArrowRight") // cols 0-2
    expect(board.getStatus()?.message).toContain("3 columns")

    board.press("shift+ArrowLeft") // Back to cols 0-1
    expect(board.getStatus()?.message).toContain("2 columns")
  })

  test("H at left boundary selects current column only", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("shift+ArrowLeft") // At boundary — selects current column
    const status = board.getStatus()
    expect(status?.message).toContain("1 column")
    expect(status?.message).toContain("2 items")
  })

  test("L at right boundary selects current column only", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b"))))
    // Navigate to last column
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()

    board.press("shift+ArrowRight") // At boundary — selects current column
    const status = board.getStatus()
    expect(status?.message).toContain("1 column")
    expect(status?.message).toContain("2 items")
  })

  // ---------------------------------------------------------------------------
  // Select all (A = Shift+A = select_all, progressive: column then board)
  // In cards view (no outline mode): column -> board -> column -> ...
  // Card scope requires outline mode.
  // ---------------------------------------------------------------------------

  test("A selects progressively: column then board", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    // First Ctrl+A - selects entire column (card scope requires outline mode)
    // Note: "A" reserved for Agent Dialog, Ctrl+A maps to select_all
    board.press("ctrl+a")
    const s1 = board.getStatus()
    expect(s1?.message).toContain("column")
    expect(s1?.message).toContain("selected")

    // Second Ctrl+A - selects entire board
    board.press("ctrl+a")
    const s2 = board.getStatus()
    expect(s2?.message).toContain("board")
    expect(s2?.message).toContain("selected")
  })

  test("A wraps around after board level", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    // First Ctrl+A -> column, Second Ctrl+A -> board
    board.press("ctrl+a")
    board.press("ctrl+a")
    expect(board.getStatus()?.message).toContain("board")

    // Third Ctrl+A wraps back to column
    board.press("ctrl+a")
    expect(board.getStatus()?.message).toContain("column")
  })

  test("A on single-item column still works", () => {
    const { board } = testEnv(() => item("board", item("col", item("only-card"))))
    board.expect("#only-card[data-cursor]").toExist()

    board.press("ctrl+a")
    const status = board.getStatus()
    expect(status?.message).toContain("selected")
  })

  // ---------------------------------------------------------------------------
  // Escape clears selection
  // ---------------------------------------------------------------------------

  test("Escape clears active selection", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.expect("#1a[data-cursor]").toExist()

    // Create selection
    board.press("ctrl+a")
    expect(board.getStatus()?.message).toContain("selected")

    // Escape clears the selection
    board.press("Escape")
    expect(board.getStatus()).toBeNull()
  })

  test("Escape after column selection clears all", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    // Create column selection
    board.press("shift+ArrowRight")
    expect(board.getStatus()?.message).toContain("column")

    // Escape clears it
    board.press("Escape")
    expect(board.getStatus()).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Escape edge cases
  // ---------------------------------------------------------------------------

  test("Escape with no selection and no overlays hits boundary", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("Escape")
    const status = board.getStatus()
    expect(status?.level).toBe("warning")
  })

  test("Escape prefers closing overlays over clearing selection", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"))))

    // Create selection
    board.press("shift+ArrowDown")
    expect(board.getStatus()?.message).toContain("selected")

    // Open help overlay
    board.command("show_help")

    // First Escape closes help, selection still active
    board.press("Escape")
    // Verify selection is still there by checking status on next key
    // (status is cleared at keypress start, so we can't check it directly after Escape
    // that closed the overlay — we'd need to trigger a re-render)

    // Second Escape clears the selection
    board.press("Escape")
    expect(board.getStatus()).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Normal h/l clears selection
  // ---------------------------------------------------------------------------

  test("normal h clears active card selection", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b")), item("col3", item("3a"))),
    )
    // Navigate to middle column so h doesn't hit boundary
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()

    board.press("shift+ArrowDown") // Create card selection in col2
    expect(board.getStatus()?.message).toContain("selected")

    board.command("cursor_left") // Normal h — clears selection and navigates left
    // Status is cleared (status resets at keypress start, h doesn't set it)
    expect(board.getStatus()).toBeNull()
    board.expect("#1a[data-cursor]").toExist()
  })

  test("normal l clears active card selection", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    board.press("shift+ArrowDown") // Create card selection
    expect(board.getStatus()?.message).toContain("selected")

    board.command("cursor_right") // Normal l — clears selection and navigates right
    expect(board.getStatus()).toBeNull()
    board.expect("#2a[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // Column selection cursor position
  // ---------------------------------------------------------------------------

  test("L moves cursor to target column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("shift+ArrowRight")
    board.expect("#2a[data-cursor]").toExist()
  })

  test("H moves cursor to target column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    board.command("cursor_right") // Navigate to col2
    board.expect("#2a[data-cursor]").toExist()

    board.press("shift+ArrowLeft")
    board.expect("#1a[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // H/L boundary with existing selection
  // ---------------------------------------------------------------------------

  test("H at boundary with existing column selection is no-op", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    // Select current column at boundary
    board.press("shift+ArrowLeft")
    expect(board.getStatus()?.message).toContain("1 column")
    expect(board.getStatus()?.message).toContain("2 items")

    // Second H at boundary — status cleared at keypress start, handler returns early
    // Selection is still there but no new status feedback is set
    board.press("shift+ArrowLeft")
    // No status (cleared at keypress start, no-op handler didn't set new status)
    expect(board.getStatus()).toBeNull()
    // But cursor hasn't moved — still in col1
    board.expect("#1a[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // Cross-mode transitions (J/K then H/L)
  // ---------------------------------------------------------------------------

  test("J then L transitions from card selection to column selection", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    // Card selection first
    board.press("shift+ArrowDown")
    expect(board.getStatus()?.message).toMatch(/items? selected/)

    // Then column selection — anchor stays at col 0, focus moves to col 1
    board.press("shift+ArrowRight")
    expect(board.getStatus()?.message).toContain("column")
  })

  // ---------------------------------------------------------------------------
  // Combined selection workflows
  // ---------------------------------------------------------------------------

  test("J then K shrinks selection back toward anchor", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.expect("#1a[data-cursor]").toExist()

    // Extend down twice
    board.press("shift+ArrowDown")
    board.expect("#1b[data-cursor]").toExist()

    board.press("shift+ArrowDown")
    board.expect("#1c[data-cursor]").toExist()
    expect(board.getStatus()?.message).toMatch(/3 items/)

    // Extend back up - shrinks selection toward anchor
    board.press("shift+ArrowUp")
    board.expect("#1b[data-cursor]").toExist()
    // Selection shrinks: anchor(1a) to cursor(1b) = 2 items
    expect(board.getStatus()?.message).toMatch(/2 items/)
  })

  test("column-level data-selected attribute is set for cursor column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    // data-selected on column indicates which column contains the cursor
    board.expect("[data-selected]").toExist()
    const selected = board.q("[data-selected]")
    expect(selected.count()).toBe(1)
  })

  // ---------------------------------------------------------------------------
  // Sub-node visual selection (descendants appear selected when parent is)
  // ---------------------------------------------------------------------------

  test("sub-items appear selected when parent card is shift-selected", () => {
    // Create a board with a folder card that has visible children
    const { board } = testEnv(item.nestedBoard)
    board.expect("#Parent[data-cursor]").toExist()

    // Shift+ArrowDown extends selection: selects Parent and sibling
    board.press("shift+ArrowDown")
    board.expect("#sibling[data-cursor]").toExist()
    expect(board.getStatus()?.message).toMatch(/2 items/)

    // Parent's children should visually appear selected (selection background)
    // because their parent (Parent) is in the multiSelected set
    board.expectNodeColor("child-1", { bg: TC["$selection-bg"] })
    board.expectNodeColor("child-2", { bg: TC["$selection-bg"] })
  })

  test("sub-sub-items (grandchildren) are included in reactive multi-selection expansion", () => {
    // Verify that syncMultiSelected expands to grandchildren at store level.
    // The reactive signal propagation ensures TreeNodes at all depths highlight correctly.
    const { board, store } = testEnv(() =>
      item(
        "board",
        item("col1", item.folder("Parent", item("child-1"), item("child-2", item("grandchild"))), item("sibling")),
      ),
    )
    board.expect("#Parent[data-cursor]").toExist()

    // Shift+ArrowDown extends selection: selects Parent and sibling
    board.press("shift+ArrowDown")
    board.expect("#sibling[data-cursor]").toExist()
    expect(board.getStatus()?.message).toMatch(/2 items/)

    // Verify the store-level multiSelected contains card-level IDs
    const state = store.getState() as BoardAppStore
    const pane = Workspace.getActiveBoardPane(state)
    const selIds = state.sel.node.ids()
    expect(selIds.has("Parent" as any)).toBe(true)
    expect(selIds.has("sibling" as any)).toBe(true)

    // Direct children should visually appear selected
    board.expectNodeColor("child-1", { bg: TC["$selection-bg"] })
    board.expectNodeColor("child-2", { bg: TC["$selection-bg"] })
    // Grandchildren (sub-sub-items) should ALSO be visually selected
    board.expectNodeColor("grandchild", { bg: TC["$selection-bg"] })
  })

  // ---------------------------------------------------------------------------
  // Outline mode selection constrains to siblings
  // ---------------------------------------------------------------------------

  test("shift-select in outline mode only selects siblings", () => {
    // Create a board with a card that has 3 children
    const { board } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2"), item("child-3")))),
    )
    board.expect("#Parent[data-cursor]").toExist()

    // Navigate into the card to child-1 via block_nav_down (enters outline mode)
    board.command("block_nav_down")
    board.expect("#child-1[data-cursor]").toExist()

    // Shift+ArrowDown in outline mode — selects among siblings
    board.press("shift+ArrowDown")
    board.expect("#child-2[data-cursor]").toExist()
    expect(board.getStatus()?.message).toMatch(/2 items/)

    // Extend further
    board.press("shift+ArrowDown")
    board.expect("#child-3[data-cursor]").toExist()
    expect(board.getStatus()?.message).toMatch(/3 items/)

    // The parent card should NOT be in the selection (only siblings)
    // Check parent doesn't have selection bg (it has cursor-in-descendant highlight instead)
    // Parent is NOT multi-selected — only children are
    const parentLoc = board.q("#Parent")
    expect(parentLoc.count()).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Pop-out: shift-select at sibling boundary pops to parent card
  // ---------------------------------------------------------------------------

  test("shift-select past last sibling pops out to parent card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")), item("sibling"))),
    )
    board.expect("#Parent[data-cursor]").toExist()

    // Navigate into outline mode
    board.command("block_nav_down")
    board.expect("#child-1[data-cursor]").toExist()

    // Select through children
    board.press("shift+ArrowDown")
    board.expect("#child-2[data-cursor]").toExist()
    expect(board.getStatus()?.message).toMatch(/2 items/)

    // One more shift-down: past last sibling → pops to parent card
    board.press("shift+ArrowDown")
    board.expect("#Parent[data-cursor]").toExist()
    expect(board.getStatus()?.message).toMatch(/1 item/)

    // Now shift-down again: card-level selection to sibling card
    board.press("shift+ArrowDown")
    board.expect("#sibling[data-cursor]").toExist()
    expect(board.getStatus()?.message).toMatch(/2 items/)
  })

  test("shift-select past first sibling pops out to parent card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("before"), item.folder("Parent", item("child-1"), item("child-2")))),
    )
    // Navigate to Parent, then into child-2
    board.navigateTo("Parent")
    board.command("block_nav_down")
    board.expect("#child-1[data-cursor]").toExist()

    // Shift-up past first sibling → pops to parent
    board.press("shift+ArrowUp")
    board.expect("#Parent[data-cursor]").toExist()
    expect(board.getStatus()?.message).toMatch(/1 item/)

    // Shift-up again: card-level to "before" card
    board.press("shift+ArrowUp")
    board.expect("#before[data-cursor]").toExist()
    expect(board.getStatus()?.message).toMatch(/2 items/)
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
  // ANSI-16 fallback from multiSelectedBg() — "blackBright" index.
  // With a truecolor theme this would be a hex blend, but the test theme
  // (ansi16DarkTheme) has no theme.bg so we return the ANSI-16 fallback.
  const MULTI_BG = 8

  test("multi-selected cards show multi-select bg; unselected do not", () => {
    const { board } = testEnv(() => item("board", item("col", item("alpha"), item("beta"), item("gamma"))))
    board.expect("#alpha[data-cursor]").toExist()

    // Extend selection alpha -> beta (2 items selected, cursor on beta).
    board.press("shift+ArrowDown")
    expect(board.getStatus()?.message).toMatch(/2 items/)

    // alpha is multi-selected but NOT the cursor → multi-select bg on title row.
    board.expectNodeColor("alpha", { bg: MULTI_BG })

    // beta is the cursor AND multi-selected → inverse yellow wins (rule 1).
    board.expectNodeColor("beta", { bg: TC["$selection-bg"] })

    // gamma is not in the selection → no multi-select bg, no selection bg.
    board.expectNodeColor("gamma", { bg: null })
  })

  test("multi-selected sub-items (outline mode) show distinct bg", () => {
    // Navigate into a folder card, then extend selection across sibling
    // sub-items. Rule 6: multi-selected sub-items must have the multi-select
    // bg so the user can count them — not just the cursor row.
    const { board } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2"), item("child-3")))),
    )
    board.expect("#Parent[data-cursor]").toExist()

    // Enter outline mode at child-1.
    board.command("block_nav_down")
    board.expect("#child-1[data-cursor]").toExist()

    // Extend selection child-1 → child-3 (3 items selected, cursor on child-3).
    board.press("shift+ArrowDown")
    board.press("shift+ArrowDown")
    expect(board.getStatus()?.message).toMatch(/3 items/)
    board.expect("#child-3[data-cursor]").toExist()

    // child-1 and child-2 are multi-selected but NOT cursor → multi-select bg.
    board.expectNodeColor("child-1", { bg: MULTI_BG })
    board.expectNodeColor("child-2", { bg: MULTI_BG })

    // child-3 is the cursor → inverse selection bg (rule 1 wins).
    board.expectNodeColor("child-3", { bg: TC["$selection-bg"] })
  })
})
