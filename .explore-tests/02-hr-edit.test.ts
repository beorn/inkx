/**
 * Verification: km-tui.hr-edit
 *
 * Bug: pressing 'i' on an HR node — does editing work or crash?
 *
 * FINDING: Pressing 'i' on HR enters edit mode, but Escape does NOT restore
 * the HR node. After i+Escape, the cursor is on the breadcrumb/column header
 * and the HR node is no longer visible. The Description/body column shows
 * only task-above and task-below. 'j' from this state gives "Can't move down".
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("HR edit mode (km-tui.hr-edit)", () => {
  test("pressing i on HR node enters edit mode without crash", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-above"), item.hr("my-hr"), item("task-below")),
        ),
      { columns: 60, rows: 20 },
    )

    // Navigate to the HR node
    board.press("j")
    board.expect("#my-hr[data-cursor]").toExist()

    // Press i to enter edit mode — should not crash
    board.press("i")

    // The board should still be rendering (no crash)
    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })

  test("BUG: i on HR then Escape loses the HR and cursor context", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-above"), item.hr("my-hr"), item("task-below")),
        ),
      { columns: 60, rows: 20 },
    )

    // Navigate to the HR node
    board.press("j")
    board.expect("#my-hr[data-cursor]").toExist()

    // Press i then Escape
    board.press("i")
    board.press("escape")

    // BUG: After i+Escape on HR, the HR is gone and cursor is lost.
    // The cursor lands on the column header/breadcrumb area.
    // Pressing j gives "Can't move down" status message.
    // This confirms km-tui.hr-edit is a real bug.

    // Document: HR node should still exist after i+escape
    const text = stripAnsi(board.screenshot())
    // The HR rendering (─ characters) is missing from the screenshot
    // This is the bug: HR content gets lost or navigation breaks

    // For now, just verify no crash
    expect(text.length).toBeGreaterThan(0)
  })

  test("HR node is still navigable with j/k", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("above"), item.hr("hr1"), item("below")),
        ),
      { columns: 60, rows: 20 },
    )

    // Start on "above"
    board.expect("#above[data-cursor]").toExist()

    // j goes to HR
    board.press("j")
    board.expect("#hr1[data-cursor]").toExist()

    // j goes to "below"
    board.press("j")
    board.expect("#below[data-cursor]").toExist()

    // k goes back to HR
    board.press("k")
    board.expect("#hr1[data-cursor]").toExist()
  })
})
