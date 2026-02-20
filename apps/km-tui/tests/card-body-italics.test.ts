/**
 * Regression: card body with `* item` content should NOT render as italics.
 *
 * When a paragraph node contains content with `* text` list markers,
 * the asterisks should be rendered as-is (list markers), not as markdown
 * italic formatting.
 */
import { test, expect, describe } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("card body list markers (not italics)", () => {
  test("* at line start is not rendered as italic", () => {
    // Create a card with a paragraph body that has list-like content
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-with-notes", item.paragraph("* first item\n* second item"))),
          item("col2", item("card2")),
        ),
      { columns: 80, rows: 24, checkIncremental: false, incremental: false },
    )

    const screen = board.screenshot()
    // The * should be preserved as a list marker, not consumed by italic formatting
    // (Only first line visible due to card height constraint)
    expect(screen).toContain("* first item")
  })
})
