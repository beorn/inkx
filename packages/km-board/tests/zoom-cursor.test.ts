/**
 * Zoom Cursor Preservation Tests
 *
 * Tests that zoom operations preserve cursor position correctly.
 * Issue km-k5k3: When zooming into a node that becomes a column,
 * the cursor should stay on that node (at column level), not jump to a card.
 */

import { describe, it, expect } from "bun:test";
import {
  boardReducer,
  createBoardState,
  findPathToNode,
} from "../src/index.ts";
import type { BoardState, TNode } from "../src/index.ts";

// Helper to create test nodes with proper structure
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
    isTask: false,
    depth: 0,
    data: {},
    created_at: 0,
    updated_at: 0,
    version: "",
    ...overrides,
  };
}

describe("ZOOM_IN cursor preservation", () => {
  it("preserves cursor at column level when target becomes a column", () => {
    // Setup: Tree where node X has children and will become a column
    // Before zoom: root=A, columns=[B, C], cursor on card X under B
    // After zoom: root=B, columns=[X, Y], cursor should be on column X (not card under X)

    // Initial state: viewing node A with columns B and C
    const initialNodes = [
      createNode("B", [createNode("X", [createNode("X1"), createNode("X2")])]),
      createNode("C", [createNode("Y")]),
    ];
    const initialState: BoardState = {
      ...createBoardState(initialNodes, "A"),
      cursor: [0, 0], // On card X (column 0, card 0)
    };

    // Zoom in: X becomes a column (because it has children)
    // New root should be B (X's parent), so X becomes a top-level column
    const newNodes = [
      createNode("X", [createNode("X1"), createNode("X2")]),
      createNode("other-sibling"),
    ];

    const result = boardReducer(initialState, {
      type: "ZOOM_IN",
      nodeId: "B",
      nodes: newNodes,
      cursor: [0], // Column level - X is at index 0
    });

    // Cursor should be [0] (column level), not [0, 0] (card level)
    expect(result.cursor).toEqual([0]);
    expect(result.rootId).toBe("B");
  });

  it("preserves cursor at card level when target remains a card", () => {
    // Setup: Tree where node X has NO children, stays as a card
    const initialNodes = [
      createNode("B", [createNode("X"), createNode("Y")]),
      createNode("C"),
    ];
    const initialState: BoardState = {
      ...createBoardState(initialNodes, "A"),
      cursor: [0, 0], // On card X
    };

    // After zoom, X is still a card (no children, so it stays in card position)
    const newNodes = [createNode("B", [createNode("X"), createNode("Y")])];

    const result = boardReducer(initialState, {
      type: "ZOOM_IN",
      nodeId: "A",
      nodes: newNodes,
      cursor: [0, 0], // Card level - X is at column 0, card 0
    });

    expect(result.cursor).toEqual([0, 0]);
  });

  it("accepts null nodeId for root level zoom", () => {
    const initialNodes = [createNode("A"), createNode("B")];
    const initialState: BoardState = {
      ...createBoardState(initialNodes, "some-root"),
      cursor: [0],
    };

    const result = boardReducer(initialState, {
      type: "ZOOM_IN",
      nodeId: null,
      nodes: initialNodes,
      cursor: [1],
    });

    expect(result.rootId).toBeNull();
    expect(result.cursor).toEqual([1]);
  });

  it("preserves cursorNodeId when cursor is not provided to ZOOM_IN", () => {
    // When ZOOM_IN is called WITHOUT a cursor, cursorNodeId should be preserved
    const initialNodes = [
      createNode("col-A", [createNode("card-X"), createNode("card-Y")]),
    ];
    const initialState: BoardState = {
      ...createBoardState(initialNodes, "root"),
      cursor: [0, 0],
      cursorNodeId: "card-X",
    };

    // Zoom without providing cursor - cursorNodeId should stay the same
    const newNodes = [createNode("card-X"), createNode("card-Y")];
    const result = boardReducer(initialState, {
      type: "ZOOM_IN",
      nodeId: "col-A",
      nodes: newNodes,
      // NO cursor provided - this is the key!
    });

    // cursorNodeId should be preserved (not changed)
    expect(result.cursorNodeId).toBe("card-X");
  });

});

