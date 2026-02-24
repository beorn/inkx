/**
 * Bell message tests.
 *
 * Verifies that pressing an unmapped key shows a status message
 * ("Unmapped key: X") in the command feedback pane alongside the visual bell.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("bell message on unmapped key", () => {
  test("pressing unmapped printable key shows message in bottom bar", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))

    // 'Q' is not mapped to any command in cards view
    board.press("Q")

    const screenshot = board.screenshot()
    // Should show the unmapped key message
    expect(screenshot).toContain("Unmapped key: Shift+Q")
  })

  test("bell state is set on unmapped key", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))

    board.press("Q")

    // The bottom bar should have bell flash (red background)
    board.expect("#bottom-bar").toExist()
    // Bell state triggers data-bell attribute
    board.expect("[data-bell-flash]").toExist()
  })

  test("boundary movement shows directional message, not unmapped key", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))

    // 'h' moves left — at leftmost column, should show boundary message
    board.press("h")

    const screenshot = board.screenshot()
    // Should show boundary message, not "Unmapped key"
    expect(screenshot).not.toContain("Unmapped key")
    expect(screenshot).toContain("Can't move")
  })

  test("next keypress clears the bell message", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))))

    // Press unmapped key
    board.press("Q")
    expect(board.screenshot()).toContain("Unmapped key: Shift+Q")

    // Press mapped key (j = cursor down)
    board.press("j")
    expect(board.screenshot()).not.toContain("Unmapped key")
  })
})
