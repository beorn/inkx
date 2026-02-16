/**
 * HR node editing
 *
 * Bug: km-tui.hr-edit — pressing Enter on an HR node should enter edit mode
 * with '---' as the initial editable content. The card should show as a normal
 * bordered card in edit mode, and keyboard input should continue working.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("HR editing", () => {
  test("Enter on HR node enters edit mode and accepts keyboard input", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.hr("my-hr"), item("task-below")),
        ),
      { columns: 60, rows: 20 },
    )

    // Cursor starts on the HR node
    board.expect("#my-hr[data-cursor]").toExist()

    // Press Enter to enter edit mode
    board.press("Enter")

    // Should not ring the bell (editing is allowed)
    expect(board.bell).toBe(false)

    // HR should now be in edit mode — typing should work
    board.press("h")
    board.press("e")
    board.press("l")
    board.press("l")
    board.press("o")

    // The typed text should be visible on screen
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("hello")
  })

  test("Enter on HR opens edit with '---' as initial content", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.hr("my-hr"), item("task-below")),
        ),
      { columns: 60, rows: 20 },
    )

    board.expect("#my-hr[data-cursor]").toExist()
    board.press("Enter")

    // The edit field should show '---' (the default HR content)
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("---")
  })

  test("Escape after entering edit on HR cancels and returns to HR display", () => {
    const { board, repo } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.hr("my-hr"), item("task-below")),
        ),
      { columns: 60, rows: 20 },
    )

    board.expect("#my-hr[data-cursor]").toExist()

    // Enter edit mode
    board.press("Enter")

    // The edit field should show "---"
    const editText = stripAnsi(board.screenshot())
    expect(editText).toContain("---")

    // Escape cancels without saving
    board.press("Escape")

    // Content should remain undefined (Escape cancels)
    expect(repo.getNode("my-hr")?.content).toBeUndefined()

    // HR should render as line again (back to non-edit display)
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("─")
  })

  test("j/k navigation still works after Enter then Escape on HR", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.hr("my-hr"), item("task-below")),
        ),
      { columns: 60, rows: 20 },
    )

    board.expect("#my-hr[data-cursor]").toExist()

    // Enter then Escape (round-trip)
    board.press("Enter")
    board.press("Escape")

    // Cursor should be back on HR
    board.expect("#my-hr[data-cursor]").toExist()

    // j should navigate to the next card
    board.press("j")
    board.expect("#task-below[data-cursor]").toExist()
  })

  test("HR renders as bordered card during edit mode", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.hr("my-hr"), item("task-below")),
        ),
      { columns: 60, rows: 20 },
    )

    // Before edit: HR should be borderless
    board.expectNodeNoBorder("my-hr")

    // Enter edit mode
    board.press("Enter")

    // During edit: HR should show as bordered card
    board.expectNodeBorder("my-hr")
  })
})
