import { test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

/**
 * Count how many lines in the screenshot contain bottom border characters.
 * Each card should have a bottom border line with ╰───...───╯ pattern.
 */
function countBottomBorders(screenshot: string): number {
  return screenshot.split("\n").filter((line) => /╰.*─.*╯/.test(line)).length
}

function countTopBorders(screenshot: string): number {
  return screenshot.split("\n").filter((line) => /╭.*─.*╮/.test(line)).length
}

test("border count matches through fold/unfold with many cards near overflow boundary", () => {
  // This tests with enough cards that overflow is near the boundary.
  // When maxOutlineDepth decreases, cards shrink, potentially moving
  // the bottom border to exactly the overflow clip line.
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

  // Check at each fold level that top borders match bottom borders
  for (let press = 0; press < 4; press++) {
    if (press > 0) board.press("<")
    const text = board.screenshot()
    const topBorders = countTopBorders(text)
    const bottomBorders = countBottomBorders(text)
    // Partial cards at viewport edge: top or bottom can exceed the other by at most 1
    if (Math.abs(topBorders - bottomBorders) > 1) {
      const lines = text.split("\n")
      const annotated = lines
        .map((line, i) => {
          const hasTop = /╭.*╮/.test(line)
          const hasBottom = /╰.*╯/.test(line)
          const marker = hasTop ? "T" : hasBottom ? "B" : " "
          return `${String(i).padStart(2)} ${marker} ${line}`
        })
        .join("\n")
      expect.fail(`After ${press} '<' presses: top (${topBorders}) - bottom (${bottomBorders}) > 1\n${annotated}`)
    }
  }

  // And unfold back
  for (let press = 0; press < 4; press++) {
    board.press(">")
    const text = board.screenshot()
    const topBorders = countTopBorders(text)
    const bottomBorders = countBottomBorders(text)
    expect(
      Math.abs(topBorders - bottomBorders),
      `After ${press} '>' presses: top=${topBorders} bottom=${bottomBorders}`,
    ).toBeLessThanOrEqual(1)
  }
})

test("border integrity with scrolled viewport after fold", () => {
  // Navigate down first so we're scrolled, then fold
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
    { columns: 60, rows: 16 },
  )

  // Navigate down to trigger scroll
  board.press("j").press("j").press("j").press("j")

  // Now fold
  board.press("<")
  board.press("<")

  const text = board.screenshot()
  const topBorders = countTopBorders(text)
  const bottomBorders = countBottomBorders(text)
  expect(
    Math.abs(topBorders - bottomBorders),
    `scrolled + folded: top (${topBorders}) should equal bottom (${bottomBorders})`,
  ).toBeLessThanOrEqual(1)
})
