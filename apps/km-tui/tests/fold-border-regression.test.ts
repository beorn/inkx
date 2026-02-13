/**
 * Regression test: card borders must be consistent through fold/unfold.
 *
 * With partial card rendering, a card at the viewport edge may have its top
 * border visible but bottom border clipped. So topBorders can be at most 1
 * more than bottomBorders (the partially visible card at the bottom edge).
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function countBottomBorders(screenshot: string): number {
  return screenshot.split("\n").filter((line) => /╰.*─.*╯/.test(line)).length
}

function countTopBorders(screenshot: string): number {
  return screenshot.split("\n").filter((line) => /╭.*─.*╮/.test(line)).length
}

describe("Fold border regression", () => {
  test("every visible card has matching top and bottom borders", () => {
    // Cards with children overflow a 20-row viewport at maxOutlineDepth=2.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("A", item("a1"), item("a2"), item("a3")),
            item("B", item("b1"), item("b2")),
            item("C", item("c1"), item("c2"), item("c3")),
            item("D"),
            item("E", item("e1")),
            item("F"),
            item("G", item("g1")),
          ),
        ),
      { columns: 60, rows: 20 },
    )

    // At every fold level, top borders must equal bottom borders
    for (let press = 0; press < 4; press++) {
      if (press > 0) board.press("<")
      const text = board.screenshot()
      const top = countTopBorders(text)
      const bottom = countBottomBorders(text)
      // Top can exceed bottom by 1 (partially visible card at viewport edge)
      expect(Math.abs(top - bottom), `After ${press} '<' presses: top=${top} bottom=${bottom}`).toBeLessThanOrEqual(1)
    }

    for (let press = 0; press < 4; press++) {
      board.press(">")
      const text = board.screenshot()
      const top = countTopBorders(text)
      const bottom = countBottomBorders(text)
      expect(Math.abs(top - bottom), `After ${press} '>' presses: top=${top} bottom=${bottom}`).toBeLessThanOrEqual(1)
    }
  })

  test("border integrity after scrolling then folding", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("A", item("a1"), item("a2")),
            item("B", item("b1"), item("b2")),
            item("C", item("c1")),
            item("D", item("d1"), item("d2"), item("d3")),
            item("E"),
            item("F", item("f1")),
            item("G"),
            item("H", item("h1")),
          ),
        ),
      { columns: 60, rows: 20 },
    )

    board.press("j").press("j").press("j").press("j")
    board.press("<").press("<")

    const text = board.screenshot()
    const top = countTopBorders(text)
    const bottom = countBottomBorders(text)
    expect(Math.abs(top - bottom), `scrolled + folded: top=${top} bottom=${bottom}`).toBeLessThanOrEqual(1)
  })
})
