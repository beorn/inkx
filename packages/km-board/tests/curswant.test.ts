/**
 * Curswant Tests
 *
 * Tests for sticky cursor coordinates (curswantX and curswantY).
 * See bead km-jm2r for the full specification.
 *
 * curswantX: Sticky column index for board↔column navigation
 * curswantY: Sticky row index for cross-column navigation
 *
 * The curswant pattern is borrowed from Vim's `curswant` (cursor wanted column),
 * which preserves the x-coordinate during vertical navigation through lines
 * of varying length.
 */

import { describe, it, expect } from "bun:test";
import { boardReducer, createBoardState } from "../src/index.ts";
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

function createState(
  cursor: number[],
  nodes?: TNode[],
  overrides?: Partial<BoardState>,
): BoardState {
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
    curswantX: null,
    curswantY: null,
    ...overrides,
  };
}

// ============================================================================
// curswantX Tests: Board ↔ Column Navigation
// ============================================================================

describe("curswantX (board ↔ column navigation)", () => {
  describe("setting curswantX", () => {
    it("k at column level sets curswantX to current column index", () => {
      const state = createState([2]); // col-c (column index 2)
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });

      expect(result.cursor).toEqual([]); // board level
      expect(result.curswantX).toBe(2); // remembered column 2
    });

    it("k at first column sets curswantX to 0", () => {
      const state = createState([0]); // col-a
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });

      expect(result.cursor).toEqual([]); // board level
      expect(result.curswantX).toBe(0);
    });
  });

  describe("using curswantX", () => {
    it("j at board level uses curswantX", () => {
      const state = createState([], undefined, { curswantX: 2 }); // board with curswantX=2
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });

      expect(result.cursor).toEqual([2]); // goes to col-c (column 2)
      expect(result.cursorNodeId).toBe("col-c");
    });

    it("j at board level defaults to column 0 when curswantX is null", () => {
      const state = createState([], undefined, { curswantX: null });
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });

      expect(result.cursor).toEqual([0]); // first column
      expect(result.cursorNodeId).toBe("col-a");
    });

    it("j at board level clamps curswantX to valid range", () => {
      const state = createState([], undefined, { curswantX: 99 }); // out of range
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });

      expect(result.cursor).toEqual([2]); // last column (clamped)
      expect(result.cursorNodeId).toBe("col-c");
    });
  });

  describe("clearing curswantX", () => {
    it("j at board level clears curswantX after using it", () => {
      const state = createState([], undefined, { curswantX: 2 });
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });

      expect(result.cursor).toEqual([2]);
      expect(result.curswantX).toBeNull(); // cleared after use
    });

    it("j at column level (entering card) clears curswantX", () => {
      const state = createState([0], undefined, { curswantX: 1 }); // at column with curswantX set
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });

      expect(result.cursor).toEqual([0, 0]); // entered first card
      expect(result.curswantX).toBeNull(); // cleared
    });

    it("h/l at board level clears curswantX", () => {
      const state = createState([], undefined, { curswantX: 2 });
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });

      expect(result.curswantX).toBeNull(); // cleared by explicit h/l
    });

    it("NAV_TO_PATH clears curswantX", () => {
      const state = createState([0], undefined, { curswantX: 2 });
      const result = boardReducer(state, {
        type: "NAV_TO_PATH",
        path: [1, 0],
      });

      expect(result.curswantX).toBeNull();
    });
  });

  describe("round-trip navigation", () => {
    it("k then j returns to same column", () => {
      // Start at column 2, go up to board, then down
      let state = createState([2]);

      // k: column → board (sets curswantX)
      state = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });
      expect(state.cursor).toEqual([]);
      expect(state.curswantX).toBe(2);

      // j: board → column (uses curswantX)
      state = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
      expect(state.cursor).toEqual([2]);
      expect(state.cursorNodeId).toBe("col-c");
    });

    it("multiple k/j cycles work correctly", () => {
      let state = createState([1]); // start at col-b

      // First cycle
      state = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });
      expect(state.curswantX).toBe(1);
      state = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
      expect(state.cursor).toEqual([1]);

      // Second cycle (curswantX was cleared, so set fresh)
      state = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });
      expect(state.curswantX).toBe(1);
      state = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
      expect(state.cursor).toEqual([1]);
    });
  });
});

// ============================================================================
// curswantY Tests: Cross-Column Navigation
// ============================================================================

