/**
 * Elaborate Board Move Tests
 *
 * Tests for node moving via board TUI including:
 * - Move card between columns (H/L keys)
 * - Move card within column (K/J keys)
 * - Multi-card selection moves
 * - State verification after moves
 *
 * NOTE: Event persistence tests (events.jsonl) have been removed from this file.
 * Those are integration tests that require disk access and belong in e2e tests.
 */

import { describe, it, expect } from "bun:test";
import { createTestRenderer } from "inkx/testing";

const render = createTestRenderer();
import React from "react";

import { InkBoardTestable } from "../src/views/Board.tsx";
import { handleKey, getCurrentCard } from "../src/state.ts";
import { createFakeVault } from "@km/storage";
import type { FakeVault } from "@km/storage";
import type { KNode } from "@km/core";
import type { BoardState, ColumnState, CardState } from "../src/types.ts";
import { ulid } from "ulid";

/**
 * Create a KNode for tests
 */
function createNode(
  type: KNode["type"],
  content: string,
  parentId: string | null,
  parentIdx: number,
  extra: Partial<KNode> = {},
): KNode {
  return {
    id: extra.id ?? ulid(),
    type,
    content,
    parent_id: parentId,
    parent_idx: parentIdx,
    data: extra.data ?? {},
    link_to: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "test",
    ...extra,
  };
}

/**
 * Create a BoardState from a FakeVault's nodes
 * This builds state manually without needing rawQuery
 */
function buildStateFromVault(vault: FakeVault, rootId: string): BoardState {
  const columns: ColumnState[] = [];
  const columnNodes = vault.getChildren(rootId);

  for (const colNode of columnNodes) {
    const cardNodes = vault.getChildren(colNode.id);
    const cards: CardState[] = cardNodes.map((cardNode) => ({
      node: cardNode,
      children: vault.getChildren(cardNode.id),
      childCount: vault.getChildren(cardNode.id).length,
    }));
    columns.push({ node: colNode, cards });
  }

  return {
    rootId,
    rootPath: null,
    columns,
    colIndex: 0,
    cardIndex: 0,
    selectedCards: new Set(),
    visualMode: false,
    foldedCards: new Set(),
    collapsedColumns: new Set(),
    searchQuery: "",
    searchMode: false,
    helpMode: false,
    zoomStack: [],
  };
}

/**
 * Create a standard test board with 3 columns and 4 cards
 */
function createStandardBoard(): {
  vault: FakeVault;
  rootId: string;
  col1Id: string;
  col2Id: string;
  col3Id: string;
  card1Id: string;
  card2Id: string;
  card3Id: string;
  card4Id: string;
} {
  const rootId = ulid();
  const col1Id = ulid();
  const col2Id = ulid();
  const col3Id = ulid();
  const card1Id = ulid();
  const card2Id = ulid();
  const card3Id = ulid();
  const card4Id = ulid();

  const vault = createFakeVault({
    nodes: [
      createNode("board", "Test Board", null, 0, { id: rootId }),
      createNode("folder", "Todo", rootId, 0, { id: col1Id }),
      createNode("folder", "InProgress", rootId, 1, { id: col2Id }),
      createNode("folder", "Done", rootId, 2, { id: col3Id }),
      createNode("task", "Task 1", col1Id, 0, { id: card1Id }),
      createNode("task", "Task 2", col1Id, 1, { id: card2Id }),
      createNode("task", "Task 3", col2Id, 0, { id: card3Id }),
      createNode("task", "Task 4", col3Id, 0, { id: card4Id }),
    ],
  });

  return {
    vault,
    rootId,
    col1Id,
    col2Id,
    col3Id,
    card1Id,
    card2Id,
    card3Id,
    card4Id,
  };
}

