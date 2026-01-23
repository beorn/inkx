/**
 * Board State Tests (Fast, No Database)
 *
 * Pure state and logic tests that don't need database access.
 * These tests use inline state and fixtures for fast, parallelizable execution.
 */

import { describe, test, expect } from "bun:test";

import {
  createEmptyState,
  handleSearchKey,
  handleKey,
  getCurrentCard,
  getCurrentColumn,
} from "../src/state.ts";

import {
  createSimpleTestBoard,
  createCardState,
  createColumnState,
  createBoardState,
  createTestKNode,
} from "./fixtures/board-fixtures.ts";

// =============================================================================
// Empty State
// =============================================================================

describe("createEmptyState", () => {
  test("returns valid empty state", () => {
    const state = createEmptyState();
    expect(state.rootId).toBeNull();
    expect(state.columns).toHaveLength(0);
    expect(state.colIndex).toBe(0);
    expect(state.cardIndex).toBe(0);
    expect(state.selectedCards.size).toBe(0);
    expect(state.visualMode).toBe(false);
    expect(state.searchMode).toBe(false);
    expect(state.helpMode).toBe(false);
  });
});

// =============================================================================
// Board Search (handleSearchKey)
// =============================================================================

describe("Board Search", () => {
  test("handleSearchKey adds characters", () => {
    const state = createEmptyState();
    state.searchMode = true;

    const r1 = handleSearchKey(state, "t");
    expect(r1.state.searchQuery).toBe("t");

    const r2 = handleSearchKey(r1.state, "e");
    expect(r2.state.searchQuery).toBe("te");

    const r3 = handleSearchKey(r2.state, "s");
    expect(r3.state.searchQuery).toBe("tes");
  });

  test("handleSearchKey backspace removes character", () => {
    const state = createEmptyState();
    state.searchMode = true;
    state.searchQuery = "test";

    const result = handleSearchKey(state, "\x7F");
    expect(result.state.searchQuery).toBe("tes");
  });

  test("handleSearchKey enter exits search", () => {
    const state = createEmptyState();
    state.searchMode = true;
    state.searchQuery = "test";

    const result = handleSearchKey(state, "\r");
    expect(result.exitSearch).toBe(true);
    expect(result.state.searchMode).toBe(false);
  });

  test("handleSearchKey escape exits search", () => {
    const state = createEmptyState();
    state.searchMode = true;

    const result = handleSearchKey(state, "\x1B");
    expect(result.exitSearch).toBe(true);
  });

  test("handleSearchKey enter with no matches returns createTask (NV-style)", () => {
    const state = createEmptyState();
    state.searchMode = true;
    state.searchQuery = "new task content";
    // No columns/cards, so no matches exist

    const result = handleSearchKey(state, "\r");
    expect(result.exitSearch).toBe(true);
    expect(result.createTask).toBe("new task content");
  });

  test("handleSearchKey enter with matches does not return createTask", () => {
    const state = createEmptyState();
    state.searchMode = true;
    state.searchQuery = "task";

    // Add a column with a matching card using fixtures
    const card = createCardState({
      content: "Matching task here",
      type: "task",
    });
    const col = createColumnState({ content: "Todo" }, [card]);
    state.columns = [col];

    const result = handleSearchKey(state, "\r");
    expect(result.exitSearch).toBe(true);
    expect(result.createTask).toBeUndefined();
  });
});

// =============================================================================
// Key Handling with Inline State
// =============================================================================

