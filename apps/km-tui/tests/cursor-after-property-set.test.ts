/**
 * Cursor stability after property mutations (km-tui.td-cursor-jump)
 *
 * After setting date/priority/status, cursor must remain on the same card.
 * Bug: refreshBoardState re-derives columns with a different method than
 * deriveColumnsFromRepo, causing index mismatch when virtual body columns
 * or li-type root children shift the column indices.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("cursor stability after property set (km-tui.td-cursor-jump)", () => {
  test("sp (priority) preserves cursor on same card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.task("tA"), item.task("tB")), item("col2", item.task("tC"), item.task("tD"))),
    )

    // Navigate to tB (col1, card index 1)
    board.press("j")
    board.expect("#tB[data-cursor]").toExist()

    // Set priority
    board.press("s").press("p")

    // Cursor should still be on tB
    board.expect("#tB[data-cursor]").toExist()
  })

  test("sp preserves cursor when board has body content (virtual body column)", () => {
    const { board } = testEnv(() =>
      item.file(
        "myboard",
        item.paragraph("description"),
        item.section("Todo", item.task("tA"), item.task("tB")),
        item.section("Done", item.task("tC")),
      ),
    )

    // Navigate past virtual body column to Todo column, then to tB
    board.press("l") // Move to Todo column
    board.press("j") // Move to tB (second card in Todo)
    board.expect("#tB[data-cursor]").toExist()

    // Set priority — this triggers refreshBoardState(ctx)
    board.press("s").press("p")

    // Cursor must still be on tB — NOT jumped to a different card
    board.expect("#tB[data-cursor]").toExist()
  })

  test("x (task status toggle) preserves cursor on same card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.task("tA"), item.task("tB")), item("col2", item.task("tC"))),
    )

    // Navigate to second column, first card (tC)
    board.press("l")
    board.expect("#tC[data-cursor]").toExist()

    // Toggle task status
    board.press("x")

    // Cursor should still be on tC
    board.expect("#tC[data-cursor]").toExist()
  })

  test("x preserves cursor when board has body content", () => {
    const { board } = testEnv(() =>
      item.file(
        "myboard",
        item.paragraph("intro"),
        item.section("Active", item.task("tA"), item.task("tB")),
        item.section("Done", item.task("tC")),
      ),
    )

    // Navigate to Active column (past body), then to tB
    board.press("l") // Past body column to Active
    board.press("j") // tB
    board.expect("#tB[data-cursor]").toExist()

    // Toggle task status
    board.press("x")

    // Cursor must still be on tB
    board.expect("#tB[data-cursor]").toExist()
  })

  test("undo/redo preserves cursor position", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.task("tA"), item.task("tB")), item("col2", item.task("tC"))),
    )

    // Navigate to tB
    board.press("j")
    board.expect("#tB[data-cursor]").toExist()

    // Set priority (creates undo entry)
    board.press("s").press("p")
    board.expect("#tB[data-cursor]").toExist()

    // Undo (Ctrl-z)
    board.press("Control-z")
    board.expect("#tB[data-cursor]").toExist()

    // Redo (Ctrl-y)
    board.press("Control-y")
    board.expect("#tB[data-cursor]").toExist()
  })
})
