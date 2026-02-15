/**
 * Card line truncation test
 *
 * Verifies that child items inside cards (depth > 0) render as single lines
 * with truncation, rather than wrapping to multiple physical lines.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("card child line truncation", () => {
  test("long child items render on exactly one line in cards view", () => {
    // Use item() with a simple ID but make the content long via the node
    // item() uses content as ID, so we need a simple ID
    const { board, repo } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("card1", item("long-child"))),
        ),
      { columns: 40, rows: 20 },
    )

    // Override the content to be very long (the ID stays "long-child")
    repo.updateNode("long-child", {
      content: "Accessible at /Library/Mobile Documents/comapple~CloudDocs/very-long-path-name-here",
    })

    // Re-render to pick up the content change
    board.press("j").press("k")

    // The child node should exist
    const childNode = board.q("#long-child")
    expect(childNode.count()).toBe(1)

    // The child node's root Box should be exactly 1 row tall (truncated)
    const rect = childNode.boundingBox()
    expect(rect.height).toBe(1)
  })

  test("card root (depth 0) remains multiline while children truncate", () => {
    const { board, repo } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("card1", item("child1"), item("child2"))),
        ),
      { columns: 40, rows: 20 },
    )

    // Override content to be very long
    repo.updateNode("child1", {
      content: "First child with a very long description that should be truncated at column boundary",
    })
    repo.updateNode("child2", {
      content: "Second child also with extremely long text that exceeds the available width easily",
    })

    // Re-render
    board.press("j").press("k")

    // Both children should exist
    board.expect("#child1").toExist()
    board.expect("#child2").toExist()

    // Each child should be exactly 1 row tall (truncated, not wrapped)
    const child1Rect = board.q("#child1").boundingBox()
    const child2Rect = board.q("#child2").boundingBox()
    expect(child1Rect.height).toBe(1)
    expect(child2Rect.height).toBe(1)

    // Children should be on consecutive lines (not taking multiple lines each)
    expect(child2Rect.y).toBe(child1Rect.y + 1)
  })
})