describe("curswantY (cross-column navigation)", () => {
  describe("setting curswantY", () => {
    it("first h/l at card level sets curswantY to normalized ratio", () => {
      const state = createState([0, 2]); // card-a3 (row 2 in 3-card column)
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });

      // Moved to col-b, curswantY should be ratio = 2/3
      // Target row = round(0.667 * 2) = round(1.33) = 1
      expect(result.cursor).toEqual([1, 1]); // row 1 (col-b has 2 cards)
      expect(result.curswantY).toBeCloseTo(2 / 3); // remembers ratio 2/3
    });

    it("column level h/l sets curswantY to 0", () => {
      const state = createState([0]); // col-a column level
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });

      expect(result.cursor).toEqual([1]); // col-b column level
      expect(result.curswantY).toBe(0);
    });
  });

  describe("using curswantY", () => {
    it("consecutive h/l preserves curswantY ratio", () => {
      let state = createState([0, 2], undefined, { curswantY: null }); // row 2 in col-a (3 cards)

      // Move right to col-b (sets curswantY=2/3)
      state = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      expect(state.cursor).toEqual([1, 1]); // round(0.667 * 2) = 1
      expect(state.curswantY).toBeCloseTo(2 / 3);

      // Move right to col-c (empty) - curswantY preserved
      state = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      expect(state.cursor).toEqual([2]); // column level (empty column)
      expect(state.curswantY).toBeCloseTo(2 / 3); // still remembers ratio
    });

    it("returning to taller column snaps to curswantY ratio", () => {
      // Create board with varying heights
      const nodes = [
        createNode("col-a", [
          createNode("a1"),
          createNode("a2"),
          createNode("a3"),
          createNode("a4"),
        ]),
        createNode("col-b", [createNode("b1"), createNode("b2")]),
        createNode("col-c", [
          createNode("c1"),
          createNode("c2"),
          createNode("c3"),
          createNode("c4"),
        ]),
      ];

      let state = createState([0, 3], nodes); // row 3 in col-a (4 cards)

      // Move right to col-b (only 2 cards)
      // curswantY = 3/4 = 0.75, targetRow = round(0.75 * 2) = 2, clamped to 1
      state = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      expect(state.cursor).toEqual([1, 1]); // clamped to last row
      expect(state.curswantY).toBe(0.75); // remembers ratio 3/4

      // Move right to col-c (4 cards) - snaps back to row 3
      // targetRow = round(0.75 * 4) = round(3) = 3
      state = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      expect(state.cursor).toEqual([2, 3]); // back to row 3
      expect(state.curswantY).toBe(0.75);
    });
  });

  describe("clearing curswantY", () => {
    it("j clears curswantY", () => {
      const state = createState([0, 1], undefined, { curswantY: 5 });
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });

      expect(result.curswantY).toBeNull();
    });

    it("k clears curswantY", () => {
      const state = createState([0, 1], undefined, { curswantY: 5 });
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });

      expect(result.curswantY).toBeNull();
    });

    it("NAV_TO_PATH clears curswantY", () => {
      const state = createState([0, 1], undefined, { curswantY: 5 });
      const result = boardReducer(state, {
        type: "NAV_TO_PATH",
        path: [1, 0],
      });

      expect(result.curswantY).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("h/l to empty column falls back to column level", () => {
      const state = createState([1, 0]); // row 0 in col-b (2 cards)
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });

      // col-c is empty
      expect(result.cursor).toEqual([2]); // column level
      expect(result.curswantY).toBe(0); // ratio = 0/2 = 0
    });

    it("h/l at first/last column boundary does nothing", () => {
      const state = createState([0, 0]); // first column
      const result = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "left",
      });

      expect(result.cursor).toEqual([0, 0]); // unchanged
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("curswant integration", () => {
  it("h/l clears curswantX but sets/preserves curswantY", () => {
    const state = createState([0, 1], undefined, {
      curswantX: 2,
      curswantY: null,
    });
    const result = boardReducer(state, {
      type: "NAV_CROSS_COLUMN",
      direction: "right",
    });

    // curswantX should be unchanged (we're not at board level)
    // curswantY should be set as ratio: row 1 in 3-card column = 1/3
    // Target row = round(0.333 * 2) = round(0.667) = 1
    expect(result.cursor).toEqual([1, 1]);
    expect(result.curswantY).toBeCloseTo(1 / 3);
  });

  it("j/k clears curswantY but manages curswantX independently", () => {
    // curswantX is only set when going from column→board
    // curswantY is cleared on any j/k
    const state = createState([0, 1], undefined, {
      curswantX: null,
      curswantY: 5,
    });

    // j within column
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
    expect(result.cursor).toEqual([0, 2]);
    expect(result.curswantY).toBeNull(); // cleared
    expect(result.curswantX).toBeNull(); // unchanged (not relevant)
  });

  it("zoom clears both curswant values", () => {
    const state = createState([0, 1], undefined, {
      curswantX: 2,
      curswantY: 3,
    });
    const result = boardReducer(state, {
      type: "ZOOM_IN",
      nodeId: "col-a",
      nodes: createStandardBoard()[0]!.children,
    });

    expect(result.curswantX).toBeNull();
    expect(result.curswantY).toBeNull();
  });
});
