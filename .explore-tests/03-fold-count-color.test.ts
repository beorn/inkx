/**
 * Verification: km-tui.fold-count-color
 *
 * Bug: when a node is folded, the child count indicator may not render
 * with correct colors.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("fold count color (km-tui.fold-count-color)", () => {
  test("folded node shows child count (za to toggle fold)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1",
            item("parent", item("child1"), item("child2"), item("child3")),
            item("other-task"),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // Cursor starts on "parent"
    board.expect("#parent[data-cursor]").toExist()

    // Toggle fold with za (vim-style fold toggle)
    board.press("z").press("a")

    // After folding, children should not be visible
    const text = stripAnsi(board.screenshot())
    expect(text).not.toContain("child1")
    expect(text).not.toContain("child2")
    expect(text).not.toContain("child3")

    // The parent card should show a count indicator
    const nodeBox = board.screen.nodeBox("parent")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    // Look for the count "3" in the row
    const row = board.screen.row(nodeBox.y)
    expect(row).toContain("3")
  })

  test("folded node count color is not yellow when not selected", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1",
            item("parent", item("c1"), item("c2")),
            item("sibling"),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // Fold the parent with za
    board.press("z").press("a")

    // Move cursor away from folded parent
    board.press("j")
    board.expect("#sibling[data-cursor]").toExist()

    // Check the parent node — count should NOT have yellow bg (selection color)
    const nodeBox = board.screen.nodeBox("parent")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = board.screen.row(nodeBox.y)
    const countIdx = row.indexOf("2")
    if (countIdx > -1) {
      const cell = board.screen.cell(countIdx, nodeBox.y)
      // Non-selected fold count should NOT be yellow bg
      expect(cell.bg).not.toEqual(3)
    }
  })

  test("deeply nested fold works without crash", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1",
            item("grandparent",
              item("parent1", item("a"), item("b")),
              item("parent2", item("c")),
            ),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // Fold grandparent with za
    board.press("z").press("a")

    const text = stripAnsi(board.screenshot())
    // Board renders without crash
    expect(text.length).toBeGreaterThan(0)
  })

  test("unfold restores children visibility", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1",
            item("parent", item("child1"), item("child2")),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // Fold
    board.press("z").press("a")
    let text = stripAnsi(board.screenshot())
    expect(text).not.toContain("child1")

    // Unfold
    board.press("z").press("a")
    text = stripAnsi(board.screenshot())
    expect(text).toContain("child1")
    expect(text).toContain("child2")
  })
})
