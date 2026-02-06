/**
 * Board Acceptance Tests - Selection
 *
 * Tests for multi-selection via J/K (extend), H/L (clear), A (progressive),
 * and combined selection workflows.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

// =============================================================================
// Selection
// =============================================================================

describe("Selection", () => {
  // ---------------------------------------------------------------------------
  // Extend selection down (J = Shift+J = extend_select_down)
  // ---------------------------------------------------------------------------

  test("J extends selection down from first card", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("1a"), item("1b"), item("1c"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("J") // Shift+J = extend_select_down
    board.expect("#1b[data-cursor]").toExist()
    // Status shows selection feedback
    const status = board.getStatus()
    expect(status?.message).toContain("selected")
  })

  test("J twice extends selection through multiple cards", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("1a"), item("1b"), item("1c"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("J")
    expect(board.getStatus()?.message).toMatch(/1 item/)

    board.press("J")
    board.expect("#1c[data-cursor]").toExist()
    expect(board.getStatus()?.message).toMatch(/3 items/)
  })

  test("J at bottom boundary does not extend past last card", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("1a"), item("1b"))),
    )
    board.press("j") // Move to 1b normally
    board.expect("#1b[data-cursor]").toExist()

    board.press("J") // Init selection anchor at 1b
    const status1 = board.getStatus()
    expect(status1?.message).toContain("selected")

    board.press("J") // Try to extend past bottom - stays at 1b
    board.expect("#1b[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // Extend selection up (K = Shift+K = extend_select_up)
  // ---------------------------------------------------------------------------

  test("K extends selection up from last card", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("1a"), item("1b"), item("1c"))),
    )
    board.press("j").press("j") // Navigate to 1c
    board.expect("#1c[data-cursor]").toExist()

    board.press("K") // Shift+K = extend_select_up
    board.expect("#1b[data-cursor]").toExist()
    expect(board.getStatus()?.message).toContain("selected")
  })

  test("K twice extends selection up through multiple cards", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("1a"), item("1b"), item("1c"))),
    )
    board.press("j").press("j") // Navigate to 1c
    board.expect("#1c[data-cursor]").toExist()

    board.press("K")
    expect(board.getStatus()?.message).toMatch(/1 item/)

    board.press("K")
    board.expect("#1a[data-cursor]").toExist()
    expect(board.getStatus()?.message).toMatch(/3 items/)
  })

  test("K at top boundary does not extend past first card", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("1a"), item("1b"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("K") // Init selection anchor at 1a
    expect(board.getStatus()?.message).toContain("selected")

    board.press("K") // Try to extend past top - stays at 1a
    board.expect("#1a[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // Extend selection across columns (H/L = Shift+H/L)
  // Horizontal extend-select is not yet implemented; H/L clear selection.
  // ---------------------------------------------------------------------------

  test("H clears selection (horizontal extend not yet implemented)", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    )
    board.expect("#1a[data-cursor]").toExist()

    // Create a vertical selection first
    board.press("J")
    expect(board.getStatus()?.message).toContain("selected")

    // H clears the multi-selection
    board.press("H")
    expect(board.getStatus()).toBeNull()
  })

  test("L clears selection (horizontal extend not yet implemented)", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    )
    board.expect("#1a[data-cursor]").toExist()

    // Create a vertical selection first
    board.press("J")
    expect(board.getStatus()?.message).toContain("selected")

    // L clears the multi-selection
    board.press("L")
    expect(board.getStatus()).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Progressive select all (A = Shift+A = select_all_progressive)
  // In cards view (no outline mode): column -> board -> column -> ...
  // Card scope requires outline mode.
  // ---------------------------------------------------------------------------

  test("A selects progressively: column then board", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    )
    board.expect("#1a[data-cursor]").toExist()

    // First A - selects entire column (card scope requires outline mode)
    board.press("A")
    const s1 = board.getStatus()
    expect(s1?.message).toContain("column")
    expect(s1?.message).toContain("selected")

    // Second A - selects entire board
    board.press("A")
    const s2 = board.getStatus()
    expect(s2?.message).toContain("board")
    expect(s2?.message).toContain("selected")
  })

  test("A wraps around after board level", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    )
    board.expect("#1a[data-cursor]").toExist()

    // First A -> column, Second A -> board
    board.press("A")
    board.press("A")
    expect(board.getStatus()?.message).toContain("board")

    // Third A wraps back to column
    board.press("A")
    expect(board.getStatus()?.message).toContain("column")
  })

  test("A on single-item column still works", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("only-card"))),
    )
    board.expect("#only-card[data-cursor]").toExist()

    board.press("A")
    const status = board.getStatus()
    expect(status?.message).toContain("selected")
  })

  // ---------------------------------------------------------------------------
  // Escape behavior with selection
  // Note: Escape routes to close_or_quit, which does not clear multi-selection.
  // This tests the current behavior (boundary warning). When close_or_quit is
  // updated to clear selection first, this test should be updated accordingly.
  // ---------------------------------------------------------------------------

  test("Escape with active selection triggers boundary (close_or_quit)", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("1a"), item("1b"), item("1c"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    // Create selection
    board.press("A")
    expect(board.getStatus()?.message).toContain("selected")

    // Escape goes to close_or_quit, which currently doesn't check multiSelected
    board.press("Escape")
    const status = board.getStatus()
    expect(status?.level).toBe("warning")
  })

  // ---------------------------------------------------------------------------
  // Combined selection workflows
  // ---------------------------------------------------------------------------

  test("J then K shrinks selection back toward anchor", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("1a"), item("1b"), item("1c"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    // Extend down twice
    board.press("J")
    board.expect("#1b[data-cursor]").toExist()

    board.press("J")
    board.expect("#1c[data-cursor]").toExist()
    expect(board.getStatus()?.message).toMatch(/3 items/)

    // Extend back up - shrinks selection toward anchor
    board.press("K")
    board.expect("#1b[data-cursor]").toExist()
    // Selection shrinks: anchor(1a) to cursor(1b) = 2 items
    expect(board.getStatus()?.message).toMatch(/2 items/)
  })

  test("column-level data-selected attribute is set for cursor column", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    )
    // data-selected on column indicates which column contains the cursor
    board.expect("[data-selected]").toExist()
    const selected = board.q("[data-selected]")
    expect(selected.count()).toBe(1)
  })
})
