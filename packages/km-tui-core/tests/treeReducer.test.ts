/**
 * treeReducer Tests
 *
 * Unit tests for the path-based tree state reducer.
 */

import { describe, test, expect } from "bun:test";
import {
  treeReducer,
  createInitialTreeState,
  getNodeAtPath,
  getSiblingCount,
  type TreeNodeState,
} from "../src/index.ts";

function createTestNodes(): TreeNodeState[] {
  return [
    {
      nodeId: "col1",
      title: "Column 1",
      depth: 0,
      childCount: 3,
      isTask: false,
      children: [
        {
          nodeId: "card1",
          title: "Card 1",
          depth: 1,
          childCount: 0,
          isTask: false,
          children: [],
        },
        {
          nodeId: "card2",
          title: "Card 2",
          depth: 1,
          childCount: 2,
          isTask: true,
          taskStatus: "todo",
          children: [
            {
              nodeId: "subcard1",
              title: "Subcard 1",
              depth: 2,
              childCount: 0,
              isTask: false,
              children: [],
            },
            {
              nodeId: "subcard2",
              title: "Subcard 2",
              depth: 2,
              childCount: 0,
              isTask: false,
              children: [],
            },
          ],
        },
        {
          nodeId: "card3",
          title: "Card 3",
          depth: 1,
          childCount: 0,
          isTask: false,
          children: [],
        },
      ],
    },
    {
      nodeId: "col2",
      title: "Column 2",
      depth: 0,
      childCount: 2,
      isTask: false,
      children: [
        {
          nodeId: "card4",
          title: "Card 4",
          depth: 1,
          childCount: 1,
          isTask: true,
          taskStatus: "wip",
          children: [],
        },
        {
          nodeId: "card5",
          title: "Card 5",
          depth: 1,
          childCount: 0,
          isTask: false,
          children: [],
        },
      ],
    },
  ];
}

describe("getNodeAtPath", () => {
  const nodes = createTestNodes();

  test("returns null for empty path", () => {
    expect(getNodeAtPath(nodes, [])).toBe(null);
  });

  test("returns top-level node for single-element path", () => {
    const node = getNodeAtPath(nodes, [0]);
    expect(node?.nodeId).toBe("col1");
  });

  test("returns nested node for multi-element path", () => {
    const node = getNodeAtPath(nodes, [0, 1]);
    expect(node?.nodeId).toBe("card2");
  });

  test("returns deeply nested node", () => {
    const node = getNodeAtPath(nodes, [0, 1, 0]);
    expect(node?.nodeId).toBe("subcard1");
  });

  test("returns null for invalid path", () => {
    expect(getNodeAtPath(nodes, [99])).toBe(null);
    expect(getNodeAtPath(nodes, [0, 99])).toBe(null);
  });
});

describe("getSiblingCount", () => {
  const nodes = createTestNodes();

  test("returns 0 for empty path", () => {
    expect(getSiblingCount(nodes, [])).toBe(0);
  });

  test("returns node count for single-element path", () => {
    expect(getSiblingCount(nodes, [0])).toBe(2);
  });

  test("returns sibling count for nested path", () => {
    expect(getSiblingCount(nodes, [0, 1])).toBe(3); // col1 has 3 children
  });

  test("returns sibling count for deep path", () => {
    expect(getSiblingCount(nodes, [0, 1, 0])).toBe(2); // card2 has 2 children
  });
});

