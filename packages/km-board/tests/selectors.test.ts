/**
 * Board Selectors Tests
 *
 * Tests for pure selector functions that derive values from BoardState.
 */

import { describe, it, expect } from "bun:test";
import {
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
  pathToColumnIndices,
  columnIndicesToPath,
  getCursorColumnIndices,
  getCurrentColumn,
  getCurrentCard,
  getCurrentColumnCardCount,
  createBoardState,
} from "../src/index.ts";
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

// Test tree structure:
// - Column A (col-a)
//   - Card 1 (card-1)
//     - Item 1.1 (item-1-1)
//     - Item 1.2 (item-1-2)
//   - Card 2 (card-2)
// - Column B (col-b)
//   - Card 3 (card-3)
// - Column C (col-c)  [empty column]
const testNodes: TNode[] = [
  createNode("col-a", [
    createNode("card-1", [createNode("item-1-1"), createNode("item-1-2")]),
    createNode("card-2"),
  ]),
  createNode("col-b", [createNode("card-3")]),
  createNode("col-c"),
];

function createTestState(cursor: number[] = [0, 0]): BoardState {
  return {
    ...createBoardState(testNodes),
    cursor,
    foldedNodes: new Set<string>(),
    collapsedNodes: new Set<string>(),
  };
}

describe("getCurrentNode", () => {
  it("returns the node at cursor position", () => {
    const state = createTestState([0, 0]);
    const node = getCurrentNode(state);
    expect(node?.id).toBe("card-1");
  });

  it("returns nested node when cursor is deep", () => {
    const state = createTestState([0, 0, 1]);
    const node = getCurrentNode(state);
    expect(node?.id).toBe("item-1-2");
  });

  it("returns null for invalid cursor", () => {
    const state = createTestState([99, 99]);
    const node = getCurrentNode(state);
    expect(node).toBeNull();
  });

  it("returns column node when cursor is at column level", () => {
    const state = createTestState([1]);
    const node = getCurrentNode(state);
    expect(node?.id).toBe("col-b");
  });
});

describe("getParentNode", () => {
  it("returns parent of current node", () => {
    const state = createTestState([0, 0]);
    const parent = getParentNode(state);
    expect(parent?.id).toBe("col-a");
  });

  it("returns null when at top level", () => {
    const state = createTestState([0]);
    const parent = getParentNode(state);
    expect(parent).toBeNull();
  });

  it("returns card when cursor is in nested item", () => {
    const state = createTestState([0, 0, 0]);
    const parent = getParentNode(state);
    expect(parent?.id).toBe("card-1");
  });
});

describe("getSiblings", () => {
  it("returns sibling cards at card level", () => {
    const state = createTestState([0, 0]);
    const siblings = getSiblings(state);
    expect(siblings.map((n) => n.id)).toEqual(["card-1", "card-2"]);
  });

  it("returns sibling items in nested level", () => {
    const state = createTestState([0, 0, 0]);
    const siblings = getSiblings(state);
    expect(siblings.map((n) => n.id)).toEqual(["item-1-1", "item-1-2"]);
  });

  it("returns top-level nodes when cursor is at column level", () => {
    const state = createTestState([0]);
    const siblings = getSiblings(state);
    expect(siblings.map((n) => n.id)).toEqual(["col-a", "col-b", "col-c"]);
  });

  it("returns empty array for empty cursor", () => {
    const state = createTestState([]);
    const siblings = getSiblings(state);
    expect(siblings).toEqual([]);
  });
});

describe("getCurrentIndex", () => {
  it("returns last index of cursor path", () => {
    const state = createTestState([0, 1]);
    expect(getCurrentIndex(state)).toBe(1);
  });

  it("returns 0 for single-element cursor", () => {
    const state = createTestState([0]);
    expect(getCurrentIndex(state)).toBe(0);
  });

  it("returns 0 for empty cursor", () => {
    const state = createTestState([]);
    expect(getCurrentIndex(state)).toBe(0);
  });

  it("returns correct index for deep cursor", () => {
    const state = createTestState([0, 0, 1]);
    expect(getCurrentIndex(state)).toBe(1);
  });
});

