/**
 * TUI2 Integration Tests
 *
 * Tests the full flow from store data through state management
 * to view models. Verifies the architecture layers work together:
 *
 * Store Layer (km-store) -> State Layer (km-tui-core) -> View Layer (km-tui-opentui)
 */

import { describe, it, expect } from "bun:test";

// Import from @km/tui-core - the shared state management layer
import {
  boardReducer,
  createInitialBoardState,
  getCurrentColumn,
  getCurrentCard,
  canMoveUp,
  canMoveDown,
  canMoveLeft,
  canMoveRight,
  isCardFolded,
  isColumnCollapsed,
  getTotalCardCount,
  toCardViewModel,
  toColumnViewModel,
  toBoardViewModel,
} from "@km/tui-core";

import type {
  BoardState,
  ColumnState,
  CardState,
  BoardAction,
  ViewMode,
} from "@km/tui-core";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock card state for testing
 */
function mockCard(
  id: string,
  title: string,
  options: Partial<CardState> = {},
): CardState {
  return {
    nodeId: id,
    title,
    childCount: 0,
    isTask: true,
    ...options,
  };
}

/**
 * Create a mock column state for testing
 */
function mockColumn(
  id: string,
  title: string,
  cards: CardState[],
  wipLimit?: number,
): ColumnState {
  return {
    nodeId: id,
    title,
    cards,
    wipLimit,
  };
}

/**
 * Create a sample board state for testing
 */
function createTestBoard(): BoardState {
  const todoCards = [
    mockCard("card-1", "Setup CI pipeline", { taskStatus: "todo" }),
    mockCard("card-2", "Write documentation", { taskStatus: "todo" }),
    mockCard("card-3", "Review PR", { taskStatus: "todo" }),
  ];

  const wipCards = [
    mockCard("card-4", "Implement auth", {
      taskStatus: "wip",
      childCount: 3,
    }),
    mockCard("card-5", "Fix bug #42", { taskStatus: "wip" }),
  ];

  const doneCards = [
    mockCard("card-6", "Initial setup", { taskStatus: "done" }),
    mockCard("card-7", "Add tests", { taskStatus: "done" }),
  ];

  const columns: ColumnState[] = [
    mockColumn("col-todo", "Todo", todoCards),
    mockColumn("col-wip", "In Progress", wipCards, 3), // WIP limit of 3
    mockColumn("col-done", "Done", doneCards),
  ];

  return createInitialBoardState(columns, "board-root", "/test/vault");
}

// ============================================================================
// State Management Tests
// ============================================================================

