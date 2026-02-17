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

    // Move cursor away, then check HR is borderless when unselected
    board.press("j")
    board.expectNodeNoBorder("my-hr")

    // Move back and enter edit mode
    board.press("k")
    board.press("Enter")

    // During edit: HR should show as bordered card
    board.expectNodeBorder("my-hr")
  })

  test("HR edit mode: no colored background fills the row", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.hr("my-hr"), item("task-below")),
        ),
      { columns: 40, rows: 12 },
    )

    board.press("Enter") // Enter edit mode

    // Check that the edit row doesn't have a colored background flooding the card.
    // The cursor should be a single inverse cell, not a row-wide colored fill.
    const screen = board.screen
    const hrNode = board.q("#my-hr")
    const box = hrNode.boundingBox()
    expect(box).not.toBeNull()

    if (box) {
      // Check cells on the edit row (first row inside the border = box.y)
      // After the "---" text + cursor, remaining cells should have no background color
      let coloredCells = 0
      let inverseCells = 0
      for (let x = box.x; x < box.x + box.width; x++) {
        const cell = screen.cell(x, box.y)
        if (cell && cell.bg && cell.bg !== 0) {
          coloredCells++
        }
        if ((cell.attrs as Record<string, unknown>)?.inverse) {
          inverseCells++
        }
      }
      // Allow a few cells for the cursor (inverse) and prefix, but not the whole row
      expect(coloredCells).toBeLessThan(box.width / 2)
      // Only the cursor char should be inverse, not the whole row
      expect(inverseCells, "only cursor char inverse").toBeLessThanOrEqual(1)
    }
  })
})
