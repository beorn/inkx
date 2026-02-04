/**
 * Regression: cards go empty after pressing '<' to decrease outline depth.
 *
 * Root cause: flexx's propagatePositionDelta was modifying layout.top/left
 * on all descendants when a cache hit occurred with a position delta.
 * layout.top/left are RELATIVE positions, so they should NOT change when
 * an ancestor moves — only the lastOffsetX/Y tracking values should update.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Outline depth < key - stale positions", () => {
  test("leaf card content visible after sibling shrinks", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("card-alpha", item("child1"), item("child2")),
            item("card-gamma"),
          ),
        ),
      { columns: 60, rows: 20 },
    )

    // Verify initial state
    expect(board.screenshot()).toContain("card-alpha")
    expect(board.screenshot()).toContain("card-gamma")

    // Press < twice to get to depth 0 — card-alpha shrinks (loses children)
    board.press("<")
    board.press("<")

    const after = board.screenshot()

    // card-gamma must still be visible (not pushed off-screen by stale positions)
    expect(after).toContain("card-gamma")

    // No nodes should have negative screen Y positions
    const container = board._result.getContainer()
    const negatives: string[] = []
    ;(function walk(node: any, path: string) {
      if (node.screenRect?.y < 0) {
        negatives.push(`${path}: screenY=${node.screenRect.y}`)
      }
      for (let i = 0; i < (node.children?.length ?? 0); i++) {
        const child = node.children[i]
        walk(child, `${path}>${child?.props?.id || child?.type || i}`)
      }
    })(container, "root")

    expect(
      negatives,
      `Negative screen positions:\n${negatives.join("\n")}`,
    ).toEqual([])
  })
})