describe("TUI2 Integration: State Management", () => {
  describe("createInitialBoardState", () => {
    it("creates state with columns", () => {
      const state = createTestBoard();

      expect(state.columns).toHaveLength(3);
      expect(state.colIndex).toBe(0);
      expect(state.cardIndex).toBe(0);
      expect(state.rootId).toBe("board-root");
      expect(state.rootPath).toBe("/test/vault");
    });

    it("initializes selection state correctly", () => {
      const state = createTestBoard();

      expect(state.selectedCards.size).toBe(0);
      expect(state.visualMode).toBe(false);
      expect(state.foldedCards.size).toBe(0);
      expect(state.collapsedColumns.size).toBe(0);
    });

    it("initializes search state correctly", () => {
      const state = createTestBoard();

      expect(state.searchQuery).toBe("");
      expect(state.searchMode).toBe(false);
      expect(state.helpMode).toBe(false);
    });
  });

  describe("boardReducer navigation", () => {
    it("MOVE_DOWN increments cardIndex", () => {
      const state = createTestBoard();
      const newState = boardReducer(state, { type: "MOVE_DOWN" });

      expect(newState.cardIndex).toBe(1);
      expect(newState.colIndex).toBe(0); // Column unchanged
    });

    it("MOVE_UP decrements cardIndex", () => {
      const state = { ...createTestBoard(), cardIndex: 2 };
      const newState = boardReducer(state, { type: "MOVE_UP" });

      expect(newState.cardIndex).toBe(1);
    });

    it("MOVE_RIGHT increments colIndex and resets cardIndex", () => {
      const state = { ...createTestBoard(), cardIndex: 2 };
      const newState = boardReducer(state, { type: "MOVE_RIGHT" });

      expect(newState.colIndex).toBe(1);
      expect(newState.cardIndex).toBe(0); // Reset to first card
    });

    it("MOVE_LEFT decrements colIndex and resets cardIndex", () => {
      const state = { ...createTestBoard(), colIndex: 2, cardIndex: 1 };
      const newState = boardReducer(state, { type: "MOVE_LEFT" });

      expect(newState.colIndex).toBe(1);
      expect(newState.cardIndex).toBe(0);
    });

    it("JUMP_TOP goes to first card", () => {
      const state = { ...createTestBoard(), cardIndex: 2 };
      const newState = boardReducer(state, { type: "JUMP_TOP" });

      expect(newState.cardIndex).toBe(0);
    });

    it("JUMP_BOTTOM goes to last card", () => {
      const state = createTestBoard();
      const newState = boardReducer(state, { type: "JUMP_BOTTOM" });

      expect(newState.cardIndex).toBe(2); // 3 cards in Todo column
    });
  });

  describe("boardReducer boundaries", () => {
    it("MOVE_UP at top stays at top", () => {
      const state = createTestBoard(); // cardIndex = 0
      const newState = boardReducer(state, { type: "MOVE_UP" });

      expect(newState.cardIndex).toBe(0);
    });

    it("MOVE_DOWN at bottom stays at bottom", () => {
      const state = { ...createTestBoard(), cardIndex: 2 }; // last card
      const newState = boardReducer(state, { type: "MOVE_DOWN" });

      expect(newState.cardIndex).toBe(2);
    });

    it("MOVE_LEFT at leftmost stays", () => {
      const state = createTestBoard(); // colIndex = 0
      const newState = boardReducer(state, { type: "MOVE_LEFT" });

      expect(newState.colIndex).toBe(0);
    });

    it("MOVE_RIGHT at rightmost stays", () => {
      const state = { ...createTestBoard(), colIndex: 2 }; // last column
      const newState = boardReducer(state, { type: "MOVE_RIGHT" });

      expect(newState.colIndex).toBe(2);
    });
  });

  describe("boardReducer folding and collapse", () => {
    it("TOGGLE_FOLD adds card to foldedCards", () => {
      const state = createTestBoard();
      const newState = boardReducer(state, {
        type: "TOGGLE_FOLD",
        cardId: "card-4",
      });

      expect(newState.foldedCards.has("card-4")).toBe(true);
    });

    it("TOGGLE_FOLD removes card from foldedCards when already folded", () => {
      const state = createTestBoard();
      state.foldedCards.add("card-4");

      const newState = boardReducer(state, {
        type: "TOGGLE_FOLD",
        cardId: "card-4",
      });

      expect(newState.foldedCards.has("card-4")).toBe(false);
    });

    it("TOGGLE_COLLAPSE adds column to collapsedColumns", () => {
      const state = createTestBoard();
      const newState = boardReducer(state, {
        type: "TOGGLE_COLLAPSE",
        colIndex: 1,
      });

      expect(newState.collapsedColumns.has(1)).toBe(true);
    });

    it("TOGGLE_COLLAPSE removes column when already collapsed", () => {
      const state = createTestBoard();
      state.collapsedColumns.add(1);

      const newState = boardReducer(state, {
        type: "TOGGLE_COLLAPSE",
        colIndex: 1,
      });

      expect(newState.collapsedColumns.has(1)).toBe(false);
    });
  });

  describe("boardReducer search and modes", () => {
    it("SET_SEARCH_QUERY updates query", () => {
      const state = createTestBoard();
      const newState = boardReducer(state, {
        type: "SET_SEARCH_QUERY",
        query: "test",
      });

      expect(newState.searchQuery).toBe("test");
    });

    it("TOGGLE_SEARCH_MODE enables search", () => {
      const state = createTestBoard();
      const newState = boardReducer(state, { type: "TOGGLE_SEARCH_MODE" });

      expect(newState.searchMode).toBe(true);
    });

    it("TOGGLE_SEARCH_MODE disables search and clears query", () => {
      const state = {
        ...createTestBoard(),
        searchMode: true,
        searchQuery: "test",
      };
      const newState = boardReducer(state, { type: "TOGGLE_SEARCH_MODE" });

      expect(newState.searchMode).toBe(false);
      expect(newState.searchQuery).toBe("");
    });

    it("TOGGLE_HELP_MODE toggles help", () => {
      const state = createTestBoard();
      const newState = boardReducer(state, { type: "TOGGLE_HELP_MODE" });

      expect(newState.helpMode).toBe(true);

      const newState2 = boardReducer(newState, { type: "TOGGLE_HELP_MODE" });
      expect(newState2.helpMode).toBe(false);
    });
  });
});

