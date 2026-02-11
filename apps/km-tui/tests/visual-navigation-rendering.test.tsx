/**
 * Visual Navigation Integration Tests
 *
 * Tests that verify the full h/l visual navigation flow:
 * 1. Board renders with LayoutProvider
 * 2. Cards register their screen positions via useScreenRectCallback
 * 3. h/l navigation finds cards at the same visual Y position
 *
 * Uses DI to inject a layoutRegistry that we can inspect.
 */

import { describe, test, expect } from "vitest"
import { createRenderer } from "inkx/testing"
import { createLayoutRegistry } from "../src/card-positions.ts"
import { createFakeRepo } from "@km/storage"
import { item, renderBoardWithStore } from "./helpers/board-test.ts"

const render80 = createRenderer({ cols: 80, rows: 24 })

describe("Visual navigation integration: card position registration", () => {
  test("cards in single column register with increasing Y positions", () => {
    const registry = createLayoutRegistry()

    const nodes = item(
      "board",
      item("col1", item("1a"), item("1b"), item("1c")),
    )
    const repo = createFakeRepo({ nodes })

    const app = renderBoardWithStore(repo, "board", {
      layoutRegistry: registry,
      render: render80,
    })

    // Verify render contains the tasks
    expect(app.text).toContain("1a")
    expect(app.text).toContain("1b")
    expect(app.text).toContain("1c")

    // Verify cards registered their positions
    expect(registry.hasCardsInColumn(0)).toBe(true)

    // Get positions and verify they have increasing Y values
    const l1 = registry.getNode("1a")
    const l2 = registry.getNode("1b")
    const l3 = registry.getNode("1c")

    expect(l1.y).toBeLessThan(l2.y)
    expect(l2.y).toBeLessThan(l3.y)
  })

  test("cards in same row across columns have same Y position", () => {
    const registry = createLayoutRegistry()

    const nodes = item(
      "board",
      item("col1", item("1a"), item("1b")),
      item("col2", item("2a"), item("2b")),
    )
    const repo = createFakeRepo({ nodes })

    renderBoardWithStore(repo, "board", {
      layoutRegistry: registry,
      render: render80,
    })

    // Both columns should have cards registered
    expect(registry.hasCardsInColumn(0)).toBe(true)
    expect(registry.hasCardsInColumn(1)).toBe(true)

    // First cards in each column should have similar Y positions
    const lA1 = registry.getNode("1a")
    const lB1 = registry.getNode("2a")

    // Cards at same position in different columns should have same Y
    // (within a small tolerance for borders)
    expect(Math.abs(lA1.y - lB1.y)).toBeLessThanOrEqual(1)
  })

  test("findCardAtYVisual returns correct card index", () => {
    const registry = createLayoutRegistry()

    const nodes = item(
      "board",
      item("col1", item("1a"), item("1b"), item("1c")),
      item("col2", item("2a"), item("2b")),
    )
    const repo = createFakeRepo({ nodes })

    renderBoardWithStore(repo, "board", {
      layoutRegistry: registry,
      render: render80,
    })

    // Get the Y position of 1b (card at index 1 in col1)
    const lA2 = registry.getNode("1b")
    const targetY = lA2.y + lA2.cardHeight / 2

    // Find the card at that Y in column 1
    const foundIdx = registry.findCardAtYVisual(1, targetY)

    // Should find 2b (index 1) since it's at similar Y to 1b
    expect(foundIdx).toBe(1)
  })
})
