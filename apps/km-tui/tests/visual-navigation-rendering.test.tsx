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

import { describe, test, expect } from "bun:test"
import React from "react"
import { createTestRenderer } from "inkx/testing"
import { Board } from "../src/views/Board.tsx"
import { RepoProvider } from "../src/repo-context.tsx"
import { createLayoutRegistry } from "../src/card-positions.ts"
import { createFakeRepo } from "@km/storage"
import type { TUIBoardState } from "../src/types.ts"
import type { KNode } from "@km/core"

const render = createTestRenderer({ columns: 80, rows: 24 })

// Helper to create a fake node
function makeNode(
  id: string,
  content: string,
  type: KNode["type"] = "task",
  parentId: string | null = null,
  parentIdx: number = 0,
): KNode {
  return {
    id,
    type,
    parent_id: parentId,
    parent_idx: parentIdx,
    link_to: null,
    content,
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
}

// Helper to create a minimal TUIBoardState (columns are derived from repo now)
function makeTUIBoardState(rootId: string): TUIBoardState {
  return {
    rootId,
    rootPath: null,
    columns: [], // Derived from repo
    colIndex: 0,
    cardIndex: 0,
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

    // Create repo with nodes: root -> column -> cards
    const repo = createFakeRepo({
      nodes: [
        makeNode("root", "Root", "section"),
        makeNode("col-1", "Column 1", "section", "root", 0),
        makeNode("card-1", "Task 1", "task", "col-1", 0),
        makeNode("card-2", "Task 2", "task", "col-1", 1),
        makeNode("card-3", "Task 3", "task", "col-1", 2),
      ],
    })

    const state = makeTUIBoardState("root")

    const { lastFrameText } = render(
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
    const text = lastFrameText()!
    expect(text).toContain("Task 1")
    expect(text).toContain("Task 2")
    expect(text).toContain("Task 3")

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
    const repo = createFakeRepo({
      nodes: [
        makeNode("root", "Root", "section"),
        makeNode("col-1", "Column 1", "section", "root", 0),
        makeNode("card-a1", "Task A1", "task", "col-1", 0),
        makeNode("card-a2", "Task A2", "task", "col-1", 1),
        makeNode("col-2", "Column 2", "section", "root", 1),
        makeNode("card-b1", "Task B1", "task", "col-2", 0),
        makeNode("card-b2", "Task B2", "task", "col-2", 1),
      ],
    })

    const state = makeTUIBoardState("root")

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
    const repo = createFakeRepo({
      nodes: [
        makeNode("root", "Root", "section"),
        makeNode("col-1", "Column 1", "section", "root", 0),
        makeNode("card-a1", "Task A1", "task", "col-1", 0),
        makeNode("card-a2", "Task A2", "task", "col-1", 1),
        makeNode("card-a3", "Task A3", "task", "col-1", 2),
        makeNode("col-2", "Column 2", "section", "root", 1),
        makeNode("card-b1", "Task B1", "task", "col-2", 0),
        makeNode("card-b2", "Task B2", "task", "col-2", 1),
      ],
    })

    const state = makeTUIBoardState("root")

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

    // Get the Y position of card-a2
    const cardA2 = registry.getCard(0, 1)
    const targetY = cardA2.layout.y + cardA2.layout.cardHeight / 2

    // Find the card at that Y in column 1
    const foundIdx = registry.findCardAtYVisual(1, targetY)

    // Should find card-b2 (index 1) since it's at similar Y to card-a2
    expect(foundIdx).toBe(1)
  })
})
