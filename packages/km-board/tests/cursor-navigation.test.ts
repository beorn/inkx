/**
 * Comprehensive Cursor Navigation Tests
 *
 * Tests all cursor navigation scenarios including:
 * - All cursor depths (board, column, card, sub-card)
 * - All directions (up, down, left, right)
 * - Edge cases (first/last column, first/last card, empty columns)
 * - Cross-column navigation preserving depth
 * - Board-level cursor state (no column active)
 *
 * These tests verify the integration between:
 * - visualToStructural (direction translation)
 * - boardReducer (state updates)
 * - NAV_TO_PATH, NAV_CROSS_COLUMN, CURSOR_MOVE
 */

import { describe, it, expect } from "bun:test";
import {
  boardReducer,
  createBoardState,
  pathToColumnIndices,
} from "../src/index.ts";
import type { BoardState, TNode } from "../src/index.ts";

// ============================================================================
// Test Helpers
// ============================================================================

function createNode(
  id: string,
  children: TNode[] = [],
  overrides: Partial<TNode> = {},
): TNode {
  return {
    id,
    type: "section",
    parent_id: null,
    parent_idx: 0,
    link_to: null,
    name: id,
    title: id,
    children,
    childCount: children.length,
    childrenLoaded: true,
    isTask: false,
    depth: 0,
    data: {},
    created_at: 0,
    updated_at: 0,
    version: "",
    ...overrides,
  };
}

/**
 * Creates a standard 3-column board for testing:
 * - col-a: 3 cards (card-a1, card-a2, card-a3)
 * - col-b: 2 cards (card-b1, card-b2)
 * - col-c: 0 cards (empty)
 */
function createStandardBoard(): TNode[] {
  return [
    createNode("col-a", [
      createNode("card-a1"),
      createNode("card-a2"),
      createNode("card-a3"),
    ]),
    createNode("col-b", [createNode("card-b1"), createNode("card-b2")]),
    createNode("col-c", []), // empty column
  ];
}

function createState(cursor: number[], nodes?: TNode[]): BoardState {
  const nodeTree = nodes ?? createStandardBoard();
  const base = createBoardState(nodeTree, "root");

  // Derive cursorNodeId from cursor path
  let cursorNodeId: string | null = null;
  if (cursor.length > 0) {
    let currentNodes = nodeTree;
    for (let i = 0; i < cursor.length; i++) {
      const idx = cursor[i];
      if (idx === undefined || idx >= currentNodes.length) break;
      const node = currentNodes[idx];
      if (!node) break;
      cursorNodeId = node.id;
      currentNodes = node.children;
    }
  }

  return {
    ...base,
    cursor,
    cursorNodeId,
  };
}

// ============================================================================
// Board Level Navigation (depth 0)
// ============================================================================

describe("board level navigation (cursor depth 0)", () => {
  describe("cursor state", () => {
    it("empty cursor means board level - no column selected", () => {
      const state = createState([]);
      const indices = pathToColumnIndices(state.cursor);
      expect(indices.colIndex).toBe(-1);
      expect(indices.cardIndex).toBe(-1);
    });

    it("NAV_TO_PATH with empty path sets board level", () => {
      const state = createState([0, 0]); // start at card
      const result = boardReducer(state, { type: "NAV_TO_PATH", path: [] });
      expect(result.cursor).toEqual([]);
      expect(result.cursorNodeId).toBeNull();
    });
  });

  describe("down from board level", () => {
    it("NAV_TO_PATH to column enters first column", () => {
      const state = createState([]);
      const result = boardReducer(state, { type: "NAV_TO_PATH", path: [0] });
      expect(result.cursor).toEqual([0]);
    });

    it("NAV_TO_PATH to column 1 enters second column", () => {
      const state = createState([]);
      const result = boardReducer(state, { type: "NAV_TO_PATH", path: [1] });
      expect(result.cursor).toEqual([1]);
    });
  });

  describe("other directions from board level", () => {
    it("up from board level is noop (stays at board)", () => {
      const state = createState([]);
      // CURSOR_MOVE up at board level should not change cursor
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });
      expect(result.cursor).toEqual([]);
    });

    it("left from board level is noop", () => {
      const state = createState([]);
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "left",
      });
      expect(result.cursor).toEqual([]);
    });

    it("right from board level is noop", () => {
      const state = createState([]);
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      expect(result.cursor).toEqual([]);
    });
  });
});

