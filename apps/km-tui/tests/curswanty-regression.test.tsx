/**
 * Regression test for curswantY calculation
 *
 * Bug: HeadRow used useContentRectCallback which reads parent's NodeContext,
 * causing headHeight to equal full card height instead of title row height.
 *
 * Fix: Use Box's onLayout prop which correctly measures the HeadRow's own dimensions.
 *
 * @see docs/ref/ui.md#curswanty-cross-column-navigation-hl
 * @see apps/km-tui/src/card-positions.ts - getCardMidY()
 */
import { test, expect, describe } from "vitest"
import React from "react"
import { createTestRenderer } from "inkx/testing"
import { Board } from "../src/views/Board.tsx"
import { RepoProvider } from "../src/repo-context.tsx"
import { createLayoutRegistry, getCardMidY } from "../src/card-positions.ts"
import { createFakeRepo } from "@km/storage"
import { ensureCommandSystemInitialized } from "../src/command-bridge.ts"
import type { TUIBoardState } from "../src/types.ts"
import { item } from "./helpers/board-test.ts"

// Module-level renderers (created once, reused across tests via auto-cleanup)
const render80 = createTestRenderer({ columns: 80, rows: 24 })
const render120 = createTestRenderer({ columns: 120, rows: 40 })

function makeTUIBoardState(rootId: string): TUIBoardState {
  return {
    rootId,
    rootPath: null,
    columns: [],
    selectedCards: new Set(),
    foldedCards: new Set(),
    visualMode: false,
    helpMode: false,
    searchMode: false,
    searchQuery: "",
    collapsedColumns: new Set(),
  }
}

describe("curswantY regression", () => {
  test("headHeight should be 1 (title row), not full card height", () => {
    // Bug: headHeight was equal to cardHeight because useContentRectCallback
    // read the parent's NodeContext, not HeadRow's own Box
    const registry = createLayoutRegistry()

    // Create board with cards that have children (making them tall)
    const nodes = item(
      "board",
      item(
        "col0",
        item("card0", item("child1"), item("child2"), item("child3")),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const state = makeTUIBoardState("board")

    ensureCommandSystemInitialized()

    render80(
      <RepoProvider repo={repo}>
        <Board
          initialState={state}
          initialViewMode="cards"
          dimensions={{ columns: 80, rows: 24 }}
          onExit={() => {}}
          layoutRegistry={registry}
        />
      </RepoProvider>,
    )

    const card = registry.getCard(0, 0)
    expect(card).toBeDefined()

    // Key assertion: headHeight should be 1 (title row), not cardHeight
    expect(card.layout.headHeight).toBe(1)
    expect(card.layout.cardHeight).toBeGreaterThan(1) // Card is tall due to children
    expect(card.layout.headHeight).not.toBe(card.layout.cardHeight)
  })

  test("h/l navigation uses title midpoint, lands on closest card midpoint", () => {
    // Regression: navigation from tall card should use title midpoint (~4.5),
    // not card center (much lower), so it lands on first card in target column
    const registry = createLayoutRegistry()

    // Create board with:
    // - Column 0: tall card with children
    // - Column 1: tall card first, then short card
    // - Column 2: short card first, then tall card
    const nodes = item(
      "board",
      item(
        "col0",
        item("tall0", item("c1"), item("c2"), item("c3"), item("c4")),
      ),
      item(
        "col1",
        item("tall1", item("cA"), item("cB"), item("cC")),
        item("short1"),
      ),
      item(
        "col2",
        item("short2"),
        item("tall2", item("cX"), item("cY"), item("cZ")),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const state = makeTUIBoardState("board")

    ensureCommandSystemInitialized()

    render120(
      <RepoProvider repo={repo}>
        <Board
          initialState={state}
          initialViewMode="cards"
          dimensions={{ columns: 120, rows: 40 }}
          onExit={() => {}}
          layoutRegistry={registry}
        />
      </RepoProvider>,
    )

    // Get curswantY from first card's title midpoint
    const firstCard = registry.getCard(0, 0)
    expect(firstCard).toBeDefined()
    const curswantY = getCardMidY(firstCard.layout)

    // curswantY should be near the top (title midpoint), not card center
    expect(curswantY).toBeLessThan(10) // Title midpoint ~4-5

    // Navigation to both columns should land on first card (index 0)
    // because curswantY is near the top where all first cards start
    const col1Result = registry.findCardAtYVisual(1, curswantY)
    const col2Result = registry.findCardAtYVisual(2, curswantY)

    expect(col1Result).toBe(0) // Should land on first card
    expect(col2Result).toBe(0) // Should land on first card
  })
})