describe("Board Move - State Changes", () => {
  it("state reflects move after L key press", () => {
    const { vault, rootId, card1Id, col2Id } = createStandardBoard();
    const state = buildStateFromVault(vault, rootId);

    // Verify initial state
    let node = vault.getNode(card1Id);
    expect(node?.parent_id).not.toBe(col2Id);

    // Build state and move
    handleKey(vault, state, "L");

    // Verify node was moved in vault
    node = vault.getNode(card1Id);
    expect(node?.parent_id).toBe(col2Id);
  });

  it("moves card up within column (K key)", () => {
    const { vault, rootId, card2Id, col1Id } = createStandardBoard();
    const state = buildStateFromVault(vault, rootId);

    // Start at second card
    state.cardIndex = 1;
    expect(getCurrentCard(state)?.node.id).toBe(card2Id);

    // Move up with K
    const result = handleKey(vault, state, "K");
    expect(result.action).toBe("refresh");

    // Verify card moved (parent_idx should be less than before)
    const node = vault.getNode(card2Id);
    expect(node?.parent_id).toBe(col1Id);
    expect(node?.parent_idx).toBeLessThan(0); // Should be before first card
  });

  it("moves card down within column (J key)", () => {
    const { vault, rootId, card1Id, col1Id } = createStandardBoard();
    const state = buildStateFromVault(vault, rootId);

    expect(getCurrentCard(state)?.node.id).toBe(card1Id);

    // Move down with J
    const result = handleKey(vault, state, "J");
    expect(result.action).toBe("refresh");

    // Verify card moved (parent_idx should be greater)
    const node = vault.getNode(card1Id);
    expect(node?.parent_id).toBe(col1Id);
    expect(node?.parent_idx).toBeGreaterThan(1); // Should be after second card
  });

  it("moves card to previous column (H key)", () => {
    const { vault, rootId, card3Id, col1Id, col2Id } = createStandardBoard();
    const state = buildStateFromVault(vault, rootId);

    // Start in second column
    state.colIndex = 1;
    expect(getCurrentCard(state)?.node.id).toBe(card3Id);
    expect(getCurrentCard(state)?.node.parent_id).toBe(col2Id);

    // Move left with H
    const result = handleKey(vault, state, "H");
    expect(result.action).toBe("refresh");

    // Verify card moved to first column
    const node = vault.getNode(card3Id);
    expect(node?.parent_id).toBe(col1Id);
  });

  it("handles moving to empty column", () => {
    const rootId = ulid();
    const col1Id = ulid();
    const col2Id = ulid();
    const cardId = ulid();

    const vault = createFakeVault({
      nodes: [
        createNode("board", "Test Board", null, 0, { id: rootId }),
        createNode("folder", "Full", rootId, 0, { id: col1Id }),
        createNode("folder", "Empty", rootId, 1, { id: col2Id }),
        createNode("task", "Only Card", col1Id, 0, { id: cardId }),
      ],
    });

    const state = buildStateFromVault(vault, rootId);
    expect(getCurrentCard(state)?.node.id).toBe(cardId);

    // Move to empty column
    const result = handleKey(vault, state, "L");
    expect(result.action).toBe("refresh");

    const node = vault.getNode(cardId);
    expect(node?.parent_id).toBe(col2Id);
    expect(node?.parent_idx).toBe(0); // First card in empty column
  });

  it("prevents move at boundary (first column, H key)", () => {
    const { vault, rootId, card1Id, col1Id } = createStandardBoard();
    const state = buildStateFromVault(vault, rootId);

    expect(state.colIndex).toBe(0); // Already at first column

    // Try to move left - should not trigger action
    const result = handleKey(vault, state, "H");
    expect(result.action).toBeNull();

    // Card should not have moved
    const node = vault.getNode(card1Id);
    expect(node?.parent_id).toBe(col1Id);
  });

  it("prevents move at boundary (last column, L key)", () => {
    const { vault, rootId, card4Id, col3Id } = createStandardBoard();
    const state = buildStateFromVault(vault, rootId);

    // Move to last column
    state.colIndex = 2;
    expect(getCurrentCard(state)?.node.id).toBe(card4Id);

    // Try to move right - should not trigger action
    const result = handleKey(vault, state, "L");
    expect(result.action).toBeNull();

    // Card should not have moved
    const node = vault.getNode(card4Id);
    expect(node?.parent_id).toBe(col3Id);
  });

  it("prevents move up at first position (K key)", () => {
    const { vault, rootId, card1Id, col1Id } = createStandardBoard();
    const state = buildStateFromVault(vault, rootId);

    expect(state.cardIndex).toBe(0); // Already at first card

    // Try to move up - should not trigger action
    const result = handleKey(vault, state, "K");
    expect(result.action).toBeNull();

    // Card should not have moved
    const node = vault.getNode(card1Id);
    expect(node?.parent_id).toBe(col1Id);
  });

  it("handles fractional index calculations correctly", () => {
    const rootId = ulid();
    const colId = ulid();
    const cardAId = ulid();
    const cardBId = ulid();
    const cardCId = ulid();

    const vault = createFakeVault({
      nodes: [
        createNode("board", "Test Board", null, 0, { id: rootId }),
        createNode("folder", "Column", rootId, 0, { id: colId }),
        createNode("task", "Card A", colId, 0, { id: cardAId }),
        createNode("task", "Card B", colId, 10, { id: cardBId }),
        createNode("task", "Card C", colId, 20, { id: cardCId }),
      ],
    });

    // Move card C between A and B
    const state = buildStateFromVault(vault, rootId);
    state.cardIndex = 2; // Select Card C

    // Move up once to get between A and B
    handleKey(vault, state, "K"); // C moves before B
    const nodeAfterFirst = vault.getNode(cardCId);
    expect(nodeAfterFirst?.parent_idx).toBeGreaterThan(0);
    expect(nodeAfterFirst?.parent_idx).toBeLessThan(10);
  });
});

