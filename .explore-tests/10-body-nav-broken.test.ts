/**
 * Regression check: km-tui.body-nav-broken
 *
 * Navigation should work correctly on files with body paragraphs.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"

describe("body navigation regression (km-tui.body-nav-broken)", () => {
  test("j/k works with body paragraphs and structural columns", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("intro"),
          item.paragraph("details"),
          item("Tasks", item("task1"), item("task2")),
          item("Done", item("done1")),
        ),
    )

    // Start on first body paragraph
    board.expect("#intro[data-cursor]").toExist()

    // j moves down through body
    board.press("j")
    board.expect("#details[data-cursor]").toExist()

    // k goes back up
    board.press("k")
    board.expect("#intro[data-cursor]").toExist()

    // l navigates to structural column
    board.press("l")
    board.expect("#task1[data-cursor]").toExist()

    // j works in structural column
    board.press("j")
    board.expect("#task2[data-cursor]").toExist()

    // l moves to next column
    board.press("l")
    board.expect("#done1[data-cursor]").toExist()

    // h goes back
    board.press("h")
    // Should be in Tasks column (sticky Y should place us near task2)
    const cursor = board.q("[data-cursor]").textContent()
    expect(cursor).toMatch(/task1|task2/)
  })

  test("mixed body and structural content renders without crash", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("body1"),
          item.code("some code block"),
          item.quote("a blockquote"),
          item("Section", item("item1")),
        ),
      { columns: 80, rows: 30 },
    )

    // All elements should be navigable
    board.expect("#body1[data-cursor]").toExist()

    board.press("j")
    board.expect("[id='some code block'][data-cursor]").toExist()

    board.press("j")
    board.expect("[id='a blockquote'][data-cursor]").toExist()
  })
})
