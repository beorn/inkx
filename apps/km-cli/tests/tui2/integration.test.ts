/**
 * TUI2 Integration Tests
 *
 * Tests the full flow from store data through state management
 * to view models. Verifies the architecture layers work together:
 *
 * Store Layer (km-storage) -> State Layer (km-board) -> View Layer (km-ink/km-opentui)
 */

import { describe, it, expect } from "bun:test";

// Import from @km/board - the shared state management layer
import {
  treeReducer,
  createInitialTreeState,
  getCurrentNode,
  getParentNode,
  getSiblings,
  canNavigateUp,
  canNavigateDown,
  canNavigateParent,
  canNavigateChild,
  isNodeFolded,
  isNodeCollapsed,
  getTotalNodeCount,
  toNodeViewModel,
  toTreeViewModel,
  type TreeState,
  type TNode,
} from "@km/board";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock node state for testing
 */
function mockNode(
  id: string,
  title: string,
  children: TNode[] = [],
  options: Partial<TNode> = {},
): TNode {
  return {
    nodeId: id,
    title,
    children,
    childCount: children.length,
    isTask: true,
    depth: 0,
    ...options,
  };
}

/**
 * Create a sample tree state for testing (mimics board/column/card structure)
 */
function createTestTree(): TreeState {
  const todoItems = [
    mockNode("item-1", "Setup CI pipeline", [], {
      taskStatus: "todo",
      depth: 1,
    }),
    mockNode("item-2", "Write documentation", [], {
      taskStatus: "todo",
      depth: 1,
    }),
    mockNode("item-3", "Review PR", [], { taskStatus: "todo", depth: 1 }),
  ];

  const wipItems = [
    mockNode("item-4", "Implement auth", [], {
      taskStatus: "wip",
      depth: 1,
      childCount: 3,
    }),
    mockNode("item-5", "Fix bug #42", [], { taskStatus: "wip", depth: 1 }),
  ];

  const doneItems = [
    mockNode("item-6", "Initial setup", [], { taskStatus: "done", depth: 1 }),
    mockNode("item-7", "Add tests", [], { taskStatus: "done", depth: 1 }),
  ];

  const nodes: TNode[] = [
    mockNode("col-todo", "Todo", todoItems, { depth: 0 }),
    mockNode("col-wip", "In Progress", wipItems, { depth: 0 }),
    mockNode("col-done", "Done", doneItems, { depth: 0 }),
  ];

  return createInitialTreeState(nodes, "tree-root", "/test/vault");
}

// ============================================================================
// State Management Tests
// ============================================================================

