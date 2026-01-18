/**
 * Board Reducer Tests
 *
 * Tests for boardReducer(), createBoardState().
 */

import { describe, it, expect } from "bun:test";
import { boardReducer, createBoardState, getNodeAtPath } from "../src/index.ts";
import type { BoardState, TNode } from "../src/index.ts";

// Helper to create test nodes
function createNode(id: string, children: TNode[] = []): TNode {
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
    isTask: false,
    depth: 0,
    data: {},
    created_at: 0,
    updated_at: 0,
    version: "",
  };
}

// Simple tree for testing:
// - Column A (col-a)
//   - Card 1 (card-1)
//   - Card 2 (card-2)
// - Column B (col-b)
//   - Card 3 (card-3)
const testNodes: TNode[] = [
  createNode("col-a", [createNode("card-1"), createNode("card-2")]),
  createNode("col-b", [createNode("card-3")]),
];

describe("createBoardState", () => {
  it("creates state with default values for empty nodes", () => {
    const state = createBoardState([]);
    expect(state.rootId).toBeNull();
    expect(state.rootPath).toBeNull();
    expect(state.cursor).toEqual([]);
    expect(state.selectedNodes.size).toBe(0);
    expect(state.foldedNodes.size).toBe(0);
    expect(state.zoomStack).toEqual([]);
    expect(state.navHistory).toEqual([]);
  });

  it("creates state with cursor at first card when nodes have children", () => {
    const state = createBoardState(testNodes);
    expect(state.rootId).toBeNull();
    expect(state.rootPath).toBeNull();
    expect(state.cursor).toEqual([0, 0]); // First card in first column
    expect(state.nodes).toBe(testNodes);
  });

  it("accepts custom root values", () => {
    const state = createBoardState(testNodes, "root-1", "/path/to/root");
    expect(state.rootId).toBe("root-1");
    expect(state.rootPath).toBe("/path/to/root");
  });
});

