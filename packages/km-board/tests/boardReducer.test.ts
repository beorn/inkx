/**
 * Board Reducer Tests
 *
 * Tests for boardReducer(), createInitialBoardState(), and validateCursor().
 */

import { describe, it, expect } from "bun:test";
import {
  boardReducer,
  validateCursor,
  createInitialBoardState,
} from "../src/index.ts";
import type { BoardState, BoardAction } from "../src/index.ts";
import type { TreeNode } from "@km/tree";

// Helper to create test nodes
function createNode(nodeId: string, children: TreeNode[] = []): TreeNode {
  return {
    nodeId,
    title: nodeId,
    children,
    childCount: children.length,
    isTask: false,
    isFolded: false,
    depth: 0,
  };
}

// Simple tree for testing:
// - Column A (col-a)
//   - Card 1 (card-1)
//   - Card 2 (card-2)
// - Column B (col-b)
//   - Card 3 (card-3)
const testNodes: TreeNode[] = [
  createNode("col-a", [createNode("card-1"), createNode("card-2")]),
  createNode("col-b", [createNode("card-3")]),
];

describe("createInitialBoardState", () => {
  it("creates state with default values", () => {
    const state = createInitialBoardState();
    expect(state.rootId).toBeNull();
    expect(state.rootPath).toBeNull();
    expect(state.cursor).toEqual([0, 0]);
    expect(state.selectedNodes.size).toBe(0);
    expect(state.foldedNodes.size).toBe(0);
    expect(state.searchQuery).toBe("");
    expect(state.zoomStack).toEqual([]);
    expect(state.navHistory).toEqual([]);
  });

  it("accepts custom initial values", () => {
    const state = createInitialBoardState("root-1", "/path/to/root", [1, 2]);
    expect(state.rootId).toBe("root-1");
    expect(state.rootPath).toBe("/path/to/root");
    expect(state.cursor).toEqual([1, 2]);
  });
});