describe("TUI2 Integration: State Management", () => {
  describe("createInitialTreeState", () => {
    it("creates state with nodes", () => {
      const state = createTestTree();

      expect(state.nodes).toHaveLength(3);
      // Cursor starts at [0, 0] (first card in first column) when children exist
      expect(state.cursor).toEqual([0, 0]);
      expect(state.rootId).toBe("tree-root");
      expect(state.rootPath).toBe("/test/vault");
    });

    it("initializes selection state correctly", () => {
      const state = createTestTree();

      expect(state.selectedNodes.size).toBe(0);
      expect(state.foldedNodes.size).toBe(0);
      expect(state.collapsedNodes.size).toBe(0);
    });

    it("initializes search state correctly", () => {
      const state = createTestTree();

      expect(state.searchQuery).toBe("");
      expect(state.searchMode).toBe(false);
      expect(state.helpMode).toBe(false);
    });
  });

  describe("treeReducer navigation", () => {
    it("MOVE_DOWN moves to next sibling at same level", () => {
      // createTestTree now starts at [0, 0] (card level)
      const state = createTestTree();
      const newState = treeReducer(state, { type: "MOVE_DOWN" });

      // At card level, moves to next card in column
      expect(newState.cursor).toEqual([0, 1]);
    });

    it("MOVE_UP moves to previous sibling at same level", () => {
      const state = { ...createTestTree(), cursor: [0, 2] };
      const newState = treeReducer(state, { type: "MOVE_UP" });

      expect(newState.cursor).toEqual([0, 1]);
    });

    it("NAV_CHILD drills into children", () => {
      // Start at column level to test drilling into children
      const state = { ...createTestTree(), cursor: [0] };
      const newState = treeReducer(state, { type: "NAV_CHILD" });

      expect(newState.cursor).toEqual([0, 0]); // First child of first node
    });

    it("NAV_PARENT goes up one level", () => {
      const state = { ...createTestTree(), cursor: [0, 1] };
      const newState = treeReducer(state, { type: "NAV_PARENT" });

      expect(newState.cursor).toEqual([0]);
    });

    it("JUMP_TOP goes to first sibling", () => {
      const state = { ...createTestTree(), cursor: [0, 2] };
      const newState = treeReducer(state, { type: "JUMP_TOP" });

      expect(newState.cursor).toEqual([0, 0]);
    });

    it("JUMP_BOTTOM goes to last sibling", () => {
      // createTestTree starts at [0, 0] (first card in first column)
      // First column has 3 cards (items), so JUMP_BOTTOM goes to [0, 2]
      const state = createTestTree();
      const newState = treeReducer(state, { type: "JUMP_BOTTOM" });

      expect(newState.cursor).toEqual([0, 2]); // Last card in first column
    });
  });

  describe("treeReducer boundaries", () => {
    it("MOVE_UP at first sibling stays", () => {
      // createTestTree now starts at [0, 0] (first card)
      const state = createTestTree();
      const newState = treeReducer(state, { type: "MOVE_UP" });

      expect(newState.cursor).toEqual([0, 0]);
    });

    it("MOVE_DOWN at last sibling stays", () => {
      // Last card in first column is [0, 2] (3 cards total)
      const state = { ...createTestTree(), cursor: [0, 2] };
      const newState = treeReducer(state, { type: "MOVE_DOWN" });

      expect(newState.cursor).toEqual([0, 2]);
    });

    it("NAV_PARENT at top level stays", () => {
      // At column level [0], NAV_PARENT should stay
      const state = { ...createTestTree(), cursor: [0] };
      const newState = treeReducer(state, { type: "NAV_PARENT" });

      expect(newState.cursor).toEqual([0]);
    });

    it("NAV_CHILD on leaf node stays", () => {
      const state = { ...createTestTree(), cursor: [0, 0] }; // leaf node
      const newState = treeReducer(state, { type: "NAV_CHILD" });

      expect(newState.cursor).toEqual([0, 0]);
    });
  });

  describe("treeReducer folding and collapse", () => {
    it("TOGGLE_FOLD adds node to foldedNodes", () => {
      const state = createTestTree();
      const newState = treeReducer(state, {
        type: "TOGGLE_FOLD",
        nodeId: "item-4",
      });

      expect(newState.foldedNodes.has("item-4")).toBe(true);
    });

    it("TOGGLE_FOLD removes node from foldedNodes when already folded", () => {
      const state = createTestTree();
      state.foldedNodes.add("item-4");

      const newState = treeReducer(state, {
        type: "TOGGLE_FOLD",
        nodeId: "item-4",
      });

      expect(newState.foldedNodes.has("item-4")).toBe(false);
    });

    it("TOGGLE_COLLAPSE adds node to collapsedNodes", () => {
      const state = createTestTree();
      const newState = treeReducer(state, {
        type: "TOGGLE_COLLAPSE",
        nodeId: "col-wip",
      });

      expect(newState.collapsedNodes.has("col-wip")).toBe(true);
    });

    it("TOGGLE_COLLAPSE removes node when already collapsed", () => {
      const state = createTestTree();
      state.collapsedNodes.add("col-wip");

      const newState = treeReducer(state, {
        type: "TOGGLE_COLLAPSE",
        nodeId: "col-wip",
      });

      expect(newState.collapsedNodes.has("col-wip")).toBe(false);
    });
  });

  describe("treeReducer search and modes", () => {
    it("SET_SEARCH_QUERY updates query", () => {
      const state = createTestTree();
      const newState = treeReducer(state, {
        type: "SET_SEARCH_QUERY",
        query: "test",
      });

      expect(newState.searchQuery).toBe("test");
    });

    it("TOGGLE_SEARCH_MODE enables search", () => {
      const state = createTestTree();
      const newState = treeReducer(state, { type: "TOGGLE_SEARCH_MODE" });

      expect(newState.searchMode).toBe(true);
    });

    it("TOGGLE_SEARCH_MODE disables search and clears query", () => {
      const state = {
        ...createTestTree(),
        searchMode: true,
        searchQuery: "test",
      };
      const newState = treeReducer(state, { type: "TOGGLE_SEARCH_MODE" });

      expect(newState.searchMode).toBe(false);
      expect(newState.searchQuery).toBe("");
    });

    it("TOGGLE_HELP_MODE toggles help", () => {
      const state = createTestTree();
      const newState = treeReducer(state, { type: "TOGGLE_HELP_MODE" });

      expect(newState.helpMode).toBe(true);
    });
  });

  describe("treeReducer selection", () => {
    it("SELECT_NODE_ADD adds node to selection", () => {
      const state = createTestTree();
      const newState = treeReducer(state, {
        type: "SELECT_NODE_ADD",
        nodeId: "item-1",
      });

      expect(newState.selectedNodes.has("item-1")).toBe(true);
    });

    it("SELECT_NODE_REMOVE removes node from selection", () => {
      const state = createTestTree();
      state.selectedNodes.add("item-1");

      const newState = treeReducer(state, {
        type: "SELECT_NODE_REMOVE",
        nodeId: "item-1",
      });

      expect(newState.selectedNodes.has("item-1")).toBe(false);
    });

    it("SELECT_NODE_TOGGLE toggles selection", () => {
      const state = createTestTree();
      const state1 = treeReducer(state, {
        type: "SELECT_NODE_TOGGLE",
        nodeId: "item-1",
      });
      expect(state1.selectedNodes.has("item-1")).toBe(true);

      const state2 = treeReducer(state1, {
        type: "SELECT_NODE_TOGGLE",
        nodeId: "item-1",
      });
      expect(state2.selectedNodes.has("item-1")).toBe(false);
    });

    it("CLEAR_SELECTION clears all selections", () => {
      const state = createTestTree();
      state.selectedNodes.add("item-1");
      state.selectedNodes.add("item-2");

      const newState = treeReducer(state, { type: "CLEAR_SELECTION" });

      expect(newState.selectedNodes.size).toBe(0);
    });

    it("SELECT_ALL selects all nodes recursively", () => {
      const state = createTestTree();
      const newState = treeReducer(state, { type: "SELECT_ALL" });

      // 3 top-level nodes + 3 todo items + 2 wip items + 2 done items = 10
      expect(newState.selectedNodes.size).toBe(10);
    });
  });

  describe("treeReducer outline depth", () => {
    it("INCREASE_OUTLINE_DEPTH increments depth", () => {
      const state = { ...createTestTree(), maxOutlineDepth: 2 };
      const newState = treeReducer(state, { type: "INCREASE_OUTLINE_DEPTH" });

      expect(newState.maxOutlineDepth).toBe(3);
    });

    it("DECREASE_OUTLINE_DEPTH decrements depth", () => {
      const state = { ...createTestTree(), maxOutlineDepth: 2 };
      const newState = treeReducer(state, { type: "DECREASE_OUTLINE_DEPTH" });

      expect(newState.maxOutlineDepth).toBe(1);
    });

    it("DECREASE_OUTLINE_DEPTH does not go below 0", () => {
      const state = { ...createTestTree(), maxOutlineDepth: 0 };
      const newState = treeReducer(state, { type: "DECREASE_OUTLINE_DEPTH" });

      expect(newState.maxOutlineDepth).toBe(0);
    });
  });
});

