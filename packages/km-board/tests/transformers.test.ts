/**
 * Transformers Tests
 *
 * Tests for toBoardViewModel and related state transformation functions.
 */

import { describe, it, expect } from "bun:test";
import { toBoardViewModel } from "../src/transformers.ts";
import { createBoardState } from "../src/board-reducer.ts";
import type { BoardState, TNode, ViewMode } from "../src/board-types.ts";

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

// Test nodes
const testNodes: TNode[] = [
  createNode("col-a", [createNode("card-1"), createNode("card-2")]),
  createNode("col-b", [createNode("card-3")]),
];

function createTestState(overrides?: Partial<BoardState>): BoardState {
  return {
    ...createBoardState(testNodes),
    ...overrides,
  };
}

describe("toBoardViewModel", () => {
  it("transforms BoardState to BoardViewModel", () => {
    const state = createTestState();
    const viewModel = toBoardViewModel(state, "cards");

    expect(viewModel).toBeDefined();
    expect(viewModel.viewMode).toBe("cards");
  });

  it("preserves rootPath from state", () => {
    const state = createTestState({ rootPath: "/test/path" });
    const viewModel = toBoardViewModel(state, "cards");

    expect(viewModel.rootPath).toBe("/test/path");
  });

  it("preserves null rootPath", () => {
    const state = createTestState({ rootPath: null });
    const viewModel = toBoardViewModel(state, "cards");

    expect(viewModel.rootPath).toBeNull();
  });

  it("preserves nodes array reference", () => {
    const state = createTestState();
    const viewModel = toBoardViewModel(state, "cards");

    // Should be the same reference, not a copy
    expect(viewModel.nodes).toBe(state.nodes);
  });

  it("preserves cursor path", () => {
    const state = createTestState({ cursor: [1, 0] });
    const viewModel = toBoardViewModel(state, "cards");

    expect(viewModel.cursor).toEqual([1, 0]);
  });

  it("preserves selectedNodes Set reference", () => {
    const selectedNodes = new Set(["card-1", "card-2"]);
    const state = createTestState({ selectedNodes });
    const viewModel = toBoardViewModel(state, "cards");

    // Should be the same reference, preserving Set identity
    expect(viewModel.selectedNodes).toBe(selectedNodes);
    expect(viewModel.selectedNodes.has("card-1")).toBe(true);
    expect(viewModel.selectedNodes.has("card-2")).toBe(true);
    expect(viewModel.selectedNodes.has("card-3")).toBe(false);
  });

  it("preserves foldedNodes Set reference", () => {
    const foldedNodes = new Set(["col-a"]);
    const state = createTestState({ foldedNodes });
    const viewModel = toBoardViewModel(state, "cards");

    // Should be the same reference, preserving Set identity
    expect(viewModel.foldedNodes).toBe(foldedNodes);
    expect(viewModel.foldedNodes.has("col-a")).toBe(true);
    expect(viewModel.foldedNodes.has("col-b")).toBe(false);
  });

  it("handles empty Sets", () => {
    const state = createTestState({
      selectedNodes: new Set(),
      foldedNodes: new Set(),
    });
    const viewModel = toBoardViewModel(state, "cards");

    expect(viewModel.selectedNodes.size).toBe(0);
    expect(viewModel.foldedNodes.size).toBe(0);
  });

  describe("viewMode parameter", () => {
    it("accepts cards mode", () => {
      const state = createTestState();
      const viewModel = toBoardViewModel(state, "cards");
      expect(viewModel.viewMode).toBe("cards");
    });

    it("accepts list mode", () => {
      const state = createTestState();
      const viewModel = toBoardViewModel(state, "list");
      expect(viewModel.viewMode).toBe("list");
    });

    it("accepts columns mode", () => {
      const state = createTestState();
      const viewModel = toBoardViewModel(state, "columns");
      expect(viewModel.viewMode).toBe("columns");
    });

    it("accepts tabs mode", () => {
      const state = createTestState();
      const viewModel = toBoardViewModel(state, "tabs");
      expect(viewModel.viewMode).toBe("tabs");
    });
  });

  describe("returned object structure", () => {
    it("contains exactly the expected keys", () => {
      const state = createTestState();
      const viewModel = toBoardViewModel(state, "cards");

      const keys = Object.keys(viewModel).sort();
      expect(keys).toEqual([
        "cursor",
        "foldedNodes",
        "nodes",
        "rootPath",
        "selectedNodes",
        "viewMode",
      ]);
    });

    it("does not include state properties not in BoardViewModel", () => {
      const state = createTestState();
      const viewModel = toBoardViewModel(state, "cards");

      // These are in BoardState but not BoardViewModel
      expect("rootId" in viewModel).toBe(false);
      expect("collapsedNodes" in viewModel).toBe(false);
      expect("zoomStack" in viewModel).toBe(false);
      expect("navHistory" in viewModel).toBe(false);
      expect("moveMode" in viewModel).toBe(false);
    });
  });

  it("is a pure function - same input produces same output", () => {
    const state = createTestState({
      cursor: [0, 1],
      selectedNodes: new Set(["card-2"]),
      foldedNodes: new Set(["col-b"]),
    });

    const viewModel1 = toBoardViewModel(state, "cards");
    const viewModel2 = toBoardViewModel(state, "cards");

    // Both should have same values
    expect(viewModel1.rootPath).toBe(viewModel2.rootPath);
    expect(viewModel1.nodes).toBe(viewModel2.nodes);
    expect(viewModel1.cursor).toEqual(viewModel2.cursor);
    expect(viewModel1.selectedNodes).toBe(viewModel2.selectedNodes);
    expect(viewModel1.foldedNodes).toBe(viewModel2.foldedNodes);
    expect(viewModel1.viewMode).toBe(viewModel2.viewMode);
  });

  it("does not mutate the input state", () => {
    const originalCursor = [0, 0];
    const originalSelected = new Set(["card-1"]);
    const originalFolded = new Set(["col-a"]);

    const state = createTestState({
      cursor: originalCursor,
      selectedNodes: originalSelected,
      foldedNodes: originalFolded,
    });

    toBoardViewModel(state, "cards");

    // State should be unchanged
    expect(state.cursor).toBe(originalCursor);
    expect(state.selectedNodes).toBe(originalSelected);
    expect(state.foldedNodes).toBe(originalFolded);
    expect(state.selectedNodes.has("card-1")).toBe(true);
    expect(state.foldedNodes.has("col-a")).toBe(true);
  });
});
