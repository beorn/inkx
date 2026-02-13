/**
 * Exploration: Column delete — x on column header triggers ConfirmDialog
 *
 * Tests deleting columns at the column header level.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Exploration: Column Delete", () => {
  test("Backspace on column header with children shows confirm dialog", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
    const bugs: string[] = []

    // Navigate to col1 header
    board.press("k") // col1 header

    // Try to delete column with children
    board.press("Backspace")

    // Should show confirmation dialog — col1 still exists
    const boardKids = childIds(repo, "board")
    if (!boardKids.includes("col1")) {
      bugs.push("column deleted without confirmation")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after column delete attempt")
    }
    expect(bugs).toEqual([])
  })

  test("Backspace on column header, confirm with Enter", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
    const bugs: string[] = []

    // Navigate to col1 header
    board.press("k")

    // Delete with confirmation
    board.press("Backspace")
    board.press("Enter") // confirm

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after confirmed column delete")
    }
    expect(bugs).toEqual([])
  })

  test("Backspace on column header, cancel with Escape", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
    const bugs: string[] = []

    // Navigate to col1 header
    board.press("k")

    // Try delete then cancel
    board.press("Backspace")
    board.press("Escape") // cancel

    // col1 should still exist
    const boardKids = childIds(repo, "board")
    if (!boardKids.includes("col1")) {
      bugs.push("column deleted despite canceling")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after canceled column delete")
    }
    expect(bugs).toEqual([])
  })

  test("Backspace on empty column", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A")), item("col2")))
    const bugs: string[] = []

    // Navigate to col2 header (empty column)
    board.press("k") // col1 header
    board.press("l") // col2 header

    board.press("Backspace")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after deleting empty column")
    }
    expect(bugs).toEqual([])
  })

  test("delete last column via header", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A")), item("col2", item("B"))))
    const bugs: string[] = []

    // Navigate to col2 header
    board.press("k") // col1 header
    board.press("l") // col2 header

    board.press("Backspace")
    // May need Enter to confirm if has children
    board.press("Enter")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after deleting last column")
    }
    expect(bugs).toEqual([])
  })

  test("cursor position after column delete", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A")), item("col2", item("B")), item("col3", item("C"))),
    )
    const bugs: string[] = []

    // Navigate to col2 header
    board.press("k") // col1 header
    board.press("l") // col2 header

    board.press("Backspace")
    board.press("Enter") // confirm

    // Cursor should land on a valid position
    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in cursor after column delete")
    }
    expect(bugs).toEqual([])
  })
})