// ============================================================================
// Selector Tests
// ============================================================================

describe("TUI2 Integration: Selectors", () => {
  describe("getCurrentNode", () => {
    it("returns the node at cursor", () => {
      // createTestTree now starts at [0, 0] (first card)
      const state = createTestTree();
      const node = getCurrentNode(state);

      expect(node?.nodeId).toBe("item-1"); // First card
    });

    it("returns column node when at column level", () => {
      const state = { ...createTestTree(), cursor: [0] };
      const node = getCurrentNode(state);

      expect(node?.nodeId).toBe("col-todo");
    });

    it("returns nested node at path", () => {
      const state = { ...createTestTree(), cursor: [0, 1] };
      const node = getCurrentNode(state);

      expect(node?.nodeId).toBe("item-2");
    });

    it("returns null for empty cursor", () => {
      const state = { ...createTestTree(), cursor: [] };
      const node = getCurrentNode(state);

      expect(node).toBeNull();
    });
  });

  describe("getParentNode", () => {
    it("returns parent node", () => {
      const state = { ...createTestTree(), cursor: [0, 1] };
      const parent = getParentNode(state);

      expect(parent?.nodeId).toBe("col-todo");
    });

    it("returns null at top level", () => {
      // Explicitly set cursor to column level
      const state = { ...createTestTree(), cursor: [0] };
      const parent = getParentNode(state);

      expect(parent).toBeNull();
    });
  });

  describe("getSiblings", () => {
    it("returns sibling nodes at current level", () => {
      const state = { ...createTestTree(), cursor: [0, 1] };
      const siblings = getSiblings(state);

      expect(siblings).toHaveLength(3); // Todo column has 3 items
    });

    it("returns top-level nodes when at top level", () => {
      const state = { ...createTestTree(), cursor: [0] };
      const siblings = getSiblings(state);

      expect(siblings).toHaveLength(3);
    });
  });

  describe("navigation predicates", () => {
    it("canNavigateUp returns false at first sibling", () => {
      // createTestTree now starts at [0, 0] (first card)
      const state = createTestTree();
      expect(canNavigateUp(state)).toBe(false);
    });

    it("canNavigateUp returns true when not at first sibling", () => {
      const state = { ...createTestTree(), cursor: [0, 1] };
      expect(canNavigateUp(state)).toBe(true);
    });

    it("canNavigateDown returns false at last sibling", () => {
      // Last card in first column
      const state = { ...createTestTree(), cursor: [0, 2] };
      expect(canNavigateDown(state)).toBe(false);
    });

    it("canNavigateDown returns true when not at last sibling", () => {
      // createTestTree now starts at [0, 0] (first card, 2 more cards after)
      const state = createTestTree();
      expect(canNavigateDown(state)).toBe(true);
    });

    it("canNavigateParent returns false at top level", () => {
      // Explicitly set cursor to column level
      const state = { ...createTestTree(), cursor: [0] };
      expect(canNavigateParent(state)).toBe(false);
    });

    it("canNavigateParent returns true when nested", () => {
      const state = { ...createTestTree(), cursor: [0, 0] };
      expect(canNavigateParent(state)).toBe(true);
    });

    it("canNavigateChild returns true when node has children", () => {
      // Explicitly set cursor to column level (column has children)
      const state = { ...createTestTree(), cursor: [0] };
      expect(canNavigateChild(state)).toBe(true);
    });

    it("canNavigateChild returns false for leaf node", () => {
      const state = { ...createTestTree(), cursor: [0, 0] }; // Leaf node
      expect(canNavigateChild(state)).toBe(false);
    });
  });

  describe("fold/collapse predicates", () => {
    it("isNodeFolded returns correct state", () => {
      const state = createTestTree();
      expect(isNodeFolded(state, "item-4")).toBe(false);

      state.foldedNodes.add("item-4");
      expect(isNodeFolded(state, "item-4")).toBe(true);
    });

    it("isNodeCollapsed returns correct state", () => {
      const state = createTestTree();
      expect(isNodeCollapsed(state, "col-wip")).toBe(false);

      state.collapsedNodes.add("col-wip");
      expect(isNodeCollapsed(state, "col-wip")).toBe(true);
    });
  });

  describe("getTotalNodeCount", () => {
    it("counts all nodes recursively", () => {
      const state = createTestTree();
      // 3 top-level + 3 in todo + 2 in wip + 2 in done = 10
      expect(getTotalNodeCount(state)).toBe(10);
    });
  });
});