describe("boardReducer", () => {
  describe("cursor navigation", () => {
    it("CURSOR_DOWN moves to next visible node", () => {
      const state = createInitialBoardState(null, null, [0, 0]);
      const newState = boardReducer(state, { type: "CURSOR_DOWN" }, testNodes);
      expect(newState.cursor).toEqual([0, 1]); // card-1 -> card-2
    });

    it("CURSOR_UP moves to previous visible node", () => {
      const state = createInitialBoardState(null, null, [0, 1]);
      const newState = boardReducer(state, { type: "CURSOR_UP" }, testNodes);
      expect(newState.cursor).toEqual([0, 0]); // card-2 -> card-1
    });

    it("CURSOR_UP from first card goes to parent column", () => {
      const state = createInitialBoardState(null, null, [0, 0]);
      const newState = boardReducer(state, { type: "CURSOR_UP" }, testNodes);
      expect(newState.cursor).toEqual([0]); // card-1 -> col-a
    });

    it("CURSOR_DOWN at boundary returns same state", () => {
      // At last node in tree
      const state = createInitialBoardState(null, null, [1, 0]);
      const newState = boardReducer(state, { type: "CURSOR_DOWN" }, testNodes);
      expect(newState.cursor).toEqual([1, 0]); // stays at card-3
    });
  });

  describe("structural navigation", () => {
    it("NAV_PREV_SIBLING moves to previous sibling", () => {
      const state = createInitialBoardState(null, null, [0, 1]);
      const newState = boardReducer(
        state,
        { type: "NAV_PREV_SIBLING" },
        testNodes,
      );
      expect(newState.cursor).toEqual([0, 0]);
    });

    it("NAV_NEXT_SIBLING moves to next sibling", () => {
      const state = createInitialBoardState(null, null, [0, 0]);
      const newState = boardReducer(
        state,
        { type: "NAV_NEXT_SIBLING" },
        testNodes,
      );
      expect(newState.cursor).toEqual([0, 1]);
    });

    it("NAV_PARENT moves to parent", () => {
      const state = createInitialBoardState(null, null, [0, 0]);
      const newState = boardReducer(state, { type: "NAV_PARENT" }, testNodes);
      expect(newState.cursor).toEqual([0]); // card-1 -> col-a
    });

    it("NAV_CHILD moves to first child", () => {
      const state = createInitialBoardState(null, null, [0]);
      const newState = boardReducer(state, { type: "NAV_CHILD" }, testNodes);
      expect(newState.cursor).toEqual([0, 0]); // col-a -> card-1
    });

    it("NAV_TO_PATH sets cursor directly", () => {
      const state = createInitialBoardState(null, null, [0, 0]);
      const newState = boardReducer(
        state,
        { type: "NAV_TO_PATH", path: [1, 0] },
        testNodes,
      );
      expect(newState.cursor).toEqual([1, 0]);
    });
  });

  describe("jump navigation", () => {
    it("NAV_FIRST_SIBLING jumps to first sibling", () => {
      const state = createInitialBoardState(null, null, [0, 1]);
      const newState = boardReducer(
        state,
        { type: "NAV_FIRST_SIBLING" },
        testNodes,
      );
      expect(newState.cursor).toEqual([0, 0]);
    });

    it("NAV_LAST_SIBLING jumps to last sibling", () => {
      const state = createInitialBoardState(null, null, [0, 0]);
      const newState = boardReducer(
        state,
        { type: "NAV_LAST_SIBLING" },
        testNodes,
      );
      expect(newState.cursor).toEqual([0, 1]);
    });

    it("JUMP_TOP is alias for NAV_FIRST_SIBLING", () => {
      const state = createInitialBoardState(null, null, [0, 1]);
      const newState = boardReducer(state, { type: "JUMP_TOP" }, testNodes);
      expect(newState.cursor).toEqual([0, 0]);
    });

    it("JUMP_BOTTOM is alias for NAV_LAST_SIBLING", () => {
      const state = createInitialBoardState(null, null, [0, 0]);
      const newState = boardReducer(state, { type: "JUMP_BOTTOM" }, testNodes);
      expect(newState.cursor).toEqual([0, 1]);
    });
  });

  describe("selection", () => {
    it("SELECT_NODE_ADD adds node to selection", () => {
      const state = createInitialBoardState();
      const newState = boardReducer(
        state,
        { type: "SELECT_NODE_ADD", nodeId: "card-1" },
        testNodes,
      );
      expect(newState.selectedNodes.has("card-1")).toBe(true);
    });

    it("SELECT_NODE_REMOVE removes node from selection", () => {
      const state = createInitialBoardState();
      state.selectedNodes.add("card-1");
      const newState = boardReducer(
        state,
        { type: "SELECT_NODE_REMOVE", nodeId: "card-1" },
        testNodes,
      );
      expect(newState.selectedNodes.has("card-1")).toBe(false);
    });

    it("SELECT_NODE_TOGGLE toggles selection", () => {
      const state = createInitialBoardState();
      let newState = boardReducer(
        state,
        { type: "SELECT_NODE_TOGGLE", nodeId: "card-1" },
        testNodes,
      );
      expect(newState.selectedNodes.has("card-1")).toBe(true);
      newState = boardReducer(
        newState,
        { type: "SELECT_NODE_TOGGLE", nodeId: "card-1" },
        testNodes,
      );
      expect(newState.selectedNodes.has("card-1")).toBe(false);
    });

    it("CLEAR_SELECTION clears all selection", () => {
      const state = createInitialBoardState();
      state.selectedNodes.add("card-1");
      state.selectedNodes.add("card-2");
      const newState = boardReducer(
        state,
        { type: "CLEAR_SELECTION" },
        testNodes,
      );
      expect(newState.selectedNodes.size).toBe(0);
    });

    it("SELECT_ALL selects all nodes", () => {
      const state = createInitialBoardState();
      const newState = boardReducer(state, { type: "SELECT_ALL" }, testNodes);
      expect(newState.selectedNodes.size).toBeGreaterThan(0);
      expect(newState.selectedNodes.has("col-a")).toBe(true);
      expect(newState.selectedNodes.has("card-1")).toBe(true);
    });
  });

  describe("folding", () => {
    it("TOGGLE_FOLD toggles fold state", () => {
      const state = createInitialBoardState();
      let newState = boardReducer(
        state,
        { type: "TOGGLE_FOLD", nodeId: "col-a" },
        testNodes,
      );
      expect(newState.foldedNodes.has("col-a")).toBe(true);
      newState = boardReducer(
        newState,
        { type: "TOGGLE_FOLD", nodeId: "col-a" },
        testNodes,
      );
      expect(newState.foldedNodes.has("col-a")).toBe(false);
    });

    it("CURSOR_DOWN skips children of folded nodes", () => {
      const state = createInitialBoardState(null, null, [0]);
      state.foldedNodes.add("col-a");
      const newState = boardReducer(state, { type: "CURSOR_DOWN" }, testNodes);
      // Should skip col-a's children and go to col-b
      expect(newState.cursor).toEqual([1]);
    });
  });

  describe("search", () => {
    it("SET_SEARCH_QUERY updates search query", () => {
      const state = createInitialBoardState();
      const newState = boardReducer(
        state,
        { type: "SET_SEARCH_QUERY", query: "test" },
        testNodes,
      );
      expect(newState.searchQuery).toBe("test");
    });
  });

  describe("cross-column navigation", () => {
    it("NAV_CROSS_COLUMN right moves to next column", () => {
      const state = createInitialBoardState(null, null, [0, 0]);
      const newState = boardReducer(
        state,
        { type: "NAV_CROSS_COLUMN", direction: "right" },
        testNodes,
      );
      expect(newState.cursor[0]).toBe(1); // col-b
    });

    it("NAV_CROSS_COLUMN left moves to previous column", () => {
      const state = createInitialBoardState(null, null, [1, 0]);
      const newState = boardReducer(
        state,
        { type: "NAV_CROSS_COLUMN", direction: "left" },
        testNodes,
      );
      expect(newState.cursor[0]).toBe(0); // col-a
    });

    it("NAV_CROSS_COLUMN preserves Y position when possible", () => {
      const state = createInitialBoardState(null, null, [0, 1]); // card-2
      const newState = boardReducer(
        state,
        { type: "NAV_CROSS_COLUMN", direction: "right" },
        testNodes,
      );
      // col-b only has 1 card, so clamp to 0
      expect(newState.cursor).toEqual([1, 0]);
    });
  });
});

describe("validateCursor", () => {
  it("returns same cursor if valid", () => {
    const cursor = validateCursor([0, 0], testNodes);
    expect(cursor).toEqual([0, 0]);
  });

  it("clamps out of bounds cursor", () => {
    const cursor = validateCursor([5, 5], testNodes);
    // Should clamp to valid range
    expect(cursor[0]).toBeLessThanOrEqual(testNodes.length - 1);
  });

  it("returns empty array for empty nodes", () => {
    const cursor = validateCursor([0, 0], []);
    expect(cursor).toEqual([]);
  });
});