describe("canNavigateUp", () => {
  it("returns false when at first sibling", () => {
    const state = createTestState([0, 0]);
    expect(canNavigateUp(state)).toBe(false);
  });

  it("returns true when not at first sibling", () => {
    const state = createTestState([0, 1]);
    expect(canNavigateUp(state)).toBe(true);
  });

  it("returns true for second column", () => {
    const state = createTestState([1]);
    expect(canNavigateUp(state)).toBe(true);
  });
});

describe("canNavigateDown", () => {
  it("returns true when not at last sibling", () => {
    const state = createTestState([0, 0]);
    expect(canNavigateDown(state)).toBe(true);
  });

  it("returns false when at last sibling", () => {
    const state = createTestState([0, 1]);
    expect(canNavigateDown(state)).toBe(false);
  });

  it("returns true for first column (has more columns)", () => {
    const state = createTestState([0]);
    expect(canNavigateDown(state)).toBe(true);
  });

  it("returns false for last column", () => {
    const state = createTestState([2]);
    expect(canNavigateDown(state)).toBe(false);
  });
});

describe("canNavigateParent", () => {
  it("returns true when cursor has depth > 1", () => {
    const state = createTestState([0, 0]);
    expect(canNavigateParent(state)).toBe(true);
  });

  it("returns false when cursor is at top level", () => {
    const state = createTestState([0]);
    expect(canNavigateParent(state)).toBe(false);
  });

  it("returns true for deeply nested cursor", () => {
    const state = createTestState([0, 0, 0]);
    expect(canNavigateParent(state)).toBe(true);
  });
});

describe("canNavigateChild", () => {
  it("returns true when current node has children", () => {
    const state = createTestState([0, 0]);
    expect(canNavigateChild(state)).toBe(true);
  });

  it("returns false when current node has no children", () => {
    const state = createTestState([0, 1]);
    expect(canNavigateChild(state)).toBe(false);
  });

  it("returns true for column with cards", () => {
    const state = createTestState([0]);
    expect(canNavigateChild(state)).toBe(true);
  });

  it("returns false for empty column", () => {
    const state = createTestState([2]);
    expect(canNavigateChild(state)).toBe(false);
  });
});

describe("isNodeFolded", () => {
  it("returns true for folded node", () => {
    const state = createTestState([0, 0]);
    state.foldedNodes.add("card-1");
    expect(isNodeFolded(state, "card-1")).toBe(true);
  });

  it("returns false for non-folded node", () => {
    const state = createTestState([0, 0]);
    expect(isNodeFolded(state, "card-1")).toBe(false);
  });
});

describe("isNodeCollapsed", () => {
  it("returns true for collapsed node", () => {
    const state = createTestState([0, 0]);
    state.collapsedNodes.add("col-a");
    expect(isNodeCollapsed(state, "col-a")).toBe(true);
  });

  it("returns false for non-collapsed node", () => {
    const state = createTestState([0, 0]);
    expect(isNodeCollapsed(state, "col-a")).toBe(false);
  });
});

describe("getTotalNodeCount", () => {
  it("counts all nodes recursively", () => {
    const state = createTestState([0, 0]);
    // col-a(1) + card-1(1) + item-1-1(1) + item-1-2(1) + card-2(1) + col-b(1) + card-3(1) + col-c(1) = 8
    expect(getTotalNodeCount(state)).toBe(8);
  });

  it("returns 0 for empty nodes", () => {
    const state = { ...createTestState([]), nodes: [] };
    expect(getTotalNodeCount(state)).toBe(0);
  });
});

describe("getTopLevelCount", () => {
  it("returns count of top-level nodes", () => {
    const state = createTestState([0, 0]);
    expect(getTopLevelCount(state)).toBe(3);
  });

  it("returns 0 for empty nodes", () => {
    const state = { ...createTestState([]), nodes: [] };
    expect(getTopLevelCount(state)).toBe(0);
  });
});

describe("getCursorDepth", () => {
  it("returns 0 for column level", () => {
    const state = createTestState([0]);
    expect(getCursorDepth(state)).toBe(0);
  });

  it("returns 1 for card level", () => {
    const state = createTestState([0, 0]);
    expect(getCursorDepth(state)).toBe(1);
  });

  it("returns 2 for nested item level", () => {
    const state = createTestState([0, 0, 0]);
    expect(getCursorDepth(state)).toBe(2);
  });

  it("returns 0 for empty cursor", () => {
    const state = createTestState([]);
    expect(getCursorDepth(state)).toBe(0);
  });
});

