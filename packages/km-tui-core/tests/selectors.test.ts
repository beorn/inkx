/**
 * Selectors Tests
 *
 * Unit tests for the pure selector functions.
 */

import { describe, test, expect } from "bun:test";
import {
  createInitialTreeState,
  getCurrentNode,
  getParentNode,
  getSiblings,
  getCurrentIndex,
  canNavigateUp,
  canNavigateDown,
  canNavigateParent,
  canNavigateChild,
  isNodeFolded,
  isNodeCollapsed,
  getTotalNodeCount,
  getTopLevelCount,
  getCursorDepth,
  getBreadcrumbs,
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

describe("getCurrentNode", () => {
  test("returns the node at cursor path", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0];
    const node = getCurrentNode(state);
    expect(node?.nodeId).toBe("col1");
  });

  test("returns nested node for deep cursor", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 1];
    const node = getCurrentNode(state);
    expect(node?.nodeId).toBe("card2");
  });

  test("returns deeply nested node", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 1, 0];
    const node = getCurrentNode(state);
    expect(node?.nodeId).toBe("subcard1");
  });

  test("returns null when no nodes exist", () => {
    const state = createInitialTreeState([]);
    const node = getCurrentNode(state);
    expect(node).toBe(null);
  });

  test("returns null when cursor is out of bounds", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [10];
    const node = getCurrentNode(state);
    expect(node).toBe(null);
  });
});

describe("getParentNode", () => {
  test("returns parent of nested node", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 1]; // card2
    const parent = getParentNode(state);
    expect(parent?.nodeId).toBe("col1");
  });

  test("returns null for top-level node", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0]; // col1
    const parent = getParentNode(state);
    expect(parent).toBe(null);
  });

  test("returns parent of deeply nested node", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 1, 0]; // subcard1
    const parent = getParentNode(state);
    expect(parent?.nodeId).toBe("card2");
  });
});

describe("getSiblings", () => {
  test("returns siblings at current level", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 1]; // card2
    const siblings = getSiblings(state);
    expect(siblings).toHaveLength(3);
    expect(siblings[0]?.nodeId).toBe("card1");
    expect(siblings[1]?.nodeId).toBe("card2");
    expect(siblings[2]?.nodeId).toBe("card3");
  });

  test("returns top-level nodes for single-element path", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0]; // col1
    const siblings = getSiblings(state);
    expect(siblings).toHaveLength(2);
    expect(siblings[0]?.nodeId).toBe("col1");
    expect(siblings[1]?.nodeId).toBe("col2");
  });

  test("returns empty array for empty path", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [];
    const siblings = getSiblings(state);
    expect(siblings).toEqual([]);
  });
});

describe("getCurrentIndex", () => {
  test("returns last element of cursor", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 2];
    expect(getCurrentIndex(state)).toBe(2);
  });

  test("returns 0 for single-element cursor", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0];
    expect(getCurrentIndex(state)).toBe(0);
  });

  test("returns 0 for empty cursor", () => {
    const state = createInitialTreeState([]);
    expect(getCurrentIndex(state)).toBe(0);
  });
});

describe("canNavigateUp", () => {
  test("returns true when index > 0", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 1]; // card2
    expect(canNavigateUp(state)).toBe(true);
  });

  test("returns false when index is 0", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 0]; // card1
    expect(canNavigateUp(state)).toBe(false);
  });
});

describe("canNavigateDown", () => {
  test("returns true when not at last sibling", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 0]; // card1
    expect(canNavigateDown(state)).toBe(true);
  });

  test("returns false when at last sibling", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 2]; // card3
    expect(canNavigateDown(state)).toBe(false);
  });
});

describe("canNavigateParent", () => {
  test("returns true when depth > 1", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 1]; // card2
    expect(canNavigateParent(state)).toBe(true);
  });

  test("returns false when at top level", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0]; // col1
    expect(canNavigateParent(state)).toBe(false);
  });
});

describe("canNavigateChild", () => {
  test("returns true when node has children", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 1]; // card2 has children
    expect(canNavigateChild(state)).toBe(true);
  });

  test("returns false when node has no children", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 0]; // card1 has no children
    expect(canNavigateChild(state)).toBe(false);
  });
});

describe("isNodeFolded", () => {
  test("returns true when node is in foldedNodes set", () => {
    const state = createInitialTreeState(createTestNodes());
    state.foldedNodes.add("card1");
    expect(isNodeFolded(state, "card1")).toBe(true);
  });

  test("returns false when node is not in foldedNodes set", () => {
    const state = createInitialTreeState(createTestNodes());
    expect(isNodeFolded(state, "card1")).toBe(false);
  });
});

describe("isNodeCollapsed", () => {
  test("returns true when node is in collapsedNodes set", () => {
    const state = createInitialTreeState(createTestNodes());
    state.collapsedNodes.add("col1");
    expect(isNodeCollapsed(state, "col1")).toBe(true);
  });

  test("returns false when node is not collapsed", () => {
    const state = createInitialTreeState(createTestNodes());
    expect(isNodeCollapsed(state, "col1")).toBe(false);
  });
});

describe("getTotalNodeCount", () => {
  test("returns total count of all nodes recursively", () => {
    const state = createInitialTreeState(createTestNodes());
    // 2 columns + 3 cards in col1 + 2 subcards + 2 cards in col2 = 9
    expect(getTotalNodeCount(state)).toBe(9);
  });

  test("returns 0 when no nodes", () => {
    const state = createInitialTreeState([]);
    expect(getTotalNodeCount(state)).toBe(0);
  });
});

describe("getTopLevelCount", () => {
  test("returns count of top-level nodes", () => {
    const state = createInitialTreeState(createTestNodes());
    expect(getTopLevelCount(state)).toBe(2);
  });

  test("returns 0 when no nodes", () => {
    const state = createInitialTreeState([]);
    expect(getTopLevelCount(state)).toBe(0);
  });
});

describe("getCursorDepth", () => {
  test("returns 0 for top-level cursor", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0];
    expect(getCursorDepth(state)).toBe(0);
  });

  test("returns depth - 1 for nested cursor", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 1];
    expect(getCursorDepth(state)).toBe(1);
  });

  test("returns depth for deeply nested cursor", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 1, 0];
    expect(getCursorDepth(state)).toBe(2);
  });
});

describe("getBreadcrumbs", () => {
  test("returns path from root to current node", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0, 1, 0]; // subcard1
    const crumbs = getBreadcrumbs(state);
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]?.nodeId).toBe("col1");
    expect(crumbs[1]?.nodeId).toBe("card2");
    expect(crumbs[2]?.nodeId).toBe("subcard1");
  });

  test("returns single node for top-level cursor", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [0];
    const crumbs = getBreadcrumbs(state);
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0]?.nodeId).toBe("col1");
  });

  test("returns empty array for empty cursor", () => {
    const state = createInitialTreeState(createTestNodes());
    state.cursor = [];
    const crumbs = getBreadcrumbs(state);
    expect(crumbs).toEqual([]);
  });
});
