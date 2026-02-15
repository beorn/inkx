/**
 * Test: zoom on body-only nodes now works (body cards are navigable).
 *
 * Body cards (paragraphs, code blocks, quotes) are individually navigable
 * with j/k, so zooming into body-only nodes produces a usable view.
 *
 * Bead: km-tui.inline-edit-body
 */

import { describe, it, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createFakeRepo } from "@km/storage"
import { createBoardDriver } from "../src/driver.ts"

describe("zoom on body-only nodes", () => {
  it("should zoom via handleZoomIn on a body-only node", () => {
    // bodyOnlyNode has only paragraph/code children — these are now navigable cards
    const nodes = item(
      "board",
      item("col1", item("bodyOnlyNode", item.paragraph("text1"), item.code("code1"))),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    expect(driver.getState().selectedNodeId).toBe("bodyOnlyNode")

    // Press 'e' (zoom_in) — should zoom since body cards are navigable
    driver.press("e")

    const after = driver.store.getState()
    expect(after.rootId).toBe("bodyOnlyNode")
  })

  it("should zoom via handleZoomInwards into a body-only node", () => {
    const nodes = item(
      "board",
      item("col1", item("task1")),
      item("bodyCol", item("bodyNode", item.paragraph("some text"), item.paragraph("more text"))),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Navigate to bodyCol's bodyNode
    driver.press("l")
    expect(driver.getState().selectedNodeId).toBe("bodyNode")

    // Press 'i' (zoom_inwards) — should zoom into bodyCol
    driver.press("i")

    const after = driver.store.getState()
    expect(after.rootId).toBe("bodyCol")
  })

  it("should zoom into a node that has structural children", () => {
    const nodes = item(
      "board",
      item("col1", item("card-with-children", item("sub1"), item("sub2"))),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Press 'i' (zoom_inwards) on the first card which has structural children
    driver.press("i")

    const after = driver.store.getState()
    expect(after.rootId).toBe("col1")
  })

  it("should zoom into a node with mixed body and structural children", () => {
    const nodes = item(
      "board",
      item("col1", item("mixed", item.paragraph("intro text"), item("real-child"))),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Press 'i' on mixed node (has both body and structural children)
    driver.press("i")

    const after = driver.store.getState()
    expect(after.rootId).toBe("col1")
  })
})