describe("boardReducer", () => {
  function createTestState(cursor: number[]): BoardState {
    return {
      ...createBoardState(testNodes),
      cursor,
    };
  }

  describe("cursor navigation (visual)", () => {
    it("CURSOR_MOVE down moves to next visible node", () => {
      const state = createTestState([0, 0]);
      const newState = boardReducer(state, {
        type: "CURSOR_MOVE",
        dir: "down",
      });
      expect(newState.cursor).toEqual([0, 1]); // card-1 -> card-2
    });

    it("CURSOR_MOVE up moves to previous visible node", () => {
      const state = createTestState([0, 1]);
      const newState = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });
      expect(newState.cursor).toEqual([0, 0]); // card-2 -> card-1
    });

    it("CURSOR_MOVE up from first card goes to parent column", () => {
      const state = createTestState([0, 0]);
      const newState = boardReducer(state, { type: "CURSOR_MOVE", dir: "up" });
      expect(newState.cursor).toEqual([0]); // card-1 -> col-a
    });

    it("CURSOR_MOVE down at boundary returns same state", () => {
      // At last node in tree
      const state = createTestState([1, 0]);
      const newState = boardReducer(state, {
        type: "CURSOR_MOVE",
        dir: "down",
      });
      expect(newState.cursor).toEqual([1, 0]); // stays at card-3
    });
  });

  describe("cursor navigation (structural)", () => {
    it("CURSOR_MOVE prev moves to previous sibling", () => {
      const state = createTestState([0, 1]);
      const newState = boardReducer(state, {
        type: "CURSOR_MOVE",
        dir: "prev",
      });
      expect(newState.cursor).toEqual([0, 0]);
    });

    it("CURSOR_MOVE next moves to next sibling", () => {
      const state = createTestState([0, 0]);
      const newState = boardReducer(state, {
        type: "CURSOR_MOVE",
        dir: "next",
      });
      expect(newState.cursor).toEqual([0, 1]);
    });

    it("CURSOR_MOVE out moves to parent", () => {
      const state = createTestState([0, 0]);
      const newState = boardReducer(state, { type: "CURSOR_MOVE", dir: "out" });
      expect(newState.cursor).toEqual([0]); // card-1 -> col-a
    });

    it("CURSOR_MOVE in moves to first child", () => {
      const state = createTestState([0]);
      const newState = boardReducer(state, { type: "CURSOR_MOVE", dir: "in" });
      expect(newState.cursor).toEqual([0, 0]); // col-a -> card-1
    });

    it("NAV_TO_PATH sets cursor directly", () => {
      const state = createTestState([0, 0]);
      const newState = boardReducer(state, {
        type: "NAV_TO_PATH",
        path: [1, 0],
      });
      expect(newState.cursor).toEqual([1, 0]);
    });

    it("CURSOR_MOVE first jumps to first sibling", () => {
      const state = createTestState([0, 1]);
      const newState = boardReducer(state, {
        type: "CURSOR_MOVE",
        dir: "first",
      });
      expect(newState.cursor).toEqual([0, 0]);
    });

    it("CURSOR_MOVE last jumps to last sibling", () => {
      const state = createTestState([0, 0]);
      const newState = boardReducer(state, {
        type: "CURSOR_MOVE",
        dir: "last",
      });
      expect(newState.cursor).toEqual([0, 1]);
    });
  });

  describe("selection", () => {
    it("SELECT_NODE_ADD adds node to selection", () => {
      const state = createTestState([0, 0]);
      const newState = boardReducer(state, {
        type: "SELECT_NODE_ADD",
        nodeId: "card-1",
      });
      expect(newState.selectedNodes.has("card-1")).toBe(true);
    });

    it("SELECT_NODE_REMOVE removes node from selection", () => {
      const state = {
        ...createTestState([0, 0]),
        selectedNodes: new Set(["card-1"]),
      };
      const newState = boardReducer(state, {
        type: "SELECT_NODE_REMOVE",
        nodeId: "card-1",
      });
      expect(newState.selectedNodes.has("card-1")).toBe(false);
    });

    it("SELECT_NODE_TOGGLE toggles selection", () => {
      const state = createTestState([0, 0]);
      let newState = boardReducer(state, {
        type: "SELECT_NODE_TOGGLE",
        nodeId: "card-1",
      });
      expect(newState.selectedNodes.has("card-1")).toBe(true);
      newState = boardReducer(newState, {
        type: "SELECT_NODE_TOGGLE",
        nodeId: "card-1",
      });
      expect(newState.selectedNodes.has("card-1")).toBe(false);
    });

    it("CLEAR_SELECTION clears all selection", () => {
      const state = {
        ...createTestState([0, 0]),
        selectedNodes: new Set(["card-1", "card-2"]),
      };
      const newState = boardReducer(state, { type: "CLEAR_SELECTION" });
      expect(newState.selectedNodes.size).toBe(0);
    });

    it("SELECT_ALL selects all nodes", () => {
      const state = createTestState([0, 0]);
      const newState = boardReducer(state, { type: "SELECT_ALL" });
      expect(newState.selectedNodes.size).toBeGreaterThan(0);
      expect(newState.selectedNodes.has("col-a")).toBe(true);
      expect(newState.selectedNodes.has("card-1")).toBe(true);
    });
  });

  describe("folding", () => {
    it("TOGGLE_FOLD toggles fold state", () => {
      const state = createTestState([0, 0]);
      let newState = boardReducer(state, {
        type: "TOGGLE_FOLD",
        nodeId: "col-a",
      });
      expect(newState.foldedNodes.has("col-a")).toBe(true);
      newState = boardReducer(newState, {
        type: "TOGGLE_FOLD",
        nodeId: "col-a",
      });
      expect(newState.foldedNodes.has("col-a")).toBe(false);
    });

    it("CURSOR_MOVE down skips children of folded nodes", () => {
      const state = {
        ...createTestState([0]),
        foldedNodes: new Set(["col-a"]),
      };
      const newState = boardReducer(state, {
        type: "CURSOR_MOVE",
        dir: "down",
      });
      // Should skip col-a's children and go to col-b
      expect(newState.cursor).toEqual([1]);
    });
  });

  describe("cross-column navigation", () => {
    it("NAV_CROSS_COLUMN right moves to next column", () => {
      const state = createTestState([0, 0]);
      const newState = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      expect(newState.cursor[0]).toBe(1); // col-b
    });

    it("NAV_CROSS_COLUMN left moves to previous column", () => {
      const state = createTestState([1, 0]);
      const newState = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "left",
      });
      expect(newState.cursor[0]).toBe(0); // col-a
    });

    it("NAV_CROSS_COLUMN preserves Y position when possible", () => {
      const state = createTestState([0, 1]); // card-2
      const newState = boardReducer(state, {
        type: "NAV_CROSS_COLUMN",
        direction: "right",
      });
      // col-b only has 1 card, so clamp to 0
      expect(newState.cursor).toEqual([1, 0]);
    });
  });
});

describe("getNodeAtPath", () => {
  it("returns node at valid path", () => {
    const node = getNodeAtPath(testNodes, [0, 0]);
    expect(node?.id).toBe("card-1");
  });

  it("returns null for invalid path", () => {
    const node = getNodeAtPath(testNodes, [5, 5]);
    expect(node).toBeNull();
  });

  it("returns null for empty path", () => {
    const node = getNodeAtPath(testNodes, []);
    expect(node).toBeNull();
  });

  it("returns null for empty nodes", () => {
    const node = getNodeAtPath([], [0, 0]);
    expect(node).toBeNull();
  });
});