// ============================================================================
// Selector Tests
// ============================================================================

describe("TUI2 Integration: Selectors", () => {
  describe("getCurrentColumn", () => {
    it("returns current column", () => {
      const state = createTestBoard();
      const column = getCurrentColumn(state);

      expect(column).not.toBeNull();
      expect(column?.title).toBe("Todo");
    });

    it("returns null for invalid colIndex", () => {
      const state = { ...createTestBoard(), colIndex: 99 };
      const column = getCurrentColumn(state);

      expect(column).toBeNull();
    });
  });

  describe("getCurrentCard", () => {
    it("returns current card", () => {
      const state = createTestBoard();
      const card = getCurrentCard(state);

      expect(card).not.toBeNull();
      expect(card?.title).toBe("Setup CI pipeline");
    });

    it("returns null for invalid cardIndex", () => {
      const state = { ...createTestBoard(), cardIndex: 99 };
      const card = getCurrentCard(state);

      expect(card).toBeNull();
    });
  });

  describe("navigation predicates", () => {
    it("canMoveUp returns true when not at top", () => {
      const state = { ...createTestBoard(), cardIndex: 1 };
      expect(canMoveUp(state)).toBe(true);
    });

    it("canMoveUp returns false when at top", () => {
      const state = createTestBoard();
      expect(canMoveUp(state)).toBe(false);
    });

    it("canMoveDown returns true when not at bottom", () => {
      const state = createTestBoard();
      expect(canMoveDown(state)).toBe(true);
    });

    it("canMoveDown returns false when at bottom", () => {
      const state = { ...createTestBoard(), cardIndex: 2 };
      expect(canMoveDown(state)).toBe(false);
    });

    it("canMoveLeft returns true when not at left edge", () => {
      const state = { ...createTestBoard(), colIndex: 1 };
      expect(canMoveLeft(state)).toBe(true);
    });

    it("canMoveLeft returns false when at left edge", () => {
      const state = createTestBoard();
      expect(canMoveLeft(state)).toBe(false);
    });

    it("canMoveRight returns true when not at right edge", () => {
      const state = createTestBoard();
      expect(canMoveRight(state)).toBe(true);
    });

    it("canMoveRight returns false when at right edge", () => {
      const state = { ...createTestBoard(), colIndex: 2 };
      expect(canMoveRight(state)).toBe(false);
    });
  });

  describe("fold and collapse predicates", () => {
    it("isCardFolded returns true for folded cards", () => {
      const state = createTestBoard();
      state.foldedCards.add("card-4");

      expect(isCardFolded(state, "card-4")).toBe(true);
      expect(isCardFolded(state, "card-1")).toBe(false);
    });

    it("isColumnCollapsed returns true for collapsed columns", () => {
      const state = createTestBoard();
      state.collapsedColumns.add(1);

      expect(isColumnCollapsed(state, 1)).toBe(true);
      expect(isColumnCollapsed(state, 0)).toBe(false);
    });
  });

  describe("getTotalCardCount", () => {
    it("counts all cards across columns", () => {
      const state = createTestBoard();
      expect(getTotalCardCount(state)).toBe(7); // 3 + 2 + 2
    });

    it("returns 0 for empty board", () => {
      const state = createInitialBoardState([], null, null);
      expect(getTotalCardCount(state)).toBe(0);
    });
  });
});

// ============================================================================
// ViewModel Transformer Tests
// ============================================================================

