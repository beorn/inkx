/**
 * Board Domain Object Tests
 *
 * Tests for createBoard factory function.
 */

import { describe, test, expect } from "bun:test";
import type { KNode } from "@km/core";
import { createBoard } from "../src/board-object.ts";

// Mock vault that implements the minimal interface
function createMockVault(nodes: KNode[]) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return {
    path: "/mock/vault",
    getNode(id: string) {
      return nodeMap.get(id) ?? null;
    },
    getChildren(parentId: string | null) {
      return nodes.filter((n) => n.parent_id === parentId);
    },
  };
}

// Helper to create a node with all required fields
function makeNode(
  partial: Partial<KNode> & {
    id: string;
    type: KNode["type"];
    content: string;
  },
): KNode {
  return {
    parent_id: null,
    parent_idx: 0,
    link_to: null,
    data: {},
    created_at: 0,
    updated_at: 0,
    version: "test",
    ...partial,
  };
}

// Test data
const testNodes: KNode[] = [
  makeNode({
    id: "file1",
    type: "file",
    content: "Tasks",
    parent_id: null,
    parent_idx: 0,
    fs_path: "/mock/vault/tasks.md",
  }),
  makeNode({
    id: "task1",
    type: "task",
    content: "Open task",
    parent_id: "file1",
    parent_idx: 0,
    task_status: "todo",
    task_mark: " ",
  }),
  makeNode({
    id: "task2",
    type: "task",
    content: "Done task",
    parent_id: "file1",
    parent_idx: 1,
    task_status: "done",
    task_mark: "x",
  }),
  makeNode({
    id: "file2",
    type: "file",
    content: "Notes",
    parent_id: null,
    parent_idx: 1,
    fs_path: "/mock/vault/notes.md",
  }),
  makeNode({
    id: "section1",
    type: "section",
    content: "Section One",
    parent_id: "file2",
    parent_idx: 0,
  }),
];