describe("getBreadcrumbs", () => {
  it("returns path from root to current node", () => {
    const state = createTestState([0, 0, 1]);
    const crumbs = getBreadcrumbs(state);
    expect(crumbs.map((n) => n.id)).toEqual(["col-a", "card-1", "item-1-2"]);
  });

  it("returns single item for column level", () => {
    const state = createTestState([1]);
    const crumbs = getBreadcrumbs(state);
    expect(crumbs.map((n) => n.id)).toEqual(["col-b"]);
  });

  it("returns empty array for empty cursor", () => {
    const state = createTestState([]);
    const crumbs = getBreadcrumbs(state);
    expect(crumbs).toEqual([]);
  });
});

describe("pathToColumnIndices", () => {
  it("converts empty path", () => {
    const result = pathToColumnIndices([]);
    expect(result).toEqual({
      colIndex: -1,
      cardIndex: -1,
      subPath: [],
      isAtCardLevel: false,
      isInOutlineMode: false,
    });
  });

  it("converts column-level path", () => {
    const result = pathToColumnIndices([1]);
    expect(result).toEqual({
      colIndex: 1,
      cardIndex: -1,
      subPath: [],
      isAtCardLevel: false,
      isInOutlineMode: false,
    });
  });

  it("converts card-level path", () => {
    const result = pathToColumnIndices([0, 2]);
    expect(result).toEqual({
      colIndex: 0,
      cardIndex: 2,
      subPath: [],
      isAtCardLevel: true,
      isInOutlineMode: false,
    });
  });

  it("converts outline-mode path", () => {
    const result = pathToColumnIndices([0, 0, 1, 2]);
    expect(result).toEqual({
      colIndex: 0,
      cardIndex: 0,
      subPath: [1, 2],
      isAtCardLevel: true,
      isInOutlineMode: true,
    });
  });
});

describe("columnIndicesToPath", () => {
  it("converts negative colIndex to empty path", () => {
    expect(columnIndicesToPath(-1)).toEqual([]);
  });

  it("converts column-only indices", () => {
    expect(columnIndicesToPath(2)).toEqual([2]);
  });

  it("converts column and card indices", () => {
    expect(columnIndicesToPath(1, 3)).toEqual([1, 3]);
  });

  it("converts full indices with subPath", () => {
    expect(columnIndicesToPath(0, 0, [1, 2])).toEqual([0, 0, 1, 2]);
  });

  it("ignores subPath when cardIndex is negative", () => {
    expect(columnIndicesToPath(1, -1, [1, 2])).toEqual([1]);
  });
});

describe("getCursorColumnIndices", () => {
  it("extracts indices from state cursor", () => {
    const state = createTestState([1, 2]);
    const result = getCursorColumnIndices(state);
    expect(result.colIndex).toBe(1);
    expect(result.cardIndex).toBe(2);
  });
});

describe("getCurrentColumn", () => {
  it("returns column node at cursor position", () => {
    const state = createTestState([1, 0]);
    const column = getCurrentColumn(state);
    expect(column?.id).toBe("col-b");
  });

  it("returns null for empty cursor", () => {
    const state = createTestState([]);
    const column = getCurrentColumn(state);
    expect(column).toBeNull();
  });
});

describe("getCurrentCard", () => {
  it("returns card node at cursor position", () => {
    const state = createTestState([0, 1]);
    const card = getCurrentCard(state);
    expect(card?.id).toBe("card-2");
  });

  it("returns null when cursor is at column level", () => {
    const state = createTestState([0]);
    const card = getCurrentCard(state);
    expect(card).toBeNull();
  });

  it("returns card for nested cursor (outline mode)", () => {
    const state = createTestState([0, 0, 0]);
    const card = getCurrentCard(state);
    expect(card?.id).toBe("card-1");
  });
});

describe("getCurrentColumnCardCount", () => {
  it("returns card count in current column", () => {
    const state = createTestState([0, 0]);
    expect(getCurrentColumnCardCount(state)).toBe(2);
  });

  it("returns 0 for empty column", () => {
    const state = createTestState([2]);
    expect(getCurrentColumnCardCount(state)).toBe(0);
  });

  it("returns correct count for single-card column", () => {
    const state = createTestState([1, 0]);
    expect(getCurrentColumnCardCount(state)).toBe(1);
  });
});