// ============================================================================
// Column Level Navigation (depth 1)
// ============================================================================

describe("column level navigation (cursor depth 1)", () => {
  describe("cursor state", () => {
    it("cursor [n] means column level - column n selected, no card", () => {
      const state = createState([0]);
      const indices = pathToColumnIndices(state.cursor);
      expect(indices.colIndex).toBe(0);
      expect(indices.cardIndex).toBe(-1);
    });

    it("cursor [1] selects second column", () => {
      const state = createState([1]);
      const indices = pathToColumnIndices(state.cursor);
      expect(indices.colIndex).toBe(1);
    });
  });

  describe("down from column level", () => {
    it("NAV_TO_PATH to card enters first card in column", () => {
      const state = createState([0]); // column level
      const result = boardReducer(state, { type: "NAV_TO_PATH", path: [0, 0] });
      expect(result.cursor).toEqual([0, 0]);
    });

    it("down into empty column stays at column level", () => {
      const state = createState([2]); // col-c is empty
      // Can't enter card level in empty column
      const result = boardReducer(state, { type: "NAV_TO_PATH", path: [2, 0] });
      // Should fail (invalid path) or stay at column level
      expect(result.cursor).toEqual([2]); // path doesn't exist, stays at column
    });
  });

  describe("up from column level", () => {
    it("NAV_TO_PATH to empty exits to board level", () => {
      const state = createState([0]);
      const result = boardReducer(state, { type: "NAV_TO_PATH", path: [] });
      expect(result.cursor).toEqual([]);
    });
  });

  describe("left/right at column level", () => {
    it("left from first column is noop", () => {
      const state = createState([0]);
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "left",
      });
      expect(result.cursor).toEqual([0]); // stays at first column
    });

    it("right from first column moves to second column", () => {
      const state = createState([0]);
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      expect(result.cursor).toEqual([1]); // column level preserved
    });

    it("left from middle column moves to previous column", () => {
      const state = createState([1]);
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "left",
      });
      expect(result.cursor).toEqual([0]); // column level preserved
    });

    it("right from last column is noop", () => {
      const state = createState([2]); // last column
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      expect(result.cursor).toEqual([2]); // stays at last column
    });

    it("cross-column preserves column level (key fix)", () => {
      // This was the bug: left/right was jumping to card level
      const state = createState([1]); // column level at col-b
      const left = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "left",
      });
      expect(left.cursor).toEqual([0]); // NOT [0, 0]
      expect(left.cursor.length).toBe(1); // still column level

      const right = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      expect(right.cursor).toEqual([2]); // NOT [2, 0]
      expect(right.cursor.length).toBe(1); // still column level
    });
  });
});

// ============================================================================
// Card Level Navigation (depth 2)
// ============================================================================

