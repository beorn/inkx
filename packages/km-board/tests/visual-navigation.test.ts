/**
 * Visual Navigation Tests
 *
 * Tests for cursor navigation in the board view.
 * Per docs/06-ui.md, j/↓ and k/↑ should behave IDENTICALLY (visual-to-structural model).
 *
 * Navigation semantics per docs/06-ui.md:
 * - j/k/↑/↓ use "up/down" direction: Document traversal, crosses tree levels
 *   - j at column level enters first card
 *   - k at first card exits to column level
 * - h/l/←/→ use "left/right" direction: Cross-column horizontal movement
 *
 * @see docs/06-ui.md for the navigation model
 * @see bead km-c2k7 for the original bug report
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
// Sibling Navigation (prev/next direction) - NOT bound to j/k in board view
// These are raw reducer directions for sibling-only movement
// ============================================================================

describe("sibling navigation (prev/next) - raw directions", () => {
  describe("next", () => {
    it("moves to next sibling within column", () => {
      const state = createState([0, 0]); // first card in col-a
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "next" });
      expect(result.cursor).toEqual([0, 1]); // second card
      expect(result.cursorNodeId).toBe("card-a2");
    });

    it("stops at last sibling - does NOT cross to next column", () => {
      const state = createState([0, 2]); // last card in col-a
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "next" });
      // Sibling navigation stops at boundary
      expect(result.cursor).toEqual([0, 2]); // unchanged
      expect(result.cursorNodeId).toBe("card-a3");
    });

    it("at column level moves to next sibling column", () => {
      const state = createState([0]); // column level at col-a
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "next" });
      expect(result.cursor).toEqual([1]); // next column
      expect(result.cursorNodeId).toBe("col-b");
    });

    it("at board level (empty cursor) does nothing", () => {
      const state = createState([]); // board level
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "next" });
      expect(result.cursor).toEqual([]); // unchanged
    });
  });

  describe("prev", () => {
    it("moves to previous sibling", () => {
      const state = createState([0, 2]); // third card
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "prev" });
      expect(result.cursor).toEqual([0, 1]); // second card
      expect(result.cursorNodeId).toBe("card-a2");
    });

    it("stops at first sibling - sibling-only navigation", () => {
      // prev/next are sibling-only; up/down do document traversal (bound to j/k)
      const state = createState([0, 0]); // first card in col-a
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "prev" });
      expect(result.cursor).toEqual([0, 0]); // unchanged
    });

    it("at column level stays at first column (no prev sibling)", () => {
      const state = createState([0]); // first column
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "prev" });
      expect(result.cursor).toEqual([0]); // unchanged
    });

    it("at second column moves to first column", () => {
      const state = createState([1]); // col-b
      const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "prev" });
      expect(result.cursor).toEqual([0]); // col-a
      expect(result.cursorNodeId).toBe("col-a");
    });
  });
});

// ============================================================================
// Cross-Column Navigation (h/l/←/→)
// ============================================================================

describe("cross-column navigation (h/l = ←/→ = left/right)", () => {
  it("right moves to same row in next column", () => {
    const state = createState([0, 1]); // second card in col-a
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "right" });
    expect(result.cursor).toEqual([1, 1]); // second card in col-b
    expect(result.cursorNodeId).toBe("card-b2");
  });

  it("left moves to proportionally similar row in previous column", () => {
    // col-b has 2 cards, col-a has 3 cards
    // Row 1 in 2-card column = ratio 0.5 (bottom half)
    // In 3-card column: round(0.5 * 3) = round(1.5) = 2
    const state = createState([1, 1]); // last card in col-b
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "left" });
    expect(result.cursor).toEqual([0, 2]); // last card in col-a (proportional)
    expect(result.cursorNodeId).toBe("card-a3");
  });

  it("right clamps to column bounds when target shorter", () => {
    const state = createState([0, 2]); // third card in col-a (row 2)
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "right" });
    // col-b only has 2 cards (rows 0,1), so clamp to row 1
    expect(result.cursor).toEqual([1, 1]);
    expect(result.cursorNodeId).toBe("card-b2");
  });

  it("right to empty column goes to column level", () => {
    const state = createState([1, 0]); // card in col-b
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "right" });
    // col-c is empty, fall back to column level
    expect(result.cursor).toEqual([2]);
    expect(result.cursorNodeId).toBe("col-c");
  });

  it("left from first column stays at same position", () => {
    const state = createState([0, 1]); // second card in first column
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "left" });
    expect(result.cursor).toEqual([0, 1]); // unchanged
  });

  it("preserves column level when moving between columns", () => {
    const state = createState([0]); // column level at col-a
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "right" });
    expect(result.cursor).toEqual([1]); // column level at col-b
    expect(result.cursor.length).toBe(1); // still column level
  });

  it("preserves card level when target has cards", () => {
    const state = createState([0, 0]); // card level in col-a
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "right" });
    expect(result.cursor).toEqual([1, 0]); // card level in col-b
    expect(result.cursor.length).toBe(2); // still card level
  });
});

// ============================================================================
// First/Last Navigation (g/G)
// ============================================================================

describe("first/last navigation (g/G)", () => {
  it("first (g) moves to first sibling", () => {
    const state = createState([0, 2]); // last card
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "first" });
    expect(result.cursor).toEqual([0, 0]); // first card
    expect(result.cursorNodeId).toBe("card-a1");
  });

  it("last (G) moves to last sibling", () => {
    const state = createState([0, 0]); // first card
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "last" });
    expect(result.cursor).toEqual([0, 2]); // last card
    expect(result.cursorNodeId).toBe("card-a3");
  });

  it("first at column level moves to first column", () => {
    const state = createState([2]); // last column
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "first" });
    expect(result.cursor).toEqual([0]); // first column
    expect(result.cursorNodeId).toBe("col-a");
  });

  it("last at column level moves to last column", () => {
    const state = createState([0]); // first column
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "last" });
    expect(result.cursor).toEqual([2]); // last column
    expect(result.cursorNodeId).toBe("col-c");
  });
});

// ============================================================================
// Visual Navigation (up/down) - bound to j/k in board view
// Per docs/06-ui.md: j enters children, k exits to parent
// Navigation stays within current column - does NOT cross to adjacent columns
// ============================================================================

describe("visual navigation (j/k = up/down)", () => {
  it("down (j) at column level enters first card", () => {
    const state = createState([0]); // column level at col-a
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
    expect(result.cursor).toEqual([0, 0]); // first card in col-a
    expect(result.cursorNodeId).toBe("card-a1");
  });

  it("down (j) from last card stops - does NOT cross to next column", () => {
    const state = createState([0, 2]); // last card in col-a
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
    // Stays at last card - column navigation uses h/l, not j/k
    expect(result.cursor).toEqual([0, 2]); // unchanged
    expect(result.cursorNodeId).toBe("card-a3");
  });

  it("down (j) at empty column stays at column level", () => {
    const state = createState([2]); // col-c (empty)
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
    expect(result.cursor).toEqual([2]); // unchanged - no cards to enter
    expect(result.cursorNodeId).toBe("col-c");
  });

  it("up (k) at first card exits to column level", () => {
    const state = createState([0, 0]); // first card in col-a
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });
    expect(result.cursor).toEqual([0]); // column level
    expect(result.cursorNodeId).toBe("col-a");
  });

  it("up (k) at column level exits to board level", () => {
    const state = createState([1]); // col-b column level
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });
    expect(result.cursor).toEqual([]); // board level
    expect(result.cursorNodeId).toBeNull();
  });

  it("up (k) at first column also exits to board level", () => {
    const state = createState([0]); // first column
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });
    expect(result.cursor).toEqual([]); // board level
    expect(result.cursorNodeId).toBeNull();
  });

  it("down (j) at board level enters first column", () => {
    const state = createState([]); // board level
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
    expect(result.cursor).toEqual([0]); // first column
    expect(result.cursorNodeId).toBe("col-a");
  });

  it("down (j) moves to next card within column", () => {
    const state = createState([0, 0]); // first card
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "down" });
    expect(result.cursor).toEqual([0, 1]); // second card
    expect(result.cursorNodeId).toBe("card-a2");
  });

  it("up (k) moves to previous card within column", () => {
    const state = createState([0, 2]); // third card
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });
    expect(result.cursor).toEqual([0, 1]); // second card
    expect(result.cursorNodeId).toBe("card-a2");
  });
});

// ============================================================================
// Tree Navigation (in/out) - NOT bound to h/l in board view
// In board view, h/l do cross-column, not tree in/out
// ============================================================================

describe("tree navigation (in/out) - available but not bound in board view", () => {
  it("in enters first child", () => {
    const state = createState([0]); // column level at col-a (has children)
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "in" });
    expect(result.cursor).toEqual([0, 0]); // first card
    expect(result.cursorNodeId).toBe("card-a1");
  });

  it("in is noop at leaf node", () => {
    const state = createState([0, 0]); // card with no children
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "in" });
    expect(result.cursor).toEqual([0, 0]); // unchanged
  });

  it("out goes to parent", () => {
    const state = createState([0, 1]); // card level
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "out" });
    expect(result.cursor).toEqual([0]); // column level
    expect(result.cursorNodeId).toBe("col-a");
  });

  it("out from column level stays at column (can't go above)", () => {
    const state = createState([0]); // column level
    const result = boardReducer(state, { type: "CURSOR_MOVE", dir: "out" });
    expect(result.cursor).toEqual([0]); // unchanged
  });
});
