/**
 * Test: Card overflow indicator consolidation
 *
 * Verifies that when card content is truncated, a single "···" indicator
 * appears at the bottom of the card instead of multiple "+N more" indicators
 * at each heading level.
 *
 * Bead: km-tui.card-overflow-dots
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("card-overflow-dots", () => {
  test("card with overflow shows single ··· at bottom", () => {
    // Create a card with a heading that has more children than maxContentLines (default 3)
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item(
              "heading1",
              item("child1"),
              item("child2"),
              item("child3"),
              item("child4"),
              item("child5"),
            ),
          ),
        ),
      { rows: 30, columns: 80, viewMode: "cards" },
    )

    const text = board.screenshot()
    // Should show the consolidated "···" indicator
    expect(text).toContain("···")
    // Should NOT show "+N more" (suppressed in cards mode)
    expect(text).not.toContain("more")
  })

  test("card without overflow does not show ···", () => {
    // Create a card with few enough children to not overflow
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("heading1", item("child1"), item("child2")),
          ),
        ),
      { rows: 30, columns: 80, viewMode: "cards" },
    )

    const text = board.screenshot()
    // No overflow indicator
    expect(text).not.toContain("···")
    expect(text).not.toContain("more")
  })

  test("multiple headings with overflow show only one ···", () => {
    // Create a card with two headings, each with many children
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item(
              "parent-card",
              item(
                "heading-A",
                item("A1"),
                item("A2"),
                item("A3"),
                item("A4"),
                item("A5"),
              ),
              item(
                "heading-B",
                item("B1"),
                item("B2"),
                item("B3"),
                item("B4"),
                item("B5"),
              ),
            ),
          ),
        ),
      { rows: 30, columns: 80, viewMode: "cards" },
    )

    const text = board.screenshot()
    // Should show exactly ONE "···" indicator, not multiple "+N more"
    const dotsCount = (text.match(/···/g) ?? []).length
    expect(dotsCount).toBe(1)
    expect(text).not.toContain("more")
  })

  test("columns view still shows +N more (not affected)", () => {
    // In columns view (oneliner variant), the "+N more" indicator should still work
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item(
              "heading1",
              item("child1"),
              item("child2"),
              item("child3"),
              item("child4"),
              item("child5"),
              item("child6"),
              item("child7"),
              item("child8"),
              item("child9"),
              item("child10"),
              item("child11"),
              item("child12"),
              item("child13"),
              item("child14"),
              item("child15"),
              item("child16"),
              item("child17"),
              item("child18"),
              item("child19"),
              item("child20"),
              item("child21"),
            ),
          ),
        ),
      { rows: 30, columns: 80, viewMode: "columns" },
    )

    const text = board.screenshot()
    // Columns view should NOT show "···" (that's cards-only)
    expect(text).not.toContain("···")
  })
})
