/**
 * Regression check: km-tui.card-line-truncate
 *
 * Long card content should truncate (not wrap to multiple lines).
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"

describe("card line truncation (km-tui.card-line-truncate)", () => {
  test("long child item renders on exactly one line", () => {
    const { board, repo } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("card1", item("long-child"))),
        ),
      { columns: 40, rows: 20 },
    )

    // Override content to be very long
    repo.updateNode("long-child", {
      content: "This is an extremely long piece of text that should definitely be truncated at the column boundary and not wrap",
    })

    // Re-render
    board.press("j").press("k")

    const childNode = board.q("#long-child")
    expect(childNode.count()).toBe(1)

    const rect = childNode.boundingBox()
    expect(rect.height).toBe(1)
  })

  test("multiple long children each render on one line", () => {
    const { board, repo } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("card1", item("c1"), item("c2"), item("c3"))),
        ),
      { columns: 40, rows: 20 },
    )

    repo.updateNode("c1", { content: "Very long text for child one that exceeds available width easily" })
    repo.updateNode("c2", { content: "Another extremely long text for child two that goes beyond the boundary" })
    repo.updateNode("c3", { content: "Third long child with overflowing content text line" })

    // Re-render
    board.press("j").press("k")

    const c1Rect = board.q("#c1").boundingBox()
    const c2Rect = board.q("#c2").boundingBox()
    const c3Rect = board.q("#c3").boundingBox()

    expect(c1Rect.height).toBe(1)
    expect(c2Rect.height).toBe(1)
    expect(c3Rect.height).toBe(1)

    // Each child on consecutive lines
    expect(c2Rect.y).toBe(c1Rect.y + 1)
    expect(c3Rect.y).toBe(c2Rect.y + 1)
  })
})