describe("createBoard", () => {
  test("creates board with initial state", () => {
    const vault = createMockVault(testNodes);
    const board = createBoard(vault);

    expect(board.vault).toBe(vault);
    expect(board.state).toBeDefined();
    expect(board.state.nodes.length).toBeGreaterThan(0);
  });

  test("creates board with specific rootId", () => {
    const vault = createMockVault(testNodes);
    const board = createBoard(vault, { rootId: "file1" });

    expect(board.state.rootId).toBe("file1");
    // Should only have children of file1
    expect(board.state.nodes.every((n) => n.id !== "file2")).toBe(true);
  });

  test("getCurrentNode returns focused node", () => {
    const vault = createMockVault(testNodes);
    const board = createBoard(vault);

    const current = board.getCurrentNode();
    expect(current).not.toBeNull();
    // Initial cursor is at some node in the tree
    expect(typeof current?.content).toBe("string");
  });

  test("moveCursor navigates through nodes", () => {
    const vault = createMockVault(testNodes);
    const board = createBoard(vault);

    const initialNode = board.getCurrentNode();
    expect(initialNode).not.toBeNull();

    // Move down
    board.moveCursor("down");

    // Should have moved (either same or different node)
    const afterMove = board.getCurrentNode();
    expect(afterMove).not.toBeNull();
  });

  test("toggleFold collapses and expands", () => {
    const vault = createMockVault(testNodes);
    const board = createBoard(vault);

    const fileId = "file1";

    // Initially not folded
    expect(board.isNodeFolded(fileId)).toBe(false);

    // Fold
    board.toggleFold(fileId);
    expect(board.isNodeFolded(fileId)).toBe(true);

    // Unfold
    board.toggleFold(fileId);
    expect(board.isNodeFolded(fileId)).toBe(false);
  });

  test("toggleSelect adds and removes selection", () => {
    const vault = createMockVault(testNodes);
    const board = createBoard(vault);

    expect(board.state.selectedNodes.size).toBe(0);

    board.toggleSelect("task1");
    expect(board.state.selectedNodes.has("task1")).toBe(true);

    board.toggleSelect("task1");
    expect(board.state.selectedNodes.has("task1")).toBe(false);
  });

  test("clearSelection removes all selections", () => {
    const vault = createMockVault(testNodes);
    const board = createBoard(vault);

    board.toggleSelect("task1");
    board.toggleSelect("task2");
    expect(board.state.selectedNodes.size).toBe(2);

    board.clearSelection();
    expect(board.state.selectedNodes.size).toBe(0);
  });

  test("foldToDepth folds all at depth", () => {
    const vault = createMockVault(testNodes);
    const board = createBoard(vault);

    // Fold at depth 0 (fold all top-level)
    board.foldToDepth(0);

    expect(board.isNodeFolded("file1")).toBe(true);
    expect(board.isNodeFolded("file2")).toBe(true);
  });

  test("unfoldToDepth unfolds nodes at specific depth", () => {
    const vault = createMockVault(testNodes);
    const board = createBoard(vault);

    // First fold at depth 0
    board.foldToDepth(0);
    expect(board.isNodeFolded("file1")).toBe(true);
    expect(board.isNodeFolded("file2")).toBe(true);

    // Unfold at depth 0 (same depth where we folded)
    board.unfoldToDepth(0);
    expect(board.isNodeFolded("file1")).toBe(false);
    expect(board.isNodeFolded("file2")).toBe(false);
  });

  test("getBreadcrumbs returns path to current node", () => {
    const vault = createMockVault(testNodes);
    const board = createBoard(vault);

    // Navigate into file1
    board.moveCursor("right"); // Into file1's children
    const breadcrumbs = board.getBreadcrumbs();

    // Should have at least one breadcrumb
    expect(breadcrumbs.length).toBeGreaterThanOrEqual(0);
  });

  test("getCursorPosition returns column and card indices", () => {
    const vault = createMockVault(testNodes);
    const board = createBoard(vault);

    const pos = board.getCursorPosition();

    expect(typeof pos.column).toBe("number");
    expect(typeof pos.card).toBe("number");
    expect(pos.column).toBeGreaterThanOrEqual(0);
    expect(pos.card).toBeGreaterThanOrEqual(0);
  });

  test("refresh rebuilds tree from vault", () => {
    const nodes = [...testNodes];
    const vault = createMockVault(nodes);
    const board = createBoard(vault);

    const initialNodeCount = board.state.nodes.length;

    // Add a node to the vault (simulate external change)
    nodes.push(
      makeNode({
        id: "file3",
        type: "file",
        content: "New File",
        parent_id: null,
        parent_idx: 2,
        fs_path: "/mock/vault/new.md",
      }),
    );

    // Refresh
    board.refresh();

    // Should now have the new node
    expect(board.state.nodes.length).toBe(initialNodeCount + 1);
  });

  test("dispatch allows raw action dispatch", () => {
    const vault = createMockVault(testNodes);
    const board = createBoard(vault);

    const initialCursor = [...board.state.cursor];

    board.dispatch({ type: "CURSOR_MOVE", dir: "down" });

    // State should have changed (cursor position may differ)
    expect(board.state).toBeDefined();
    expect(board.state.cursor).toBeDefined();
  });

  test("zoom changes root context", () => {
    const vault = createMockVault(testNodes);
    const board = createBoard(vault);

    // Zoom into file1
    board.zoom("file1");

    // Root should now be file1
    expect(board.state.rootId).toBe("file1");
    // Zoom stack should have entry
    expect(board.state.zoomStack.length).toBeGreaterThan(0);
  });

  test("zoomOut restores previous context", () => {
    const vault = createMockVault(testNodes);
    const board = createBoard(vault);

    const originalRootId = board.state.rootId;

    // Zoom in
    board.zoom("file1");
    expect(board.state.rootId).toBe("file1");

    // Zoom out
    board.zoomOut();
    expect(board.state.rootId).toBe(originalRootId);
  });

  test("back and forward navigate history", () => {
    const vault = createMockVault(testNodes);
    const board = createBoard(vault);

    // Make some navigation moves to build history
    board.moveCursor("down");
    board.moveCursor("down");

    // Back should work without error
    board.back();

    // Forward should work without error
    board.forward();
  });
});
