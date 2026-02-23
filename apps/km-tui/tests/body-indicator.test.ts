/**
 * Body indicator (···) should only show when body content is NOT already visible.
 *
 * The ··· indicator tells the user there's hidden body content (paragraphs, code blocks, etc.).
 * When body content is already rendered as subitems or cards, the indicator is redundant.
 */
import { test, expect, describe } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("body indicator (···)", () => {
  test("does NOT show ··· when children are visible as subitems", () => {
    // Card with body children (paragraphs) — these render as subitems in cards view
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("card-with-body", item.paragraph("Some body text"), item.paragraph("More text"))),
          item("col2", item("card2")),
        ),
      { columns: 80, rows: 24, checkIncremental: false, incremental: false },
    )

    // The card should NOT show ··· because body is visible as subitems
    const screen = board.screenshot()
    expect(screen).not.toContain("···")
  })

  test("does NOT show ··· on column headers (body content visible as cards)", () => {
    // Column with body children (paragraphs) — these are shown as cards in the column
    const { board } = testEnv(
      () => item("board", item("col-with-body", item.paragraph("Body paragraph"), item("regular-card")), item("col2")),
      { columns: 80, rows: 24, checkIncremental: false, incremental: false },
    )

    // The column header should NOT show ···
    const screen = board.screenshot()
    expect(screen).not.toContain("···")
  })

  test("shows ··· when card is folded and has body children", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("card-with-body", item.paragraph("Hidden body text"), item.paragraph("More hidden text"))),
          item("col2", item("card2")),
        ),
      { columns: 80, rows: 24, checkIncremental: false, incremental: false },
    )

    // Fold the card's children with zh chord (fold_node)
    board.press("H")

    // Now ··· should show because body children are hidden (folded)
    const screen = board.screenshot()
    expect(screen).toContain("···")
  })
})
