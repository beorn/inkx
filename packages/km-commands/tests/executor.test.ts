/**
 * Executor Tests
 *
 * Tests for command execution and context building.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { executeCommand, buildContext } from "../src/executor.ts";
import {
  registerCommand,
  registerCommands,
  clearRegistry,
} from "../src/registry.ts";
import type {
  CommandDef,
  CommandContext,
  TNode,
  BoardState,
  ViewMode,
} from "../src/types.ts";

// Helper to create minimal TNode
function createNode(
  id: string,
  children: TNode[] = [],
  opts?: Partial<TNode>,
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
    ...opts,
  };
}

// Helper to create minimal BoardState
function createBoardState(nodes: TNode[], cursor: number[] = []): BoardState {
  return {
    rootId: null,
    rootPath: null,
    nodes,
    cursor,
    selectedNodes: new Set(),
    foldedNodes: new Set(),
    collapsedNodes: new Set(),
    zoomStack: [],
    navHistory: [],
    navHistoryIndex: 0,
    moveMode: false,
    moveSourceNodes: [],
    moveSourceCursor: [],
    maxOutlineDepth: 3,
    maxContentLines: 2,
  };
}

describe("executeCommand", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("returns null for unknown command id", () => {
    const ctx = buildContext(createBoardState([]), "cards");
    const result = executeCommand("nonexistent_cmd", ctx);

    expect(result).toBeNull();
  });

  it("executes registered command and returns action", () => {
    const testAction = { type: "CURSOR_MOVE" as const, dir: "next" as const };
    registerCommand({
      id: "test_cmd",
      name: "Test",
      description: "Test command",
      category: "Navigation",
      execute: () => testAction,
    });

    const ctx = buildContext(createBoardState([]), "cards");
    const result = executeCommand("test_cmd", ctx);

    expect(result).toEqual(testAction);
  });

  it("passes context to command execute function", () => {
    let receivedCtx: CommandContext | null = null;

    registerCommand({
      id: "capture_ctx",
      name: "Capture Context",
      description: "Captures context for testing",
      category: "Navigation",
      execute: (ctx) => {
        receivedCtx = ctx;
        return null;
      },
    });

    const testNode = createNode("test-node");
    const boardState = createBoardState([testNode], [0]);
    const ctx = buildContext(boardState, "list");

    executeCommand("capture_ctx", ctx);

    expect(receivedCtx).not.toBeNull();
    expect(receivedCtx!.viewMode).toBe("list");
    expect(receivedCtx!.currentNode).toEqual(testNode);
  });

  it("returns array of actions when command returns array", () => {
    const actions = [
      { type: "CURSOR_MOVE" as const, dir: "next" as const },
      { type: "SELECT_NODE_ADD" as const, nodeId: "node-1" },
    ];

    registerCommand({
      id: "multi_action",
      name: "Multi Action",
      description: "Returns multiple actions",
      category: "Selection",
      execute: () => actions,
    });

    const ctx = buildContext(createBoardState([]), "cards");
    const result = executeCommand("multi_action", ctx);

    expect(result).toEqual(actions);
  });

  it("returns null when command execute returns null", () => {
    registerCommand({
      id: "null_cmd",
      name: "Null Command",
      description: "Returns null",
      category: "Navigation",
      execute: () => null,
    });

    const ctx = buildContext(createBoardState([]), "cards");
    const result = executeCommand("null_cmd", ctx);

    expect(result).toBeNull();
  });
});

describe("buildContext", () => {
  describe("currentNode resolution from cursor path", () => {
    it("returns null currentNode for empty nodes", () => {
      const ctx = buildContext(createBoardState([]), "cards");

      expect(ctx.currentNode).toBeNull();
      expect(ctx.currentNodeId).toBeNull();
    });

    it("returns null currentNode for empty cursor path", () => {
      const nodes = [createNode("col-1")];
      const ctx = buildContext(createBoardState(nodes, []), "cards");

      expect(ctx.currentNode).toBeNull();
    });

    it("resolves single-level cursor path", () => {
      const node1 = createNode("node-1");
      const node2 = createNode("node-2");
      const nodes = [node1, node2];

      const ctx = buildContext(createBoardState(nodes, [1]), "cards");

      expect(ctx.currentNode).toEqual(node2);
      expect(ctx.currentNodeId).toBe("node-2");
    });

    it("resolves nested cursor path", () => {
      const child1 = createNode("child-1");
      const child2 = createNode("child-2");
      const parent = createNode("parent", [child1, child2]);
      const nodes = [parent];

      const ctx = buildContext(createBoardState(nodes, [0, 1]), "cards");

      expect(ctx.currentNode).toEqual(child2);
      expect(ctx.currentNodeId).toBe("child-2");
    });

    it("resolves deeply nested cursor path", () => {
      const deepChild = createNode("deep-child");
      const midChild = createNode("mid-child", [deepChild]);
      const topParent = createNode("top-parent", [midChild]);
      const nodes = [topParent];

      const ctx = buildContext(createBoardState(nodes, [0, 0, 0]), "cards");

      expect(ctx.currentNode).toEqual(deepChild);
      expect(ctx.currentNodeId).toBe("deep-child");
    });

    it("handles out-of-bounds cursor gracefully", () => {
      const node = createNode("only-node");
      const nodes = [node];

      // Cursor points beyond available nodes
      const ctx = buildContext(createBoardState(nodes, [5]), "cards");

      expect(ctx.currentNode).toBeNull();
    });

    it("handles partial path traversal (child index out of bounds)", () => {
      const parent = createNode("parent", [createNode("child")]);
      const nodes = [parent];

      // Parent exists, but no child at index 5
      // Implementation note: buildContext traverses as far as it can,
      // and if the final index is out of bounds at a level, it returns
      // the last valid node found during traversal (the parent)
      const ctx = buildContext(createBoardState(nodes, [0, 5]), "cards");

      // The algorithm sets currentNode during traversal, so parent remains
      expect(ctx.currentNode).toEqual(parent);
    });
  });

  describe("sibling information", () => {
    it("calculates siblingCount for top-level nodes", () => {
      const nodes = [createNode("a"), createNode("b"), createNode("c")];
      const ctx = buildContext(createBoardState(nodes, [1]), "cards");

      expect(ctx.siblingCount).toBe(3);
      expect(ctx.siblingIndex).toBe(1);
    });

    it("calculates siblingCount for nested nodes", () => {
      const children = [
        createNode("child-1"),
        createNode("child-2"),
        createNode("child-3"),
        createNode("child-4"),
      ];
      const parent = createNode("parent", children);
      const nodes = [parent];

      const ctx = buildContext(createBoardState(nodes, [0, 2]), "cards");

      expect(ctx.siblingCount).toBe(4);
      expect(ctx.siblingIndex).toBe(2);
    });

    it("returns 0 siblingIndex for empty cursor", () => {
      const nodes = [createNode("a")];
      const ctx = buildContext(createBoardState(nodes, []), "cards");

      expect(ctx.siblingIndex).toBe(0);
    });
  });

  describe("column information", () => {
    it("calculates columnIndex and columnCount", () => {
      const nodes = [
        createNode("col-a", [createNode("card-1")]),
        createNode("col-b", [createNode("card-2")]),
        createNode("col-c", [createNode("card-3")]),
      ];

      const ctx = buildContext(createBoardState(nodes, [1, 0]), "columns");

      expect(ctx.columnIndex).toBe(1);
      expect(ctx.columnCount).toBe(3);
    });

    it("returns 0 columnIndex for cursor starting at first column", () => {
      const nodes = [createNode("col-a"), createNode("col-b")];
      const ctx = buildContext(createBoardState(nodes, [0]), "columns");

      expect(ctx.columnIndex).toBe(0);
    });

    it("returns correct columnCount for empty nodes", () => {
      const ctx = buildContext(createBoardState([], []), "columns");

      expect(ctx.columnCount).toBe(0);
    });
  });

  describe("boardState and viewMode pass-through", () => {
    it("includes original boardState reference", () => {
      const boardState = createBoardState([createNode("a")], [0]);
      const ctx = buildContext(boardState, "cards");

      expect(ctx.boardState).toBe(boardState);
    });

    it("includes viewMode", () => {
      const viewModes: ViewMode[] = ["cards", "list", "columns", "tabs"];

      for (const mode of viewModes) {
        const ctx = buildContext(createBoardState([]), mode);
        expect(ctx.viewMode).toBe(mode);
      }
    });
  });

  describe("selectedNodes conversion", () => {
    it("converts Set to Array", () => {
      const boardState = createBoardState(
        [createNode("a"), createNode("b")],
        [0],
      );
      boardState.selectedNodes = new Set(["a", "b"]);

      const ctx = buildContext(boardState, "cards");

      expect(Array.isArray(ctx.selectedNodes)).toBe(true);
      expect(ctx.selectedNodes).toContain("a");
      expect(ctx.selectedNodes).toContain("b");
    });

    it("returns empty array for no selection", () => {
      const ctx = buildContext(createBoardState([]), "cards");

      expect(ctx.selectedNodes).toEqual([]);
    });
  });

  describe("cursor pass-through", () => {
    it("includes cursor path from boardState", () => {
      const cursor = [1, 2, 3];
      const ctx = buildContext(createBoardState([], cursor), "cards");

      expect(ctx.cursor).toEqual(cursor);
    });
  });

  describe("extras override", () => {
    it("allows overriding context fields via extras", () => {
      const nodes = [createNode("a")];
      const ctx = buildContext(createBoardState(nodes, [0]), "cards", {
        columnIndex: 99,
        siblingCount: 100,
      });

      expect(ctx.columnIndex).toBe(99);
      expect(ctx.siblingCount).toBe(100);
    });

    it("extras can add custom fields", () => {
      const ctx = buildContext(createBoardState([]), "cards", {
        customField: "custom-value",
      } as Partial<CommandContext> & { customField: string });

      expect(
        (ctx as CommandContext & { customField: string }).customField,
      ).toBe("custom-value");
    });
  });
});