describe("card level navigation (cursor depth 2)", () => {
  describe("cursor state", () => {
    it("cursor [n, m] means card level - card m in column n", () => {
      const state = createState([0, 1]); // second card in first column
      const indices = pathToColumnIndices(state.cursor);
      expect(indices.colIndex).toBe(0);
      expect(indices.cardIndex).toBe(1);
      expect(indices.isAtCardLevel).toBe(true);
    });
  });

  describe("down at card level", () => {
    it("down moves to next card", () => {
      const state = createState([0, 0]); // first card
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
      expect(result.cursor).toEqual([0, 1]); // second card
    });

    it("down at last card stays - does NOT cross to next column", () => {
      const state = createState([0, 2]); // last card in col-a (3 cards)
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
      // j/k stay within column, use h/l to cross columns
      expect(result.cursor).toEqual([0, 2]); // unchanged
      expect(result.cursorNodeId).toBe("card-a3");
    });

    it("down at last card in any column stays at that card", () => {
      const state = createState([1, 1]); // last card in col-b
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
      // j/k stay within column, use h/l to cross columns
      expect(result.cursor).toEqual([1, 1]); // unchanged
      expect(result.cursorNodeId).toBe("card-b2");
    });

    it("down at last column (empty) returns null/noop", () => {
      const state = createState([2]); // col-c (last column, empty)
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
      // No more nodes after last column
      expect(result.cursor).toEqual([2]); // unchanged
    });
  });

  describe("up at card level", () => {
    it("up moves to previous card", () => {
      const state = createState([0, 2]); // third card
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });
      expect(result.cursor).toEqual([0, 1]); // second card
    });

    it("up at first card exits to column level", () => {
      const state = createState([0, 0]); // first card
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });
      expect(result.cursor).toEqual([0]); // column level
    });
  });

  describe("left/right at card level", () => {
    it("right moves to same row in next column", () => {
      const state = createState([0, 1]); // row 1 in col-a
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      expect(result.cursor).toEqual([1, 1]); // row 1 in col-b
    });

    it("left moves to same row in prev column", () => {
      const state = createState([1, 1]); // row 1 in col-b
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "left",
      });
      expect(result.cursor).toEqual([0, 1]); // row 1 in col-a
    });

    it("cross-column clamps to last card if target column is shorter", () => {
      const state = createState([0, 2]); // row 2 in col-a (3 cards)
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      // col-b only has 2 cards (indices 0, 1), so clamp to index 1
      expect(result.cursor).toEqual([1, 1]);
    });

    it("cross-column to empty column falls back to column level", () => {
      const state = createState([1, 0]); // card in col-b
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      // col-c is empty, so fall back to column level
      expect(result.cursor).toEqual([2]); // column level in col-c
    });

    it("cross-column preserves card level when target has cards", () => {
      const state = createState([0, 0]); // card level in col-a
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      expect(result.cursor).toEqual([1, 0]); // card level in col-b
      expect(result.cursor.length).toBe(2); // still card level
    });

    it("left from first column card is noop", () => {
      const state = createState([0, 1]); // card in first column
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "left",
      });
      expect(result.cursor).toEqual([0, 1]); // unchanged
    });

    it("right from col-b card goes to col-c (empty) at column level", () => {
      const state = createState([1, 0]); // card in col-b
      // col-c is empty, so we go to column level
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      expect(result.cursor).toEqual([2]); // col-c exists but is empty
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("edge cases", () => {
  describe("single column board", () => {
    it("left/right from only column is noop", () => {
      const singleCol = [createNode("only-col", [createNode("card-1")])];
      const state = createState([0], singleCol);

      const left = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "left",
      });
      expect(left.cursor).toEqual([0]);

      const right = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      expect(right.cursor).toEqual([0]);
    });
  });

  describe("single card column", () => {
    it("down from only card stays at card", () => {
      const singleCard = [createNode("col", [createNode("only-card")])];
      const state = createState([0, 0], singleCard);
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
      expect(result.cursor).toEqual([0, 0]);
    });

    it("up from only card exits to column", () => {
      const singleCard = [createNode("col", [createNode("only-card")])];
      const state = createState([0, 0], singleCard);
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });
      expect(result.cursor).toEqual([0]);
    });
  });

  describe("all empty columns", () => {
    it("navigates between empty columns at column level", () => {
      const emptyBoard = [
        createNode("col-a", []),
        createNode("col-b", []),
        createNode("col-c", []),
      ];
      const state = createState([0], emptyBoard);

      const right = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      expect(right.cursor).toEqual([1]);

      const right2 = boardReducer(right, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      expect(right2.cursor).toEqual([2]);
    });
  });

  describe("invalid paths", () => {
    it("NAV_TO_PATH to non-existent column is noop", () => {
      const state = createState([0, 0]);
      const result = boardReducer(state, { type: "NAV_TO_PATH", path: [10] });
      expect(result.cursor).toEqual([0, 0]); // unchanged
    });

    it("NAV_TO_PATH to non-existent card is noop", () => {
      const state = createState([0, 0]);
      const result = boardReducer(state, { type: "NAV_TO_PATH", path: [0, 10] });
      expect(result.cursor).toEqual([0, 0]); // unchanged
    });
  });
});