describe("treeReducer", () => {
  describe("NAV_PREV_SIBLING", () => {
    test("decreases last index when not at first", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 2]; // card3
      const next = treeReducer(state, { type: "NAV_PREV_SIBLING" });
      expect(next.cursor).toEqual([0, 1]);
    });

    test("is no-op when at first sibling", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 0]; // card1
      const next = treeReducer(state, { type: "NAV_PREV_SIBLING" });
      expect(next.cursor).toEqual([0, 0]);
    });
  });

  describe("NAV_NEXT_SIBLING", () => {
    test("increases last index when not at last", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 0]; // card1
      const next = treeReducer(state, { type: "NAV_NEXT_SIBLING" });
      expect(next.cursor).toEqual([0, 1]);
    });

    test("is no-op when at last sibling", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 2]; // card3
      const next = treeReducer(state, { type: "NAV_NEXT_SIBLING" });
      expect(next.cursor).toEqual([0, 2]);
    });
  });

  describe("NAV_PARENT", () => {
    test("removes last element from path", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 1, 0]; // subcard1
      const next = treeReducer(state, { type: "NAV_PARENT" });
      expect(next.cursor).toEqual([0, 1]);
    });

    test("is no-op when at top level", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0]; // col1
      const next = treeReducer(state, { type: "NAV_PARENT" });
      expect(next.cursor).toEqual([0]); // Unchanged
    });
  });

  describe("NAV_CHILD", () => {
    test("enters first child", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 1]; // card2 (has children)
      const next = treeReducer(state, { type: "NAV_CHILD" });
      expect(next.cursor).toEqual([0, 1, 0]);
    });

    test("is no-op when node has no children", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 0]; // card1 (no children)
      const next = treeReducer(state, { type: "NAV_CHILD" });
      expect(next.cursor).toEqual([0, 0]);
    });
  });

  describe("NAV_TO_PATH", () => {
    test("jumps to valid path", () => {
      const state = createInitialTreeState(createTestNodes());
      const next = treeReducer(state, {
        type: "NAV_TO_PATH",
        path: [1, 1],
      });
      expect(next.cursor).toEqual([1, 1]);
    });

    test("is no-op for invalid path", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0];
      const next = treeReducer(state, {
        type: "NAV_TO_PATH",
        path: [99, 99],
      });
      expect(next.cursor).toEqual([0]);
    });
  });

  describe("MOVE_UP (legacy)", () => {
    test("maps to NAV_PREV_SIBLING", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 1];
      const next = treeReducer(state, { type: "MOVE_UP" });
      expect(next.cursor).toEqual([0, 0]);
    });
  });

  describe("MOVE_DOWN (legacy)", () => {
    test("maps to NAV_NEXT_SIBLING", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 0];
      const next = treeReducer(state, { type: "MOVE_DOWN" });
      expect(next.cursor).toEqual([0, 1]);
    });
  });

  describe("MOVE_LEFT (legacy)", () => {
    test("goes to parent when deep", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 1, 0]; // subcard1
      const next = treeReducer(state, { type: "MOVE_LEFT" });
      expect(next.cursor).toEqual([0, 1]); // card2
    });

    test("goes to previous column at top level", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [1]; // col2
      const next = treeReducer(state, { type: "MOVE_LEFT" });
      expect(next.cursor).toEqual([0]); // col1
    });

    test("is no-op at first column", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0]; // col1
      const next = treeReducer(state, { type: "MOVE_LEFT" });
      expect(next.cursor).toEqual([0]);
    });
  });

  describe("MOVE_RIGHT (legacy)", () => {
    test("goes to next column at top level", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0]; // col1
      const next = treeReducer(state, { type: "MOVE_RIGHT" });
      expect(next.cursor).toEqual([1]); // col2
    });

    test("enters child when not at top level", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 1]; // card2 (has children)
      const next = treeReducer(state, { type: "MOVE_RIGHT" });
      expect(next.cursor).toEqual([0, 1, 0]); // subcard1
    });
  });

  describe("JUMP_TOP", () => {
    test("jumps to first sibling", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 2];
      const next = treeReducer(state, { type: "JUMP_TOP" });
      expect(next.cursor).toEqual([0, 0]);
    });
  });

  describe("JUMP_BOTTOM", () => {
    test("jumps to last sibling", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 0];
      const next = treeReducer(state, { type: "JUMP_BOTTOM" });
      expect(next.cursor).toEqual([0, 2]);
    });
  });

  describe("TOGGLE_FOLD", () => {
    test("adds node to foldedNodes", () => {
      const state = createInitialTreeState(createTestNodes());
      const next = treeReducer(state, {
        type: "TOGGLE_FOLD",
        nodeId: "card1",
      });
      expect(next.foldedNodes.has("card1")).toBe(true);
    });

    test("removes node from foldedNodes if already folded", () => {
      const state = createInitialTreeState(createTestNodes());
      state.foldedNodes.add("card1");
      const next = treeReducer(state, {
        type: "TOGGLE_FOLD",
        nodeId: "card1",
      });
      expect(next.foldedNodes.has("card1")).toBe(false);
    });
  });

  describe("ZOOM_IN", () => {
    test("sets rootId and nodes, resets cursor", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 1];
      const col1 = createTestNodes()[0];
      const newNodes = col1 ? col1.children : [];
      const next = treeReducer(state, {
        type: "ZOOM_IN",
        nodeId: "card2",
        nodes: newNodes,
      });
      expect(next.rootId).toBe("card2");
      expect(next.nodes).toBe(newNodes);
      expect(next.cursor).toEqual([0]);
      expect(next.zoomStack.length).toBe(1);
      const zs0 = next.zoomStack[0];
      expect(zs0?.rootId).toBe(null);
      expect(zs0?.cursor).toEqual([0, 1]);
    });
  });

  describe("ZOOM_OUT", () => {
    test("restores previous root and cursor", () => {
      const state = createInitialTreeState(createTestNodes());
      state.rootId = "card2";
      state.zoomStack = [{ rootId: null, cursor: [0, 1] }];
      const originalNodes = createTestNodes();
      const next = treeReducer(state, {
        type: "ZOOM_OUT",
        nodes: originalNodes,
      });
      expect(next.rootId).toBe(null);
      expect(next.nodes).toBe(originalNodes);
      expect(next.cursor).toEqual([0, 1]);
      expect(next.zoomStack.length).toBe(0);
    });

    test("is no-op when zoomStack is empty", () => {
      const state = createInitialTreeState(createTestNodes());
      const next = treeReducer(state, {
        type: "ZOOM_OUT",
        nodes: createTestNodes(),
      });
      expect(next.rootId).toBe(null);
      expect(next.zoomStack.length).toBe(0);
    });
  });

  describe("REFRESH", () => {
    test("replaces nodes, preserves cursor if valid", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 1];
      const newNodes = createTestNodes();
      const next = treeReducer(state, { type: "REFRESH", nodes: newNodes });
      expect(next.nodes).toBe(newNodes);
      expect(next.cursor).toEqual([0, 1]);
    });

    test("resets cursor to [0] if path invalid", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [5, 10]; // Invalid
      const newNodes = createTestNodes();
      const next = treeReducer(state, { type: "REFRESH", nodes: newNodes });
      expect(next.cursor).toEqual([0]);
    });
  });

  describe("Selection", () => {
    test("SELECT_NODE_ADD adds node to selection", () => {
      const state = createInitialTreeState(createTestNodes());
      const next = treeReducer(state, {
        type: "SELECT_NODE_ADD",
        nodeId: "card1",
      });
      expect(next.selectedNodes.has("card1")).toBe(true);
    });

    test("SELECT_NODE_TOGGLE toggles selection", () => {
      const state = createInitialTreeState(createTestNodes());
      let next = treeReducer(state, {
        type: "SELECT_NODE_TOGGLE",
        nodeId: "card1",
      });
      expect(next.selectedNodes.has("card1")).toBe(true);
      next = treeReducer(next, {
        type: "SELECT_NODE_TOGGLE",
        nodeId: "card1",
      });
      expect(next.selectedNodes.has("card1")).toBe(false);
    });

    test("SELECT_ALL_SIBLINGS selects all siblings", () => {
      const state = createInitialTreeState(createTestNodes());
      state.cursor = [0, 1]; // card2
      const next = treeReducer(state, { type: "SELECT_ALL_SIBLINGS" });
      expect(next.selectedNodes.has("card1")).toBe(true);
      expect(next.selectedNodes.has("card2")).toBe(true);
      expect(next.selectedNodes.has("card3")).toBe(true);
      // Not in siblings
      expect(next.selectedNodes.has("col1")).toBe(false);
    });

    test("SELECT_ALL selects all nodes", () => {
      const state = createInitialTreeState(createTestNodes());
      const next = treeReducer(state, { type: "SELECT_ALL" });
      expect(next.selectedNodes.size).toBeGreaterThan(5);
      expect(next.selectedNodes.has("col1")).toBe(true);
      expect(next.selectedNodes.has("subcard1")).toBe(true);
    });

    test("CLEAR_SELECTION clears selection", () => {
      const state = createInitialTreeState(createTestNodes());
      state.selectedNodes.add("card1");
      state.selectedNodes.add("card2");
      const next = treeReducer(state, { type: "CLEAR_SELECTION" });
      expect(next.selectedNodes.size).toBe(0);
    });
  });
});

describe("createInitialTreeState", () => {
  test("creates initial state with defaults", () => {
    const nodes = createTestNodes();
    const state = createInitialTreeState(nodes);

    expect(state.nodes).toBe(nodes);
    expect(state.cursor).toEqual([0]);
    expect(state.rootId).toBe(null);
    expect(state.rootPath).toBe(null);
    expect(state.selectedNodes.size).toBe(0);
    expect(state.foldedNodes.size).toBe(0);
    expect(state.collapsedNodes.size).toBe(0);
    expect(state.searchQuery).toBe("");
    expect(state.searchMode).toBe(false);
    expect(state.helpMode).toBe(false);
    expect(state.zoomStack).toEqual([]);
  });

  test("accepts rootId and rootPath", () => {
    const state = createInitialTreeState([], "root-123", "/path/to/tree");
    expect(state.rootId).toBe("root-123");
    expect(state.rootPath).toBe("/path/to/tree");
    expect(state.cursor).toEqual([]); // Empty for empty nodes
  });
});
