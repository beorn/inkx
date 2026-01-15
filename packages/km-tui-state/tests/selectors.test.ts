/**
 * Selectors Tests
 *
 * Unit tests for the pure selector functions.
 */

import { describe, test, expect } from "bun:test";
import {
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
  isColumnOverWipLimit,
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

describe("getCurrentColumn", () => {
  test("returns the column at colIndex", () => {
    const state = createInitialBoardState(createTestColumns());
    const column = getCurrentColumn(state);
    expect(column?.nodeId).toBe("col1");
  });

  test("returns second column when colIndex is 1", () => {
    const state = createInitialBoardState(createTestColumns());
    state.colIndex = 1;
    const column = getCurrentColumn(state);
    expect(column?.nodeId).toBe("col2");
  });

  test("returns null when no columns exist", () => {
    const state = createInitialBoardState([]);
    const column = getCurrentColumn(state);
    expect(column).toBe(null);
  });

  test("returns null when colIndex is out of bounds", () => {
    const state = createInitialBoardState(createTestColumns());
    state.colIndex = 10;
    const column = getCurrentColumn(state);
    expect(column).toBe(null);
  });
});

describe("getCurrentCard", () => {
  test("returns the card at cardIndex in current column", () => {
    const state = createInitialBoardState(createTestColumns());
    state.cardIndex = 1;
    const card = getCurrentCard(state);
    expect(card?.nodeId).toBe("card2");
  });

  test("returns null when no cards in column", () => {
    const columns: ColumnState[] = [
      { nodeId: "col1", title: "Empty", cards: [] },
    ];
    const state = createInitialBoardState(columns);
    const card = getCurrentCard(state);
    expect(card).toBe(null);
  });

  test("returns null when cardIndex is out of bounds", () => {
    const state = createInitialBoardState(createTestColumns());
    state.cardIndex = 10;
    const card = getCurrentCard(state);
    expect(card).toBe(null);
  });
});

describe("canMoveUp", () => {
  test("returns true when cardIndex > 0", () => {
    const state = createInitialBoardState(createTestColumns());
    state.cardIndex = 1;
    expect(canMoveUp(state)).toBe(true);
  });

  test("returns false when cardIndex is 0", () => {
    const state = createInitialBoardState(createTestColumns());
    expect(canMoveUp(state)).toBe(false);
  });
});

describe("canMoveDown", () => {
  test("returns true when not at last card", () => {
    const state = createInitialBoardState(createTestColumns());
    expect(canMoveDown(state)).toBe(true);
  });

  test("returns false when at last card", () => {
    const state = createInitialBoardState(createTestColumns());
    state.cardIndex = 2;
    expect(canMoveDown(state)).toBe(false);
  });

  test("returns false when column is empty", () => {
    const columns: ColumnState[] = [
      { nodeId: "col1", title: "Empty", cards: [] },
    ];
    const state = createInitialBoardState(columns);
    expect(canMoveDown(state)).toBe(false);
  });
});

describe("canMoveLeft", () => {
  test("returns true when colIndex > 0", () => {
    const state = createInitialBoardState(createTestColumns());
    state.colIndex = 1;
    expect(canMoveLeft(state)).toBe(true);
  });

  test("returns false when at leftmost column", () => {
    const state = createInitialBoardState(createTestColumns());
    expect(canMoveLeft(state)).toBe(false);
  });
});

describe("canMoveRight", () => {
  test("returns true when not at rightmost column", () => {
    const state = createInitialBoardState(createTestColumns());
    expect(canMoveRight(state)).toBe(true);
  });

  test("returns false when at rightmost column", () => {
    const state = createInitialBoardState(createTestColumns());
    state.colIndex = 1;
    expect(canMoveRight(state)).toBe(false);
  });
});

describe("isCardFolded", () => {
  test("returns true when card is in foldedCards set", () => {
    const state = createInitialBoardState(createTestColumns());
    state.foldedCards.add("card1");
    expect(isCardFolded(state, "card1")).toBe(true);
  });

  test("returns false when card is not in foldedCards set", () => {
    const state = createInitialBoardState(createTestColumns());
    expect(isCardFolded(state, "card1")).toBe(false);
  });
});

describe("isColumnCollapsed", () => {
  test("returns true when column is in collapsedColumns set", () => {
    const state = createInitialBoardState(createTestColumns());
    state.collapsedColumns.add(0);
    expect(isColumnCollapsed(state, 0)).toBe(true);
  });

  test("returns false when column is not collapsed", () => {
    const state = createInitialBoardState(createTestColumns());
    expect(isColumnCollapsed(state, 0)).toBe(false);
  });
});

describe("getTotalCardCount", () => {
  test("returns sum of all cards across columns", () => {
    const state = createInitialBoardState(createTestColumns());
    expect(getTotalCardCount(state)).toBe(5); // 3 + 2
  });

  test("returns 0 when no columns", () => {
    const state = createInitialBoardState([]);
    expect(getTotalCardCount(state)).toBe(0);
  });

  test("returns 0 when all columns empty", () => {
    const columns: ColumnState[] = [
      { nodeId: "col1", title: "Empty 1", cards: [] },
      { nodeId: "col2", title: "Empty 2", cards: [] },
    ];
    const state = createInitialBoardState(columns);
    expect(getTotalCardCount(state)).toBe(0);
  });
});

describe("isColumnOverWipLimit", () => {
  test("returns true when cards exceed wipLimit", () => {
    const column: ColumnState = {
      nodeId: "col1",
      title: "Over Limit",
      wipLimit: 2,
      cards: [
        { nodeId: "card1", title: "Card 1", childCount: 0, isTask: false },
        { nodeId: "card2", title: "Card 2", childCount: 0, isTask: false },
        { nodeId: "card3", title: "Card 3", childCount: 0, isTask: false },
      ],
    };
    expect(isColumnOverWipLimit(column)).toBe(true);
  });

  test("returns false when cards equal wipLimit", () => {
    const column: ColumnState = {
      nodeId: "col1",
      title: "At Limit",
      wipLimit: 3,
      cards: [
        { nodeId: "card1", title: "Card 1", childCount: 0, isTask: false },
        { nodeId: "card2", title: "Card 2", childCount: 0, isTask: false },
        { nodeId: "card3", title: "Card 3", childCount: 0, isTask: false },
      ],
    };
    expect(isColumnOverWipLimit(column)).toBe(false);
  });

  test("returns false when no wipLimit set", () => {
    const column: ColumnState = {
      nodeId: "col1",
      title: "No Limit",
      cards: [
        { nodeId: "card1", title: "Card 1", childCount: 0, isTask: false },
      ],
    };
    expect(isColumnOverWipLimit(column)).toBe(false);
  });
});
