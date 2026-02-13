/**
 * Regression test: card bottom borders must not be clipped by overflow.
 *
 * Bug: When total card content height exceeds the scroll viewport, the last
 * visible card's bottom border (╰───╯) gets clipped by overflow="scroll",
 * making the card look broken. This is especially noticeable after pressing
 * `>` to increase outline depth (cards grow taller) or when the terminal
 * is short enough that cards don't all fit.
 *
 * Fix: VirtualList overflow indicators show hidden content below/above.
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
      { columns: 60, rows: 40 },
    )

    // At every fold level, top borders must equal bottom borders
    for (let press = 0; press < 4; press++) {
      if (press > 0) board.press("<")
      const text = board.screenshot()
      const top = countTopBorders(text)
      const bottom = countBottomBorders(text)
      expect(top, `After ${press} '<' presses`).toBe(bottom)
    }

    for (let press = 0; press < 4; press++) {
      board.press(">")
      const text = board.screenshot()
      const top = countTopBorders(text)
      const bottom = countBottomBorders(text)
      expect(top, `After ${press} '>' presses`).toBe(bottom)
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
      { columns: 60, rows: 40 },
    )

    board.press("j").press("j").press("j").press("j")
    board.press("<").press("<")

    const text = board.screenshot()
    const top = countTopBorders(text)
    const bottom = countBottomBorders(text)
    expect(top, "scrolled + folded").toBe(bottom)
  })
})
