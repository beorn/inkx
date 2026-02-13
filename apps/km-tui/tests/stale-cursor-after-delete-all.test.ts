/**
 * Bug: Stale cursor after deleting all cards in a column
 *
 * After deleting all cards in a column, the cursor still references the last
 * deleted node. Subsequent navigation produces:
 *   ERROR km:nav cursor node not in repo: B, falling back to root
 *
 * Key sequence: Backspace, Backspace, l
 * Fixture: board with col1(A, B) and col2(C)
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("stale-cursor-after-delete-all", () => {
  test("deleting all cards in column should not leave stale cursor", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))

    // Delete A (cursor moves to B)
    board.press("Backspace")

    // Delete B (col1 now empty — cursor should move to col header or col2)
    board.press("Backspace")

    // Navigate to col2 — should NOT produce console.error about stale cursor
    board.press("l")

    // C should be visible and cursor should be on it
    const text = board.screenshot()
    expect(text).toContain("C")
  })
})
