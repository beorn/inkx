/**
 * Regression test for curswantY calculation
 *
 * Bug: HeadRow used useBoxRect which reads parent's NodeContext,
 * causing headHeight to equal full card height instead of title row height.
 *
 * Fix: Use Box's onLayout prop which correctly measures the HeadRow's own dimensions.
 *
 * @see docs/ref/ui.md#curswanty-cross-column-navigation-hl
 */
import { test, expect, describe } from "vitest"
import { createRenderer } from "@silvery/test"
import { createGridNavigator } from "@km/board"
import { createFakeRepo } from "@km/storage"
import { item, renderBoardWithStore } from "./helpers/board-test.ts"

// Module-level renderers (created once, reused across tests via auto-cleanup)
const render80 = createRenderer({ cols: 80, rows: 24 })
const render120 = createRenderer({ cols: 120, rows: 40 })

describe("curswantY regression", () => {
  test("headHeight should be 1 (title row), not full card height", () => {
    // Bug: headHeight was equal to cardHeight because useBoxRect
    // read the parent's NodeContext, not HeadRow's own Box
    const registry = createGridNavigator()

    // Create board with cards that have children (making them tall)
    const nodes = item("board", item("col0", item("card0", item("child1"), item("child2"), item("child3"))))
    const repo = createFakeRepo({ nodes })

    renderBoardWithStore(repo, "board", {
      navigator: registry,
      render: render80,
    })

    const head = registry.getHead(0, 0)
    const pos = registry.getPosition(0, 0)!

    // Key assertion: headHeight should be 1 (title row), not card height
    expect(head?.height).toBe(1)
    expect(pos.height).toBeGreaterThan(1) // Card is tall due to children
    expect(head?.height).not.toBe(pos.height)
  })

  test("h/l navigation uses title midpoint, lands on closest card midpoint", () => {
    // Regression: navigation from tall card should use title midpoint (~4.5),
    // not card center (much lower), so it lands on first card in target column
    const registry = createGridNavigator()

    // Create board with:
    // - Column 0: tall card with children
    // - Column 1: tall card first, then short card
    // - Column 2: short card first, then tall card
    const nodes = item(
      "board",
      item("col0", item("tall0", item("c1"), item("c2"), item("c3"), item("c4"))),
      item("col1", item("tall1", item("cA"), item("cB"), item("cC")), item("short1")),
      item("col2", item("short2"), item("tall2", item("cX"), item("cY"), item("cZ"))),
    )
    const repo = createFakeRepo({ nodes })

    renderBoardWithStore(repo, "board", {
      columns: 120,
      rows: 40,
      navigator: registry,
      render: render120,
    })

    // Get curswantY from first card's title midpoint
    const curswantY = registry.getItemMidY(0, 0)

    // curswantY should be near the top (title midpoint), not card center
    expect(curswantY).toBeLessThan(10) // Title midpoint ~4-5

    // Navigation to both columns should land on first card (index 0)
    // because curswantY is near the top where all first cards start
    const col1Result = registry.findItemAtY(1, curswantY)
    const col2Result = registry.findItemAtY(2, curswantY)

    expect(col1Result).toBe(0) // Should land on first card
    expect(col2Result).toBe(0) // Should land on first card
  })
})
