/**
 * Bug: cardInnerWidth off by 1 causes wrong title wrap calculation.
 *
 * Board.tsx computes cardInnerWidth = expandedWidth - 2, but the actual card
 * inner width is expandedWidth - 3 because CardColumn.tsx passes
 * width - 1 to Card (line 703). The overflow calculation uses
 * cardInnerWidth - 2 for text width, which is 1 column too wide.
 *
 * Width chain:
 *   Column: width = expandedWidth
 *   Card:   width = expandedWidth - 1        (CardColumn renderItem)
 *   Inner:  expandedWidth - 1 - 2 = eW - 3   (border left+right)
 *   Title:  eW - 3 - 2 = eW - 5              (prefix: marker + space)
 *
 * cardInnerWidth should be expandedWidth - 3 (not -2).
 * textWidth should be expandedWidth - 5 (not -4).
 */
import { test, expect, describe } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("card title wrap width", () => {
  test("overflow indicator shows when title wraps at actual card width", { timeout: 5000 }, () => {
    // With 2 columns at 80 chars:
    //   expandedWidth = floor((80 - 1) / 2) = 39
    //   Actual title area = 39 - 5 = 34 chars
    //   Buggy textWidth  = 39 - 4 = 35 chars (1 too wide)
    //
    // A 35-char title wraps in 34-char space (2 lines).
    // Buggy calc: ceil(35/35) - 1 = 0  -> no overflow detected
    // Fixed calc: ceil(35/34) - 1 = 1  -> overflow detected
    //
    // Card has exactly maxContentLines (3) children.
    // Title wrap should add +1 to overflow, showing the indicator.
    const title35 = "A very long title that needs wrap!!" // exactly 35 chars
    expect(title35.length).toBe(35) // sanity check

    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item(title35, item("child1"), item("child2"), item("child3"))),
          item("col2", item("card")),
        ),
      { columns: 80, rows: 24, checkIncremental: false, incremental: false },
    )

    const text = board.screenshot()

    // With correct cardInnerWidth, the overflow indicator (+1) should appear
    // because the title wraps and consumes an extra visual line.
    expect(text, `Overflow indicator should appear when title wraps.\nScreenshot:\n${text}`).toMatch(/\+\d/)
  })

  test("no false overflow when title fits on one line", { timeout: 5000 }, () => {
    // A 33-char title fits in 34-char space. No overflow from title.
    // Card has exactly maxContentLines (3) children. No overflow from children.
    const title33 = "A title that fits in the column!!" // exactly 33 chars
    expect(title33.length).toBe(33) // sanity check

    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item(title33, item("child1"), item("child2"), item("child3"))),
          item("col2", item("card")),
        ),
      { columns: 80, rows: 24, checkIncremental: false, incremental: false },
    )

    const text = board.screenshot()
    const lines = text.split("\n")

    // No overflow: title fits on 1 line, children fit in maxContentLines.
    // The overflow indicator should NOT appear.
    const overflowLine = lines.find((l) => /╰.*\+\d.*╯/.test(l))
    expect(
      overflowLine,
      `Should NOT show overflow when title fits on one line.\nScreenshot:\n${text}`,
    ).toBeUndefined()
  })
})