describe("Board Key Handling (Pure State)", () => {
  test("h key moves left", () => {
    const { state } = createSimpleTestBoard();
    state.colIndex = 1;
    const result = handleKey(state, "h");
    expect(result.state.colIndex).toBe(0);
    expect(result.action).toBeNull();
  });

  test("l key moves right", () => {
    const { state } = createSimpleTestBoard();
    const result = handleKey(state, "l");
    expect(result.state.colIndex).toBe(1);
    expect(result.action).toBeNull();
  });

  test("j key moves down", () => {
    const { state } = createSimpleTestBoard();
    const result = handleKey(state, "j");
    expect(result.state.cardIndex).toBe(1);
    expect(result.action).toBeNull();
  });

  test("k key moves up", () => {
    const { state } = createSimpleTestBoard();
    state.cardIndex = 1;
    const result = handleKey(state, "k");
    expect(result.state.cardIndex).toBe(0);
    expect(result.action).toBeNull();
  });

  test("g jumps to first card", () => {
    const { state } = createSimpleTestBoard();
    state.cardIndex = 1;
    const result = handleKey(state, "g");
    expect(result.state.cardIndex).toBe(0);
  });

  test("G jumps to last card", () => {
    const { state } = createSimpleTestBoard();
    const result = handleKey(state, "G");
    expect(result.state.cardIndex).toBe(1); // Column 1 has 2 cards
  });

  test("q returns quit action", () => {
    const { state } = createSimpleTestBoard();
    const result = handleKey(state, "q");
    expect(result.action).toBe("quit");
  });

  test("? enables help mode", () => {
    const { state } = createSimpleTestBoard();
    const result = handleKey(state, "?");
    expect(result.state.helpMode).toBe(true);
  });

  test("/ enables search mode", () => {
    const { state } = createSimpleTestBoard();
    const result = handleKey(state, "/");
    expect(result.state.searchMode).toBe(true);
    expect(result.state.searchQuery).toBe("");
  });

  test("v toggles visual mode", () => {
    const { state } = createSimpleTestBoard();
    const result1 = handleKey(state, "v");
    expect(result1.state.visualMode).toBe(true);
    expect(result1.state.selectedCards.size).toBe(1);

    const result2 = handleKey(result1.state, "v");
    expect(result2.state.visualMode).toBe(false);
    expect(result2.state.selectedCards.size).toBe(0);
  });

  test("space toggles selection", () => {
    const { state } = createSimpleTestBoard();
    const result1 = handleKey(state, " ");
    expect(result1.state.selectedCards.size).toBe(1);

    const result2 = handleKey(result1.state, " ");
    expect(result2.state.selectedCards.size).toBe(0);
  });

  test("Tab toggles fold", () => {
    const { state } = createSimpleTestBoard();
    const card = getCurrentCard(state)!;

    const result1 = handleKey(state, "\t");
    expect(result1.state.foldedCards.has(card.node.id)).toBe(true);

    const result2 = handleKey(result1.state, "\t");
    expect(result2.state.foldedCards.has(card.node.id)).toBe(false);
  });
});

// =============================================================================
// getCurrentCard / getCurrentColumn with Inline State
// =============================================================================

describe("Current Card/Column Selectors", () => {
  test("getCurrentCard returns current card", () => {
    const { state, nodeIds } = createSimpleTestBoard();
    const card = getCurrentCard(state);

    expect(card).not.toBeNull();
    expect(card!.node.id).toBe(nodeIds.card1);
  });

  test("getCurrentCard returns null for empty state", () => {
    const state = createEmptyState();
    const card = getCurrentCard(state);
    expect(card).toBeNull();
  });

  test("getCurrentColumn returns current column", () => {
    const { state, nodeIds } = createSimpleTestBoard();
    const col = getCurrentColumn(state);

    expect(col).not.toBeNull();
    expect(col!.node.id).toBe(nodeIds.col1);
  });

  test("getCurrentColumn returns null for empty state", () => {
    const state = createEmptyState();
    const col = getCurrentColumn(state);
    expect(col).toBeNull();
  });

  test("getCurrentCard respects cardIndex", () => {
    const { state, nodeIds } = createSimpleTestBoard();
    state.cardIndex = 1;
    const card = getCurrentCard(state);

    expect(card).not.toBeNull();
    expect(card!.node.id).toBe(nodeIds.card2);
  });

  test("getCurrentColumn respects colIndex", () => {
    const { state, nodeIds } = createSimpleTestBoard();
    state.colIndex = 1;
    const col = getCurrentColumn(state);

    expect(col).not.toBeNull();
    expect(col!.node.id).toBe(nodeIds.col2);
  });
});

// =============================================================================
// Zoom Navigation with Inline State
// =============================================================================

describe("Zoom Navigation (Pure State)", () => {
  test("Escape quits when zoom stack is empty", () => {
    const { state } = createSimpleTestBoard();
    state.zoomStack = [];

    const result = handleKey(state, "\x1B");
    expect(result.action).toBe("quit");
  });

  test("Escape pops zoom stack when not empty", () => {
    const { state, nodeIds } = createSimpleTestBoard();
    const parentId = "parent-root-id";
    state.zoomStack = [parentId];

    const result = handleKey(state, "\x1B");

    expect(result.action).toBeNull();
    expect(result.state.rootId).toBe(parentId);
    expect(result.state.zoomStack).toHaveLength(0);
  });
});