describe("cursorNodeId-based cursor derivation", () => {
  it("derives cursor from cursorNodeId when node is in new tree", () => {
    // When ZOOM_IN doesn't provide cursor, and cursorNodeId is in the new tree,
    // the cursor should be derivable from cursorNodeId via findPathToNode
    const initialNodes = [
      createNode("col-A", [createNode("card-X"), createNode("card-Y")]),
      createNode("col-B", [createNode("card-Z")]),
    ];
    const initialState: BoardState = {
      ...createBoardState(initialNodes, "root"),
      cursor: [0, 0],
      cursorNodeId: "card-X", // Card X is selected
    };

    // Zoom to col-A - card-X becomes a top-level node (column)
    const newNodes = [createNode("card-X"), createNode("card-Y")];
    const result = boardReducer(initialState, {
      type: "ZOOM_IN",
      nodeId: "col-A",
      nodes: newNodes,
      // NO cursor provided - cursorNodeId is preserved
    });

    // cursorNodeId preserved
    expect(result.cursorNodeId).toBe("card-X");

    // Now verify we can find the path to cursorNodeId in the new tree
    const pathToSelected = findPathToNode(result.nodes, result.cursorNodeId!);
    expect(pathToSelected).toEqual([0]); // card-X is now at column index 0
  });

  it("handles cursorNodeId not in new tree (graceful fallback)", () => {
    // When the cursor node is NOT in the new tree after zoom,
    // the cursor defaults to [0] and cursorNodeId is still preserved
    // (it's up to the UI layer to detect this and potentially update)
    const initialNodes = [
      createNode("col-A", [createNode("card-X")]),
      createNode("col-B", [createNode("card-Z")]),
    ];
    const initialState: BoardState = {
      ...createBoardState(initialNodes, "root"),
      cursor: [1, 0],
      cursorNodeId: "card-Z", // Card Z is selected (in col-B)
    };

    // Zoom to col-A - card-Z is NOT in this subtree
    const newNodes = [createNode("card-X")];
    const result = boardReducer(initialState, {
      type: "ZOOM_IN",
      nodeId: "col-A",
      nodes: newNodes,
      // NO cursor provided
    });

    // cursorNodeId is preserved even though it's not in the new tree
    expect(result.cursorNodeId).toBe("card-Z");

    // But findPathToNode will return null for the missing node
    const pathToSelected = findPathToNode(result.nodes, result.cursorNodeId!);
    expect(pathToSelected).toBeNull();

    // Cursor defaults to [0] when not provided
    expect(result.cursor).toEqual([0]);
  });
});

describe("findPathToNode", () => {
  it("finds path to top-level node", () => {
    const nodes = [createNode("A"), createNode("B"), createNode("C")];
    expect(findPathToNode(nodes, "A")).toEqual([0]);
    expect(findPathToNode(nodes, "B")).toEqual([1]);
    expect(findPathToNode(nodes, "C")).toEqual([2]);
  });

  it("finds path to nested node", () => {
    const nodes = [
      createNode("col-A", [
        createNode("card-1"),
        createNode("card-2", [createNode("sub-1"), createNode("sub-2")]),
      ]),
      createNode("col-B"),
    ];

    expect(findPathToNode(nodes, "col-A")).toEqual([0]);
    expect(findPathToNode(nodes, "card-1")).toEqual([0, 0]);
    expect(findPathToNode(nodes, "card-2")).toEqual([0, 1]);
    expect(findPathToNode(nodes, "sub-1")).toEqual([0, 1, 0]);
    expect(findPathToNode(nodes, "sub-2")).toEqual([0, 1, 1]);
    expect(findPathToNode(nodes, "col-B")).toEqual([1]);
  });

  it("returns null for non-existent node", () => {
    const nodes = [createNode("A"), createNode("B")];
    expect(findPathToNode(nodes, "non-existent")).toBeNull();
  });

  it("returns null for empty tree", () => {
    expect(findPathToNode([], "any-id")).toBeNull();
  });
});
