/**
 * Bug: km-tui.u-zoom-parent
 *
 * 'u' (zoom_outwards) should navigate to the tree PARENT when it can't zoom
 * further. Previously it fell back to handleCursorMove("up") which went to the
 * previous sibling (same as 'k').
 *
 * Fix: navigateToParent() walks up the tree hierarchy instead of visual layout.
 */
import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("u key — go to parent, not previous sibling", () => {
  test("u from 2nd card goes to column header (parent), not prev sibling", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A1"), item("A2"), item("A3")),
        ),
      { columns: 120, rows: 24 },
    )

    board.press("j") // → A2
    board.expect("#A2[data-cursor]").toExist()

    board.press("u")
    board.expect("#col1[data-cursor]").toExist()
  })

  test("u from 3rd card goes to column header (parent), not prev sibling", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A1"), item("A2"), item("A3")),
        ),
      { columns: 120, rows: 24 },
    )

    board.press("j").press("j") // → A3
    board.expect("#A3[data-cursor]").toExist()

    board.press("u")
    board.expect("#col1[data-cursor]").toExist()
  })

  test("u twice from card: card → column → board", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A1"), item("A2"), item("A3")),
        ),
      { columns: 120, rows: 24 },
    )

    board.press("j").press("j") // → A3
    board.expect("#A3[data-cursor]").toExist()

    board.press("u") // → col1
    board.expect("#col1[data-cursor]").toExist()

    board.press("u") // → board
    board.expect("#board[data-cursor]").toExist()
  })

  test("u from board level is boundary", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A1")),
        ),
      { columns: 120, rows: 24 },
    )

    board.press("k").press("k") // card → col → board
    board.expect("#board[data-cursor]").toExist()

    board.press("u")
    board.expect("#board[data-cursor]").toExist()
    expect(board.bell).toBe(true)
  })

  test("u from column header goes to board level", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A1")),
          item("col2", item("B1")),
        ),
      { columns: 120, rows: 24 },
    )

    board.press("k") // card → column header
    board.expect("#col1[data-cursor]").toExist()

    board.press("u")
    board.expect("#board[data-cursor]").toExist()
  })

  test("u is different from k: u → parent, k → prev sibling", () => {
    const { board: boardU } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A1"), item("A2"), item("A3")),
        ),
      { columns: 120, rows: 24 },
    )

    const { board: boardK } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A1"), item("A2"), item("A3")),
        ),
      { columns: 120, rows: 24 },
    )

    boardU.press("j") // → A2
    boardK.press("j") // → A2

    boardU.press("u")
    boardK.press("k")

    const uResult = boardU.q("[data-cursor]").getAttribute("id")
    const kResult = boardK.q("[data-cursor]").getAttribute("id")

    expect(uResult).toBe("col1") // u → parent
    expect(kResult).toBe("A1") // k → prev sibling
  })

  test("u from card in col2 goes to col2 header", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A1")),
          item("col2", item("B1"), item("B2"), item("B3")),
        ),
      { columns: 120, rows: 24 },
    )

    board.press("l") // → B1
    board.press("j") // → B2
    board.expect("#B2[data-cursor]").toExist()

    board.press("u")
    board.expect("#col2[data-cursor]").toExist()
  })

  test("u from body card goes to board level (body cards are children of root)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("para1"),
          item.paragraph("para2"),
          item("col1", item("A1")),
        ),
      { columns: 120, rows: 24 },
    )

    board.press("j") // → para2
    board.expect("#para2[data-cursor]").toExist()

    // Body cards' tree parent is the board root
    board.press("u")
    board.expect("#board[data-cursor]").toExist()
  })
})
