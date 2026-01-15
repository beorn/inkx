/**
 * boardReducer Tests
 *
 * Unit tests for the pure board state reducer.
 */

import { describe, test, expect } from "bun:test";
import {
  boardReducer,
  createInitialBoardState,
  type ColumnState,
} from "../src/index.ts";

function createTestColumns(): ColumnState[] {
  return [
    {
      nodeId: "col1",
      title: "Column 1",
      cards: [
        { nodeId: "card1", title: "Card 1", childCount: 0, isTask: false },
        {
          nodeId: "card2",
          title: "Card 2",
          childCount: 2,
          isTask: true,
          taskStatus: "todo",
        },
        { nodeId: "card3", title: "Card 3", childCount: 0, isTask: false },
      ],
    },
    {
      nodeId: "col2",
      title: "Column 2",
      wipLimit: 3,
      cards: [
        {
          nodeId: "card4",
          title: "Card 4",
          childCount: 1,
          isTask: true,
          taskStatus: "wip",
        },
        { nodeId: "card5", title: "Card 5", childCount: 0, isTask: false },
      ],
    },
  ];
}

describe("boardReducer", () => {
  describe("MOVE_DOWN", () => {
    test("increases cardIndex when not at bottom", () => {
      const state = createInitialBoardState(createTestColumns());
      const next = boardReducer(state, { type: "MOVE_DOWN" });
      expect(next.cardIndex).toBe(1);
    });

    test("is no-op when at bottom of column", () => {
      const state = createInitialBoardState(createTestColumns());
      state.cardIndex = 2; // Last card in column 1
      const next = boardReducer(state, { type: "MOVE_DOWN" });
      expect(next.cardIndex).toBe(2); // Unchanged
    });

    test("is no-op when column is empty", () => {
      const columns: ColumnState[] = [
        { nodeId: "col1", title: "Empty", cards: [] },
      ];
      const state = createInitialBoardState(columns);
      const next = boardReducer(state, { type: "MOVE_DOWN" });
      expect(next.cardIndex).toBe(0);
    });
  });

  describe("MOVE_UP", () => {
    test("decreases cardIndex when not at top", () => {
      const state = createInitialBoardState(createTestColumns());
      state.cardIndex = 2;
      const next = boardReducer(state, { type: "MOVE_UP" });
      expect(next.cardIndex).toBe(1);
    });

    test("is no-op when at top", () => {
      const state = createInitialBoardState(createTestColumns());
      const next = boardReducer(state, { type: "MOVE_UP" });
      expect(next.cardIndex).toBe(0);
    });
  });

  describe("MOVE_LEFT", () => {
    test("decreases colIndex when not at leftmost", () => {
      const state = createInitialBoardState(createTestColumns());
      state.colIndex = 1;
      state.cardIndex = 1;
      const next = boardReducer(state, { type: "MOVE_LEFT" });
      expect(next.colIndex).toBe(0);
      expect(next.cardIndex).toBe(0); // Resets card index
    });

    test("is no-op when at leftmost column", () => {
      const state = createInitialBoardState(createTestColumns());
      const next = boardReducer(state, { type: "MOVE_LEFT" });
      expect(next.colIndex).toBe(0);
    });
  });

  describe("MOVE_RIGHT", () => {
    test("increases colIndex when not at rightmost", () => {
      const state = createInitialBoardState(createTestColumns());
      state.cardIndex = 2;
      const next = boardReducer(state, { type: "MOVE_RIGHT" });
      expect(next.colIndex).toBe(1);
      expect(next.cardIndex).toBe(0); // Resets card index
    });

    test("is no-op when at rightmost column", () => {
      const state = createInitialBoardState(createTestColumns());
      state.colIndex = 1;
      const next = boardReducer(state, { type: "MOVE_RIGHT" });
      expect(next.colIndex).toBe(1);
    });
  });

  describe("JUMP_TOP", () => {
    test("sets cardIndex to 0", () => {
      const state = createInitialBoardState(createTestColumns());
      state.cardIndex = 2;
      const next = boardReducer(state, { type: "JUMP_TOP" });
      expect(next.cardIndex).toBe(0);
    });
  });

  describe("JUMP_BOTTOM", () => {
    test("sets cardIndex to last card", () => {
      const state = createInitialBoardState(createTestColumns());
      const next = boardReducer(state, { type: "JUMP_BOTTOM" });
      expect(next.cardIndex).toBe(2); // Last card in column 1
    });

    test("is no-op when column is empty", () => {
      const columns: ColumnState[] = [
        { nodeId: "col1", title: "Empty", cards: [] },
      ];
      const state = createInitialBoardState(columns);
      const next = boardReducer(state, { type: "JUMP_BOTTOM" });
      expect(next.cardIndex).toBe(0);
    });
  });

  describe("SELECT_CARD", () => {
    test("sets both colIndex and cardIndex", () => {
      const state = createInitialBoardState(createTestColumns());
      const next = boardReducer(state, {
        type: "SELECT_CARD",
        col: 1,
        card: 1,
      });
      expect(next.colIndex).toBe(1);
      expect(next.cardIndex).toBe(1);
    });
  });

  describe("TOGGLE_FOLD", () => {
    test("adds card to foldedCards set", () => {
      const state = createInitialBoardState(createTestColumns());
      const next = boardReducer(state, {
        type: "TOGGLE_FOLD",
        cardId: "card1",
      });
      expect(next.foldedCards.has("card1")).toBe(true);
    });

    test("removes card from foldedCards set if already folded", () => {
      const state = createInitialBoardState(createTestColumns());
      state.foldedCards.add("card1");
      const next = boardReducer(state, {
        type: "TOGGLE_FOLD",
        cardId: "card1",
      });
      expect(next.foldedCards.has("card1")).toBe(false);
    });
  });

  describe("FOLD_COLUMN", () => {
    test("folds all cards in specified column", () => {
      const state = createInitialBoardState(createTestColumns());
      const next = boardReducer(state, {
        type: "FOLD_COLUMN",
        colIndex: 0,
      });
      // All cards in column 0 should be folded
      expect(next.foldedCards.has("card1")).toBe(true);
      expect(next.foldedCards.has("card2")).toBe(true);
      expect(next.foldedCards.has("card3")).toBe(true);
      // Cards in column 1 should not be affected
      expect(next.foldedCards.has("card4")).toBe(false);
      expect(next.foldedCards.has("card5")).toBe(false);
    });

    test("is no-op for invalid column index", () => {
      const state = createInitialBoardState(createTestColumns());
      const next = boardReducer(state, {
        type: "FOLD_COLUMN",
        colIndex: 99,
      });
      expect(next.foldedCards.size).toBe(0);
    });
  });

  describe("UNFOLD_COLUMN", () => {
    test("unfolds all cards in specified column", () => {
      const state = createInitialBoardState(createTestColumns());
      // Pre-fold some cards
      state.foldedCards.add("card1");
      state.foldedCards.add("card2");
      state.foldedCards.add("card3");
      state.foldedCards.add("card4"); // Card in column 1

      const next = boardReducer(state, {
        type: "UNFOLD_COLUMN",
        colIndex: 0,
      });
      // Cards in column 0 should be unfolded
      expect(next.foldedCards.has("card1")).toBe(false);
      expect(next.foldedCards.has("card2")).toBe(false);
      expect(next.foldedCards.has("card3")).toBe(false);
      // Card in column 1 should remain folded
      expect(next.foldedCards.has("card4")).toBe(true);
    });

    test("is no-op for invalid column index", () => {
      const state = createInitialBoardState(createTestColumns());
      state.foldedCards.add("card1");
      const next = boardReducer(state, {
        type: "UNFOLD_COLUMN",
        colIndex: 99,
      });
      // Should remain unchanged
      expect(next.foldedCards.has("card1")).toBe(true);
    });
  });

  describe("TOGGLE_COLLAPSE", () => {
    test("adds column to collapsedColumns set", () => {
      const state = createInitialBoardState(createTestColumns());
      const next = boardReducer(state, {
        type: "TOGGLE_COLLAPSE",
        colIndex: 0,
      });
      expect(next.collapsedColumns.has(0)).toBe(true);
    });

    test("removes column from collapsedColumns if already collapsed", () => {
      const state = createInitialBoardState(createTestColumns());
      state.collapsedColumns.add(0);
      const next = boardReducer(state, {
        type: "TOGGLE_COLLAPSE",
        colIndex: 0,
      });
      expect(next.collapsedColumns.has(0)).toBe(false);
    });
  });

  describe("SET_SEARCH_QUERY", () => {
    test("sets searchQuery", () => {
      const state = createInitialBoardState(createTestColumns());
      const next = boardReducer(state, {
        type: "SET_SEARCH_QUERY",
        query: "test",
      });
      expect(next.searchQuery).toBe("test");
    });
  });

  describe("TOGGLE_SEARCH_MODE", () => {
    test("enables search mode", () => {
      const state = createInitialBoardState(createTestColumns());
      const next = boardReducer(state, { type: "TOGGLE_SEARCH_MODE" });
      expect(next.searchMode).toBe(true);
    });

    test("disables search mode and clears query", () => {
      const state = createInitialBoardState(createTestColumns());
      state.searchMode = true;
      state.searchQuery = "test";
      const next = boardReducer(state, { type: "TOGGLE_SEARCH_MODE" });
      expect(next.searchMode).toBe(false);
      expect(next.searchQuery).toBe("");
    });
  });

  describe("TOGGLE_HELP_MODE", () => {
    test("toggles help mode", () => {
      const state = createInitialBoardState(createTestColumns());
      expect(state.helpMode).toBe(false);
      const next = boardReducer(state, { type: "TOGGLE_HELP_MODE" });
      expect(next.helpMode).toBe(true);
      const next2 = boardReducer(next, { type: "TOGGLE_HELP_MODE" });
      expect(next2.helpMode).toBe(false);
    });
  });

  describe("REFRESH", () => {
    test("replaces columns while preserving valid selection", () => {
      const state = createInitialBoardState(createTestColumns());
      state.cardIndex = 1;
      const newColumns = createTestColumns();
      newColumns[0].cards.push({
        nodeId: "card6",
        title: "New Card",
        childCount: 0,
        isTask: false,
      });
      const next = boardReducer(state, {
        type: "REFRESH",
        columns: newColumns,
      });
      expect(next.columns).toBe(newColumns);
      expect(next.cardIndex).toBe(1); // Preserved
    });

    test("clamps selection when columns shrink", () => {
      const state = createInitialBoardState(createTestColumns());
      state.colIndex = 1;
      state.cardIndex = 1;
      const newColumns: ColumnState[] = [
        {
          nodeId: "col1",
          title: "Only Column",
          cards: [
            {
              nodeId: "card1",
              title: "Only Card",
              childCount: 0,
              isTask: false,
            },
          ],
        },
      ];
      const next = boardReducer(state, {
        type: "REFRESH",
        columns: newColumns,
      });
      expect(next.colIndex).toBe(0); // Clamped
      expect(next.cardIndex).toBe(0); // Clamped
    });
  });
});

describe("createInitialBoardState", () => {
  test("creates initial state with defaults", () => {
    const columns = createTestColumns();
    const state = createInitialBoardState(columns);

    expect(state.columns).toBe(columns);
    expect(state.colIndex).toBe(0);
    expect(state.cardIndex).toBe(0);
    expect(state.rootId).toBe(null);
    expect(state.rootPath).toBe(null);
    expect(state.selectedCards.size).toBe(0);
    expect(state.visualMode).toBe(false);
    expect(state.foldedCards.size).toBe(0);
    expect(state.collapsedColumns.size).toBe(0);
    expect(state.searchQuery).toBe("");
    expect(state.searchMode).toBe(false);
    expect(state.helpMode).toBe(false);
    expect(state.zoomStack).toEqual([]);
  });

  test("accepts rootId and rootPath", () => {
    const state = createInitialBoardState([], "root-123", "/path/to/board");
    expect(state.rootId).toBe("root-123");
    expect(state.rootPath).toBe("/path/to/board");
  });
});