// ============================================================================
// Cursor Depth Transitions (Integration)
// ============================================================================

describe("cursor depth transitions", () => {
  it("full navigation cycle: board -> column -> card -> column -> board", () => {
    let state = createState([]); // board level

    // Board -> Column (down)
    state = boardReducer(state, { type: "NAV_TO_PATH", path: [0] });
    expect(state.cursor).toEqual([0]);
    expect(state.cursor.length).toBe(1);

    // Column -> Card (down)
    state = boardReducer(state, { type: "NAV_TO_PATH", path: [0, 0] });
    expect(state.cursor).toEqual([0, 0]);
    expect(state.cursor.length).toBe(2);

    // Card -> Card (down)
    state = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
    expect(state.cursor).toEqual([0, 1]);

    // Card -> Column (up from first card)
    state = boardReducer(state, { type: "NAV_TO_PATH", path: [0, 0] }); // back to first card
    state = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });
    expect(state.cursor).toEqual([0]);
    expect(state.cursor.length).toBe(1);

    // Column -> Board (up)
    state = boardReducer(state, { type: "NAV_TO_PATH", path: [] });
    expect(state.cursor).toEqual([]);
    expect(state.cursor.length).toBe(0);
  });

  it("cross-column at each level maintains depth", () => {
    // Column level cross-column
    let state = createState([1]); // column level
    state = boardReducer(state, {
      type: "NAV_CROSS_COLUMN",
      direction: "left",
    });
    expect(state.cursor).toEqual([0]);
    expect(state.cursor.length).toBe(1); // still column level

    // Card level cross-column
    state = createState([0, 1]); // card level
    state = boardReducer(state, {
      type: "NAV_CROSS_COLUMN",
      direction: "right",
    });
    expect(state.cursor).toEqual([1, 1]);
    expect(state.cursor.length).toBe(2); // still card level
  });
});

// ============================================================================
// cursorNodeId Consistency
// ============================================================================

describe("cursorNodeId consistency", () => {
  it("NAV_TO_PATH updates cursorNodeId", () => {
    const state = createState([]);
    const result = boardReducer(state, { type: "NAV_TO_PATH", path: [0, 0] });
    expect(result.cursorNodeId).toBe("card-a1");
  });

  it("CURSOR_MOVE updates cursorNodeId", () => {
    const state = createState([0, 0]);
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
    expect(result.cursorNodeId).toBe("card-a2");
  });

  it("NAV_CROSS_COLUMN updates cursorNodeId", () => {
    const state = createState([0, 0]);
    const result = boardReducer(state, {
      type: "NAV_CROSS_COLUMN",
      direction: "right",
    });
    expect(result.cursorNodeId).toBe("card-b1");
  });

  it("board level has null cursorNodeId", () => {
    const state = createState([0, 0]);
    const result = boardReducer(state, { type: "NAV_TO_PATH", path: [] });
    expect(result.cursorNodeId).toBeNull();
  });

  it("column level has column cursorNodeId", () => {
    const state = createState([]);
    const result = boardReducer(state, { type: "NAV_TO_PATH", path: [1] });
    expect(result.cursorNodeId).toBe("col-b");
  });
});