describe("TUI2 Integration: ViewModels", () => {
  describe("toCardViewModel", () => {
    it("transforms card state to view model", () => {
      const card = mockCard("card-1", "Test Card", {
        taskStatus: "wip",
        childCount: 2,
      });
      const vm = toCardViewModel(card, false);

      expect(vm.id).toBe("card-1");
      expect(vm.title).toBe("Test Card");
      expect(vm.taskStatus).toBe("wip");
      expect(vm.childCount).toBe(2);
      expect(vm.isFolded).toBe(false);
    });

    it("includes fold state", () => {
      const card = mockCard("card-1", "Test Card");
      const vm = toCardViewModel(card, true);

      expect(vm.isFolded).toBe(true);
    });
  });

  describe("toColumnViewModel", () => {
    it("transforms column state to view model", () => {
      const cards = [mockCard("c1", "Card 1"), mockCard("c2", "Card 2")];
      const column = mockColumn("col-1", "Todo", cards, 5);
      const vm = toColumnViewModel(column, new Set(), false);

      expect(vm.id).toBe("col-1");
      expect(vm.title).toBe("Todo");
      expect(vm.count).toBe(2);
      expect(vm.wipLimit).toBe(5);
      expect(vm.isOverLimit).toBe(false);
      expect(vm.isCollapsed).toBe(false);
      expect(vm.cards).toHaveLength(2);
    });

    it("marks column over WIP limit", () => {
      const cards = [
        mockCard("c1", "Card 1"),
        mockCard("c2", "Card 2"),
        mockCard("c3", "Card 3"),
      ];
      const column = mockColumn("col-1", "WIP", cards, 2);
      const vm = toColumnViewModel(column, new Set(), false);

      expect(vm.isOverLimit).toBe(true);
    });

    it("propagates fold state to cards", () => {
      const cards = [mockCard("c1", "Card 1"), mockCard("c2", "Card 2")];
      const column = mockColumn("col-1", "Todo", cards);
      const foldedCards = new Set(["c1"]);
      const vm = toColumnViewModel(column, foldedCards, false);

      expect(vm.cards[0].isFolded).toBe(true);
      expect(vm.cards[1].isFolded).toBe(false);
    });
  });

  describe("toBoardViewModel", () => {
    it("transforms full board state", () => {
      const state = createTestBoard();
      const vm = toBoardViewModel(state, "cards");

      expect(vm.rootPath).toBe("/test/vault");
      expect(vm.columns).toHaveLength(3);
      expect(vm.selectedCol).toBe(0);
      expect(vm.selectedCard).toBe(0);
      expect(vm.viewMode).toBe("cards");
      expect(vm.searchMode).toBe(false);
      expect(vm.helpMode).toBe(false);
    });

    it("includes search state", () => {
      const state = {
        ...createTestBoard(),
        searchMode: true,
        searchQuery: "test",
      };
      const vm = toBoardViewModel(state, "list");

      expect(vm.searchMode).toBe(true);
      expect(vm.searchQuery).toBe("test");
    });

    it("includes collapsed columns", () => {
      const state = createTestBoard();
      state.collapsedColumns.add(1);
      const vm = toBoardViewModel(state, "columns");

      expect(vm.columns[0].isCollapsed).toBe(false);
      expect(vm.columns[1].isCollapsed).toBe(true);
      expect(vm.columns[2].isCollapsed).toBe(false);
    });
  });
});

// ============================================================================
// Full Flow Tests
// ============================================================================

describe("TUI2 Integration: Full Flow", () => {
  it("navigates through board and produces correct view model", () => {
    // Start with fresh board
    let state = createTestBoard();

    // Move right to "In Progress" column
    state = boardReducer(state, { type: "MOVE_RIGHT" });
    expect(getCurrentColumn(state)?.title).toBe("In Progress");

    // Move down to second card
    state = boardReducer(state, { type: "MOVE_DOWN" });
    expect(getCurrentCard(state)?.title).toBe("Fix bug #42");

    // Fold the first card (which has children)
    state = boardReducer(state, { type: "TOGGLE_FOLD", cardId: "card-4" });

    // Collapse the Done column
    state = boardReducer(state, { type: "TOGGLE_COLLAPSE", colIndex: 2 });

    // Generate view model
    const vm = toBoardViewModel(state, "cards");

    // Verify all state changes reflected in view model
    expect(vm.selectedCol).toBe(1);
    expect(vm.selectedCard).toBe(1);
    expect(vm.columns[1].cards[0].isFolded).toBe(true);
    expect(vm.columns[2].isCollapsed).toBe(true);
  });

  it("handles refresh while preserving selection", () => {
    let state = createTestBoard();

    // Navigate to position
    state = boardReducer(state, { type: "MOVE_RIGHT" });
    state = boardReducer(state, { type: "MOVE_DOWN" });

    // Simulate refresh with updated columns
    const newCards = [
      mockCard("card-new-1", "New Card 1"),
      mockCard("card-new-2", "New Card 2"),
    ];
    const newColumns: ColumnState[] = [
      mockColumn("col-1", "Column 1", newCards),
      mockColumn("col-2", "Column 2", [mockCard("c", "Card")]),
    ];

    state = boardReducer(state, { type: "REFRESH", columns: newColumns });

    // Selection should be clamped to valid range
    expect(state.columns).toHaveLength(2);
    expect(state.colIndex).toBeLessThanOrEqual(1);
    expect(state.cardIndex).toBeLessThanOrEqual(
      state.columns[state.colIndex]?.cards.length - 1 ?? 0,
    );
  });
});