// ============================================================================
// ViewModel Transformer Tests
// ============================================================================

describe("TUI2 Integration: ViewModels", () => {
  describe("toNodeViewModel", () => {
    it("transforms TNode to NodeViewModel", () => {
      const node = mockNode("test-id", "Test Node", [], {
        taskStatus: "wip",
        color: "blue",
      });
      const foldedNodes = new Set<string>();

      const viewModel = toNodeViewModel(node, foldedNodes);

      expect(viewModel.id).toBe("test-id");
      expect(viewModel.title).toBe("Test Node");
      expect(viewModel.taskStatus).toBe("wip");
      expect(viewModel.color).toBe("blue");
      expect(viewModel.isFolded).toBe(false);
    });

    it("reflects folded state in viewModel", () => {
      const node = mockNode("test-id", "Test Node");
      const foldedNodes = new Set<string>(["test-id"]);

      const viewModel = toNodeViewModel(node, foldedNodes);

      expect(viewModel.isFolded).toBe(true);
    });

    it("transforms children recursively", () => {
      const child = mockNode("child-id", "Child Node", [], { depth: 1 });
      const parent = mockNode("parent-id", "Parent Node", [child]);
      const foldedNodes = new Set<string>();

      const viewModel = toNodeViewModel(parent, foldedNodes);

      expect(viewModel.children).toHaveLength(1);
      expect(viewModel.children[0]?.id).toBe("child-id");
    });
  });

  describe("toTreeViewModel", () => {
    it("transforms TreeState to TreeViewModel", () => {
      const state = createTestTree();
      const viewModel = toTreeViewModel(state, "cards");

      expect(viewModel.rootPath).toBe("/test/vault");
      expect(viewModel.nodes).toHaveLength(3);
      // createTestTree now starts cursor at [0, 0] (card level)
      expect(viewModel.cursor).toEqual([0, 0]);
      expect(viewModel.viewMode).toBe("cards");
    });

    it("applies search filter", () => {
      const state = { ...createTestTree(), searchQuery: "Todo" };
      const viewModel = toTreeViewModel(state, "cards");

      // Only "Todo" column matches
      expect(viewModel.nodes).toHaveLength(1);
      expect(viewModel.nodes[0]?.title).toBe("Todo");
    });

    it("preserves search state", () => {
      const state = {
        ...createTestTree(),
        searchMode: true,
        searchQuery: "test",
      };
      const viewModel = toTreeViewModel(state, "cards");

      expect(viewModel.searchMode).toBe(true);
      expect(viewModel.searchQuery).toBe("test");
    });
  });
});

