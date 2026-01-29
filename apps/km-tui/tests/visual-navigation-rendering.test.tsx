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
import React from "react"
import { createTestRenderer } from "inkx/testing"
import { Board } from "../src/views/Board.tsx"
import { RepoProvider } from "../src/repo-context.tsx"
import { createLayoutRegistry } from "../src/card-positions.ts"
import { createFakeRepo } from "@km/storage"
import type { TUIBoardState } from "../src/types.ts"
import { item } from "./helpers/board-test.ts"

const render = createTestRenderer({ columns: 80, rows: 24 })

// Helper to create a minimal TUIBoardState (columns are derived from repo now)
// Note: colIndex/cardIndex are now in ColumnsLayout, not TUIBoardState
function makeTUIBoardState(rootId: string): TUIBoardState {
  return {
    rootId,
    rootPath: null,
    columns: [], // Derived from repo
    selectedCards: new Set(),
    foldedCards: new Set(),
    visualMode: false,
    helpMode: false,
    searchMode: false,
    searchQuery: "",
    collapsedColumns: new Set(),
  }
}

describe("Visual navigation integration: card position registration", () => {
  test("cards in single column register with increasing Y positions", () => {
    const registry = createLayoutRegistry()

    // Create repo with nodes: board -> column -> cards
    const nodes = item(
      "board",
      item("col1", item("1a"), item("1b"), item("1c")),
    )
    const repo = createFakeRepo({ nodes })

    const state = makeTUIBoardState("board")

    const app = render(
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

    // Verify render contains the tasks
    expect(app.text).toContain("1a")
    expect(app.text).toContain("1b")
    expect(app.text).toContain("1c")

    // Verify cards registered their positions
    expect(registry.hasCardsInColumn(0)).toBe(true)

    // Get positions and verify they have increasing Y values
    const card1 = registry.getCard(0, 0)
    const card2 = registry.getCard(0, 1)
    const card3 = registry.getCard(0, 2)

    expect(card1.layout.y).toBeLessThan(card2.layout.y)
    expect(card2.layout.y).toBeLessThan(card3.layout.y)
  })

  test("cards in same row across columns have same Y position", () => {
    const registry = createLayoutRegistry()

    // Create repo with two columns, each with cards
    const nodes = item(
      "board",
      item("col1", item("1a"), item("1b")),
      item("col2", item("2a"), item("2b")),
    )
    const repo = createFakeRepo({ nodes })

    const state = makeTUIBoardState("board")

    render(
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

    // Both columns should have cards registered
    expect(registry.hasCardsInColumn(0)).toBe(true)
    expect(registry.hasCardsInColumn(1)).toBe(true)

    // First cards in each column should have similar Y positions
    const cardA1 = registry.getCard(0, 0)
    const cardB1 = registry.getCard(1, 0)

    // Cards at same position in different columns should have same Y
    // (within a small tolerance for borders)
    expect(Math.abs(cardA1.layout.y - cardB1.layout.y)).toBeLessThanOrEqual(1)
  })

  test("findCardAtYVisual returns correct card index", () => {
    const registry = createLayoutRegistry()

    // Create repo with two columns with different card counts
    const nodes = item(
      "board",
      item("col1", item("1a"), item("1b"), item("1c")),
      item("col2", item("2a"), item("2b")),
    )
    const repo = createFakeRepo({ nodes })

    const state = makeTUIBoardState("board")

    render(
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

    // Get the Y position of 1b (card at index 1 in col1)
    const cardA2 = registry.getCard(0, 1)
    const targetY = cardA2.layout.y + cardA2.layout.cardHeight / 2

    // Find the card at that Y in column 1
    const foundIdx = registry.findCardAtYVisual(1, targetY)

    // Should find 2b (index 1) since it's at similar Y to 1b
    expect(foundIdx).toBe(1)
  })
})
