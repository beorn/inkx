/**
 * Exploration: Delete operations and cursor recovery.
 * Delete key: Backspace (not d — that's duplicate).
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("delete operations", () => {
  test("Backspace deletes current card", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("first"), item("second"), item("third")),
        ),
      { columns: 80, rows: 24 },
    )

    board.expect("#first[data-cursor]").toExist()

    board.press("Backspace")

    // After deleting first, second and third should remain
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("second")
    expect(text).toContain("third")
    // first should be gone
    expect(text).not.toContain("first")
  })

  test("d duplicates current card", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("original")),
        ),
      { columns: 80, rows: 24 },
    )

    board.expect("#original[data-cursor]").toExist()

    board.press("d")

    // Should now have two copies
    const text = stripAnsi(board.screenshot())
    const matches = text.match(/original/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(2)
  })

  test("cursor moves after Backspace delete", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("first"), item("second")),
        ),
      { columns: 80, rows: 24 },
    )

    board.expect("#first[data-cursor]").toExist()
    board.press("Backspace")

    // After deleting first, cursor should land on second
    board.expect("#second[data-cursor]").toExist()
  })
})