// ============================================================================
// Navigation History Tests
// ============================================================================

describe("TUI2 Integration: Navigation History", () => {
  it("NAV_TO adds current location to history", () => {
    const state = createTestTree();
    const newNodes = [mockNode("new-root", "New Root")];

    const newState = treeReducer(state, {
      type: "NAV_TO",
      rootId: "new-root",
      nodes: newNodes,
      rootPath: "/new/path",
    });

    expect(newState.navHistory).toHaveLength(1);
    expect(newState.navHistory[0]?.rootId).toBe("tree-root");
  });

  it("NAV_BACK decrements history index", () => {
    const state = {
      ...createTestTree(),
      navHistory: [{ rootId: "old-root", cursor: [0] as number[] }],
      navHistoryIndex: 1,
    };

    const newState = treeReducer(state, { type: "NAV_BACK" });

    expect(newState.navHistoryIndex).toBe(0);
  });

  it("NAV_BACK does nothing when at start", () => {
    const state = createTestTree();

    const newState = treeReducer(state, { type: "NAV_BACK" });

    expect(newState.navHistoryIndex).toBe(0);
  });

  it("NAV_FORWARD increments history index", () => {
    const state = {
      ...createTestTree(),
      navHistory: [
        { rootId: "root-1", cursor: [0] as number[] },
        { rootId: "root-2", cursor: [1] as number[] },
      ],
      navHistoryIndex: 0,
    };

    const newState = treeReducer(state, { type: "NAV_FORWARD" });

    expect(newState.navHistoryIndex).toBe(1);
  });
});

// ============================================================================
// Zoom Tests
// ============================================================================

describe("TUI2 Integration: Zoom", () => {
  it("ZOOM_IN pushes to zoom stack", () => {
    const state = createTestTree();
    const zoomedNodes = [mockNode("zoomed-node", "Zoomed")];

    const newState = treeReducer(state, {
      type: "ZOOM_IN",
      nodeId: "col-todo",
      nodes: zoomedNodes,
    });

    expect(newState.zoomStack).toHaveLength(1);
    expect(newState.zoomStack[0]?.rootId).toBe("tree-root");
    expect(newState.rootId).toBe("col-todo");
    expect(newState.cursor).toEqual([0]);
  });

  it("ZOOM_OUT pops from zoom stack", () => {
    const state = {
      ...createTestTree(),
      rootId: "col-todo",
      zoomStack: [{ rootId: "tree-root", cursor: [0] as number[] }],
    };
    const originalNodes = createTestTree().nodes;

    const newState = treeReducer(state, {
      type: "ZOOM_OUT",
      nodes: originalNodes,
    });

    expect(newState.zoomStack).toHaveLength(0);
    expect(newState.rootId).toBe("tree-root");
    expect(newState.cursor).toEqual([0]);
  });

  it("ZOOM_OUT does nothing with empty stack", () => {
    const state = createTestTree();
    const newState = treeReducer(state, {
      type: "ZOOM_OUT",
      nodes: state.nodes,
    });

    expect(newState).toEqual(state);
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe("TUI2 Integration: Edge Cases", () => {
  it("handles empty tree gracefully", () => {
    const state = createInitialTreeState([], null, null);

    expect(state.nodes).toHaveLength(0);
    expect(state.cursor).toEqual([]);
  });

  it("navigation on empty tree is no-op", () => {
    const state = createInitialTreeState([], null, null);

    const state1 = treeReducer(state, { type: "MOVE_DOWN" });
    expect(state1.cursor).toEqual([]);

    const state2 = treeReducer(state, { type: "MOVE_UP" });
    expect(state2.cursor).toEqual([]);
  });

  it("REFRESH preserves valid cursor", () => {
    const state = { ...createTestTree(), cursor: [1] };
    const newState = treeReducer(state, {
      type: "REFRESH",
      nodes: state.nodes,
    });

    expect(newState.cursor).toEqual([1]);
  });

  it("REFRESH resets invalid cursor", () => {
    const state = { ...createTestTree(), cursor: [10] }; // Invalid
    const newState = treeReducer(state, {
      type: "REFRESH",
      nodes: state.nodes,
    });

    expect(newState.cursor).toEqual([0]); // Reset to first
  });
});
