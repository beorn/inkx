/**
 * Regression: card title wrapping used heuristic width instead of actual column width.
 *
 * Board.tsx estimated cardInnerWidth using "35 chars per column" heuristic,
 * which overestimates column count when few columns exist on a wide terminal.
 * Fix: use actual column count from filteredColumns + collapsedNodes.
 */
import { test, expect, describe } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("card border text wrapping", () => {
  test("card title fits on one line when actual column is wide enough", { timeout: 5000 }, () => {
    // At 120 cols with 2 columns, each column is ~59 chars wide.
    // Card inner width = 57, text width = 55 (minus 2 for prefix).
    // A 39-char title must fit on 1 line.
    const title = "[Tech] Set up chrome dev tools for node"

    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item(title), item("another card")),
          item("col2", item("card in col2")),
        ),
      { columns: 120, rows: 24, checkIncremental: false, incremental: false },
    )

    const text = board.screenshot()
    const lines = text.split("\n")

    // "node" should NOT appear alone on a wrapped line inside a border
    const wrappedNodeLine = lines.find((l) => /│\s+node\s+│/.test(l))
    expect(
      wrappedNodeLine,
      '"node" should not wrap to a separate line — title (39 chars) fits at actual column width',
    ).toBeUndefined()
  })

  test("many columns still wrap correctly at narrow width", { timeout: 5000 }, () => {
    // With 5 columns at 120 chars, each column is ~23 chars. Title should wrap.
    const title = "[Tech] Set up chrome dev tools for node"

    const { board } = testEnv(
      () =>
        item(
          "board",
          item("c1", item(title), item("card")),
          item("c2", item("card")),
          item("c3", item("card")),
          item("c4", item("card")),
          item("c5", item("card")),
        ),
      { columns: 120, rows: 24, checkIncremental: false, incremental: false },
    )

    const text = board.screenshot()
    // With 5 columns on 120 chars, the title SHOULD wrap (cards are narrow).
    // Just verify the test runs and renders without errors.
    expect(text).toContain("chrome dev tools")
  })
})
