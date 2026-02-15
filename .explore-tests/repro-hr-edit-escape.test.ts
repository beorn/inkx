/**
 * BUG: km-tui.hr-edit — pressing 'i' on HR node then Escape corrupts board state
 *
 * When user navigates to an HR node and presses 'i' (zoom_inwards),
 * the HR has no children, but the zoom walks up to the parent column
 * and zooms into it. This causes the HR to disappear from view and the
 * cursor to land on a breadcrumb/column header instead of the HR.
 *
 * Expected: 'i' on an HR (leaf node with no children) should be a no-op
 * boundary since there's nothing to zoom into.
 */
import { describe, it, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("BUG: km-tui.hr-edit", () => {
  it("pressing 'i' on HR should not zoom away — HR must remain visible", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-above"), item.hr("my-hr"), item("task-below")),
        ),
      { columns: 60, rows: 20 },
    )

    // Cursor starts on task-above
    board.expect("#task-above[data-cursor]").toExist()

    // Navigate to HR
    board.press("j")
    board.expect("#my-hr[data-cursor]").toExist()

    // Before pressing 'i', capture that task-above is visible
    const beforeText = stripAnsi(board.screenshot())
    expect(beforeText).toContain("task-above")

    // Press 'i' (zoom_inwards) on the HR node
    board.press("i")

    // HR has no children — 'i' should be a boundary/no-op.
    // The HR should still be visible and cursor should remain on it.
    const afterText = stripAnsi(board.screenshot())

    // BUG: After 'i', the view zooms into col1, losing the original board context.
    // task-above should still be visible as a sibling card.
    expect(afterText).toContain("task-above")
  })

  it("i then Escape on HR: HR must remain visible and navigable", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-above"), item.hr("my-hr"), item("task-below")),
        ),
      { columns: 60, rows: 20 },
    )

    // Navigate to HR
    board.press("j")
    board.expect("#my-hr[data-cursor]").toExist()

    // Press i then Escape
    board.press("i")
    board.press("escape")

    // After i+Escape, the HR must still be visible.
    // BUG: Currently the HR disappears and cursor ends up on column header.
    const text = stripAnsi(board.screenshot())

    // All three items must still be visible
    expect(text).toContain("task-above")
    expect(text).toContain("task-below")

    // And we should be able to navigate with j (not get "Can't move down")
    board.press("j")
    board.expect("#task-below[data-cursor]").toExist()
  })
})
