/**
 * Transformers Tests
 *
 * Unit tests for the view model transformer functions.
 */

import { describe, test, expect } from "bun:test";
import {
  toNodeViewModel,
  toTreeViewModel,
  createInitialTreeState,
  type TreeNodeState,
} from "../src/index.ts";

describe("toNodeViewModel", () => {
  test("transforms TreeNodeState to NodeViewModel", () => {
    const node: TreeNodeState = {
      nodeId: "node-123",
      title: "Test Node",
      depth: 1,
      childCount: 3,
      isTask: true,
      taskStatus: "todo",
      color: "blue",
      icon: "star",
      children: [],
    };

    const vm = toNodeViewModel(node, new Set());

    expect(vm.id).toBe("node-123");
    expect(vm.title).toBe("Test Node");
    expect(vm.childCount).toBe(3);
    expect(vm.isTask).toBe(true);
    expect(vm.taskStatus).toBe("todo");
    expect(vm.color).toBe("blue");
    expect(vm.icon).toBe("star");
    expect(vm.isFolded).toBe(false);
  });

  test("sets isFolded from foldedNodes set", () => {
    const node: TreeNodeState = {
      nodeId: "node-123",
      title: "Test Node",
      depth: 0,
      childCount: 0,
      isTask: false,
      children: [],
    };

    const vmFolded = toNodeViewModel(node, new Set(["node-123"]));
    expect(vmFolded.isFolded).toBe(true);

    const vmUnfolded = toNodeViewModel(node, new Set());
    expect(vmUnfolded.isFolded).toBe(false);
  });

  test("handles node without optional fields", () => {
    const node: TreeNodeState = {
      nodeId: "node-123",
      title: "Simple Node",
      depth: 0,
      childCount: 0,
      isTask: false,
      children: [],
    };

    const vm = toNodeViewModel(node, new Set());

    expect(vm.taskStatus).toBeUndefined();
    expect(vm.color).toBeUndefined();
    expect(vm.icon).toBeUndefined();
  });

  test("recursively transforms children", () => {
    const node: TreeNodeState = {
      nodeId: "parent",
      title: "Parent",
      depth: 0,
      childCount: 2,
      isTask: false,
      children: [
        {
          nodeId: "child1",
          title: "Child 1",
          depth: 1,
          childCount: 0,
          isTask: false,
          children: [],
        },
        {
          nodeId: "child2",
          title: "Child 2",
          depth: 1,
          childCount: 0,
          isTask: true,
          taskStatus: "wip",
          children: [],
        },
      ],
    };

    const vm = toNodeViewModel(node, new Set(["child1"]));

    expect(vm.children).toHaveLength(2);
    expect(vm.children[0]?.id).toBe("child1");
    expect(vm.children[0]?.isFolded).toBe(true);
    expect(vm.children[1]?.id).toBe("child2");
    expect(vm.children[1]?.taskStatus).toBe("wip");
    expect(vm.children[1]?.isFolded).toBe(false);
  });
});

describe("toTreeViewModel", () => {
  function createTestNodes(): TreeNodeState[] {
    return [
      {
        nodeId: "col1",
        title: "Column 1",
        depth: 0,
        childCount: 2,
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
            children: [],
          },
        ],
      },
      {
        nodeId: "col2",
        title: "Column 2",
        depth: 0,
        childCount: 1,
        isTask: false,
        children: [
          {
            nodeId: "card3",
            title: "Card 3",
            depth: 1,
            childCount: 1,
            isTask: true,
            taskStatus: "wip",
            children: [],
          },
        ],
      },
    ];
  }

  test("transforms TreeState to TreeViewModel", () => {
    const state = createInitialTreeState(
      createTestNodes(),
      "root-123",
      "/path/to/tree",
    );
    state.cursor = [1, 0];

    const vm = toTreeViewModel(state, "cards");

    expect(vm.rootPath).toBe("/path/to/tree");
    expect(vm.nodes).toHaveLength(2);
    expect(vm.cursor).toEqual([1, 0]);
    expect(vm.viewMode).toBe("cards");
    expect(vm.searchQuery).toBe("");
    expect(vm.searchMode).toBe(false);
    expect(vm.helpMode).toBe(false);
  });

  test("transforms nodes with folded state", () => {
    const state = createInitialTreeState(createTestNodes());
    state.foldedNodes.add("card1");

    const vm = toTreeViewModel(state, "list");

    expect(vm.nodes[0]?.children[0]?.isFolded).toBe(true);
    expect(vm.nodes[0]?.children[1]?.isFolded).toBe(false);
  });

  test("includes search and help mode state", () => {
    const state = createInitialTreeState(createTestNodes());
    state.searchQuery = "test query";
    state.searchMode = true;
    state.helpMode = true;

    const vm = toTreeViewModel(state, "columns");

    expect(vm.searchQuery).toBe("test query");
    expect(vm.searchMode).toBe(true);
    expect(vm.helpMode).toBe(true);
  });

  test("passes viewMode from parameter", () => {
    const state = createInitialTreeState(createTestNodes());

    const cardsVm = toTreeViewModel(state, "cards");
    expect(cardsVm.viewMode).toBe("cards");

    const listVm = toTreeViewModel(state, "list");
    expect(listVm.viewMode).toBe("list");

    const columnsVm = toTreeViewModel(state, "columns");
    expect(columnsVm.viewMode).toBe("columns");

    const tabsVm = toTreeViewModel(state, "tabs");
    expect(tabsVm.viewMode).toBe("tabs");
  });

  test("includes selected nodes", () => {
    const state = createInitialTreeState(createTestNodes());
    state.selectedNodes.add("card1");
    state.selectedNodes.add("card2");

    const vm = toTreeViewModel(state, "cards");

    expect(vm.selectedNodes.has("card1")).toBe(true);
    expect(vm.selectedNodes.has("card2")).toBe(true);
    expect(vm.selectedNodes.size).toBe(2);
  });
});