describe("Board Move - TUI Rendering", () => {
  it("renders board with columns and cards", () => {
    const rootId = ulid();
    const col1Id = ulid();
    const cardId = ulid();

    const vault = createFakeVault({
      nodes: [
        createNode("board", "Board", null, 0, { id: rootId }),
        createNode("folder", "Column", rootId, 0, { id: col1Id }),
        createNode("task", "Test Card", col1Id, 0, { id: cardId }),
      ],
    });

    const state = buildStateFromVault(vault, rootId);

    const { lastFrame } = render(
      React.createElement(InkBoardTestable, {
        initialState: state,
        testWidth: 80,
        testHeight: 24,
        vault,
      }),
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Column");
    expect(frame).toContain("Test Card");
  });

  it("updates TUI state after move", () => {
    const rootId = ulid();
    const col1Id = ulid();
    const col2Id = ulid();
    const cardId = ulid();

    const vault = createFakeVault({
      nodes: [
        createNode("board", "Board", null, 0, { id: rootId }),
        createNode("folder", "Source", rootId, 0, { id: col1Id }),
        createNode("folder", "Target", rootId, 1, { id: col2Id }),
        createNode("task", "Moving Card", col1Id, 0, { id: cardId }),
      ],
    });

    // Build initial state
    let state = buildStateFromVault(vault, rootId);
    expect(state.columns[0]?.cards.length).toBe(1);
    expect(state.columns[1]?.cards.length).toBe(0);

    // Move card right
    handleKey(vault, state, "L");

    // Rebuild state to see changes
    state = buildStateFromVault(vault, rootId);
    expect(state.columns[0]?.cards.length).toBe(0);
    expect(state.columns[1]?.cards.length).toBe(1);
  });
});

describe("Board Move - Multi-card Selection", () => {
  it("moves multiple selected cards with x (status cycle)", () => {
    const { vault, rootId, card1Id, card2Id } = createStandardBoard();
    const state = buildStateFromVault(vault, rootId);

    // Select multiple cards
    state.selectedCards.add(card1Id);
    state.selectedCards.add(card2Id);

    // Cycle status for all selected
    handleKey(vault, state, "x");

    // Both should have changed status (todo → wip in the cycle)
    const node1 = vault.getNode(card1Id);
    const node2 = vault.getNode(card2Id);
    expect(node1?.task_status).toBe("wip");
    expect(node2?.task_status).toBe("wip");
  });
});

describe("Board Move - Edge Cases", () => {
  it("handles board with single column", () => {
    const rootId = ulid();
    const colId = ulid();
    const cardId = ulid();

    const vault = createFakeVault({
      nodes: [
        createNode("board", "Board", null, 0, { id: rootId }),
        createNode("folder", "Only Column", rootId, 0, { id: colId }),
        createNode("task", "Card", colId, 0, { id: cardId }),
      ],
    });

    const state = buildStateFromVault(vault, rootId);

    // Try to move left - should not work
    let result = handleKey(vault, state, "H");
    expect(result.action).toBeNull();

    // Try to move right - should not work
    result = handleKey(vault, state, "L");
    expect(result.action).toBeNull();

    // Card should still be in same column
    const node = vault.getNode(cardId);
    expect(node?.parent_id).toBe(colId);
  });

  it("handles column with single card", () => {
    const rootId = ulid();
    const colId = ulid();
    const cardId = ulid();

    const vault = createFakeVault({
      nodes: [
        createNode("board", "Board", null, 0, { id: rootId }),
        createNode("folder", "Column", rootId, 0, { id: colId }),
        createNode("task", "Only Card", colId, 0, { id: cardId }),
      ],
    });

    const state = buildStateFromVault(vault, rootId);

    // Try to move up - should not work (already first)
    let result = handleKey(vault, state, "K");
    expect(result.action).toBeNull();

    // Try to move down - should not work (already last)
    result = handleKey(vault, state, "J");
    expect(result.action).toBeNull();
  });

  it("handles empty column navigation", () => {
    const rootId = ulid();
    const col1Id = ulid();
    const col2Id = ulid();
    const cardId = ulid();

    const vault = createFakeVault({
      nodes: [
        createNode("board", "Board", null, 0, { id: rootId }),
        createNode("folder", "Empty", rootId, 0, { id: col1Id }),
        createNode("folder", "Full", rootId, 1, { id: col2Id }),
        createNode("task", "Card", col2Id, 0, { id: cardId }),
      ],
    });

    const state = buildStateFromVault(vault, rootId);
    expect(state.columns[0]?.cards.length).toBe(0);
    expect(state.columns[1]?.cards.length).toBe(1);

    // Navigate to empty column
    handleKey(vault, state, "h"); // Should not crash

    // No card to move in empty column
    const result = handleKey(vault, state, "L");
    expect(result.action).toBeNull();
  });

  it("preserves card order after multiple moves", () => {
    const rootId = ulid();
    const colId = ulid();
    const cardAId = ulid();
    const cardBId = ulid();
    const cardCId = ulid();
    const cardDId = ulid();

    const vault = createFakeVault({
      nodes: [
        createNode("board", "Board", null, 0, { id: rootId }),
        createNode("folder", "Column", rootId, 0, { id: colId }),
        createNode("task", "A", colId, 0, { id: cardAId }),
        createNode("task", "B", colId, 1, { id: cardBId }),
        createNode("task", "C", colId, 2, { id: cardCId }),
        createNode("task", "D", colId, 3, { id: cardDId }),
      ],
    });

    // Move D up one position - state must be rebuilt after each move
    let state = buildStateFromVault(vault, rootId);
    state.cardIndex = 3; // Select D
    handleKey(vault, state, "K"); // D moves before C

    // Rebuild state after move (simulating "refresh" action)
    state = buildStateFromVault(vault, rootId);
    // Find D's new position
    const col = state.columns[0];
    if (col) {
      state.cardIndex = col.cards.findIndex((c) => c.node.id === cardDId);
    }
    handleKey(vault, state, "K"); // D moves before B

    state = buildStateFromVault(vault, rootId);
    const col2 = state.columns[0];
    if (col2) {
      state.cardIndex = col2.cards.findIndex((c) => c.node.id === cardDId);
    }
    handleKey(vault, state, "K"); // D moves before A

    // Rebuild and verify order
    state = buildStateFromVault(vault, rootId);

    // Get indices - D should now be first
    const nodeA = vault.getNode(cardAId);
    const nodeD = vault.getNode(cardDId);

    // D should now be before A (at position 0)
    expect(nodeD!.parent_idx).toBeLessThan(nodeA!.parent_idx);

    // Verify the visual order in state matches
    const finalCol = state.columns[0];
    expect(finalCol).toBeDefined();
    expect(finalCol!.cards[0]?.node.id).toBe(cardDId);
    expect(finalCol!.cards[1]?.node.id).toBe(cardAId);
  });
});
