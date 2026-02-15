/**
 * Test: Card overflow border indicator
 *
 * Verifies that when card content is truncated, the bottom border shows
 * a count indicator like "╰─── +N ───╯" instead of individual
 * "+N more" indicators at each heading level.
 *
 * Bead: km-tui.border-overflow
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("card-overflow-dots", () => {
  test("card with overflow shows border indicator with count", () => {
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
    // Should show a border-based overflow indicator like "╰─── +2 ───╯"
    expect(text).toMatch(/╰─+ \+2 ─+╯/)
    // Should NOT show "+N more" (suppressed in cards mode)
    expect(text).not.toContain("more")
  })

  test("card without overflow does not show overflow border", () => {
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
    // No overflow border indicator (no +N in bottom border)
    expect(text).not.toMatch(/\+\d+/)
    expect(text).not.toContain("more")
  })

  test("multiple headings with overflow show only one border indicator", () => {
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
    // Should show a single overflow border line (one per card, not per heading)
    const overflowBorders = text.match(/\+\d+/g) ?? []
    expect(overflowBorders).toHaveLength(1)
    expect(text).not.toContain("more")
  })

  test("columns view does not show overflow border", () => {
    // In columns view (oneliner variant), no border overflow indicator
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
    // Columns view should NOT show overflow border pattern (that's cards-only)
    expect(text).not.toMatch(/╰─+ \+\d+ ─+╯/)
  })

  test("overflow count reflects hidden children across levels", () => {
    // parent-card has 2 direct children (heading-A, heading-B) — fits in maxContentLines=3
    // Each heading has 5 children but only 3 are shown (maxContentLines=3)
    // Total hidden: 0 direct + 2 from heading-A + 2 from heading-B = 4
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item(
              "parent-card",
              item("heading-A", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
              item("heading-B", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
            ),
          ),
        ),
      { rows: 30, columns: 80, viewMode: "cards" },
    )

    const text = board.screenshot()
    // Total hidden: 2 + 2 = 4
    expect(text).toMatch(/\+4/)
  })
})
