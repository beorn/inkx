/**
 * Shell Executor Tests
 *
 * Tests for km-sh shell execution with tree-based state.
 */

import { describe, it, expect } from "bun:test";
import {
  runShell,
  executeCommand,
  serializeState,
  formatStateHuman,
  renderAsciiView,
} from "../src/shellExecutor.ts";
import { createInitialTreeState } from "../src/treeReducer.ts";
import type { TreeNodeState, TreeState } from "../src/types.ts";
import type { OutputEvent } from "../src/shellExecutor.ts";

// Helper to create test state with tree structure
function createTestNodes(): TreeNodeState[] {
  return [
    {
      nodeId: "col-1",
      title: "Todo",
      depth: 0,
      childCount: 3,
      isTask: false,
      children: [
        {
          nodeId: "card-1",
          title: "Task 1",
          depth: 1,
          childCount: 0,
          isTask: true,
          taskStatus: "todo",
          children: [],
        },
        {
          nodeId: "card-2",
          title: "Task 2",
          depth: 1,
          childCount: 2,
          isTask: true,
          taskStatus: "wip",
          children: [],
        },
        {
          nodeId: "card-3",
          title: "Task 3",
          depth: 1,
          childCount: 0,
          isTask: true,
          taskStatus: "done",
          children: [],
        },
      ],
    },
    {
      nodeId: "col-2",
      title: "In Progress",
      depth: 0,
      childCount: 1,
      isTask: false,
      children: [
        {
          nodeId: "card-4",
          title: "Task 4",
          depth: 1,
          childCount: 0,
          isTask: true,
          taskStatus: "wip",
          children: [],
        },
      ],
    },
  ];
}

function createTestState(): TreeState {
  return createInitialTreeState(createTestNodes(), "root-1", "/test/vault");
}

describe("serializeState", () => {
  it("converts Sets to arrays", () => {
    const state = createTestState();
    state.selectedNodes.add("card-1");
    state.selectedNodes.add("card-2");
    state.foldedNodes.add("card-3");
    state.collapsedNodes.add("col-1");

    const serialized = serializeState(state);

    expect(serialized.selectedNodes).toEqual(["card-1", "card-2"]);
    expect(serialized.foldedNodes).toEqual(["card-3"]);
    expect(serialized.collapsedNodes).toEqual(["col-1"]);
  });

  it("includes cursor path info", () => {
    const state = createTestState();
    state.cursor = [0, 1];

    const serialized = serializeState(state);

    expect(serialized.cursor).toEqual([0, 1]);
    expect(serialized.nodeCount).toBe(6); // 2 cols + 3 cards in col1 + 1 card in col2
  });
});

describe("formatStateHuman", () => {
  it("formats cursor position", () => {
    const state = createTestState();
    const output = formatStateHuman(state);

    expect(output).toContain("cursor:");
    // Cursor now starts at [0, 0] (card level) so we see the first card
    expect(output).toContain("Task 1");
  });

  it("shows selected nodes count", () => {
    const state = createTestState();
    state.selectedNodes.add("card-1");
    state.selectedNodes.add("card-2");

    const output = formatStateHuman(state);
    expect(output).toContain("selected: 2");
  });

  it("shows search mode", () => {
    const state = createTestState();
    state.searchMode = true;
    state.searchQuery = "test query";

    const output = formatStateHuman(state);
    expect(output).toContain("search:");
    expect(output).toContain("test query");
  });
});

describe("renderAsciiView", () => {
  it("renders tree nodes", () => {
    const state = createTestState();
    const view = renderAsciiView(state);

    expect(view).toContain("Todo");
    expect(view).toContain("In Progress");
    expect(view).toContain("Task 1");
    expect(view).toContain("Task 4");
  });

  it("marks selected node", () => {
    const state = createTestState();
    const view = renderAsciiView(state);

    // First node (selected) should have marker
    expect(view).toContain("→");
  });

  it("shows task status icons", () => {
    const state = createTestState();
    const view = renderAsciiView(state);

    expect(view).toContain("○"); // todo
    expect(view).toContain("◐"); // wip
    expect(view).toContain("✓"); // done
  });

  it("shows child count", () => {
    const state = createTestState();
    const view = renderAsciiView(state);

    expect(view).toContain("(+2)"); // Task 2 has 2 children
  });

  it("shows folded marker", () => {
    const state = createTestState();
    state.foldedNodes.add("card-2");
    const view = renderAsciiView(state);

    expect(view).toContain("▸"); // folded marker
  });
});

describe("executeCommand", () => {
  it("executes move_down (nav_next_sibling)", () => {
    const state = createTestState();
    state.cursor = [0, 0]; // First card
    const outputs: string[] = [];
    const ctx = {
      state,
      jsonMode: false,
      verbose: false,
      output: (e: OutputEvent | string) => {
        if (typeof e === "string") outputs.push(e);
      },
      actionLog: [],
    };

    const result = executeCommand("move_down", ctx);

    expect(result.state.cursor).toEqual([0, 1]);
    expect(result.quit).toBe(false);
  });

  it("executes quit command", () => {
    const state = createTestState();
    const ctx = {
      state,
      jsonMode: false,
      verbose: false,
      output: () => {},
      actionLog: [],
    };

    const result = executeCommand("quit", ctx);

    expect(result.quit).toBe(true);
  });

  it("handles unknown command", () => {
    const state = createTestState();
    const outputs: string[] = [];
    const ctx = {
      state,
      jsonMode: false,
      verbose: false,
      output: (e: OutputEvent | string) => {
        if (typeof e === "string") outputs.push(e);
      },
      actionLog: [],
    };

    const result = executeCommand("unknown_cmd", ctx);

    expect(result.state).toBe(state); // State unchanged
    expect(outputs.some((o) => o.includes("error"))).toBe(true);
  });

  it("handles key j as move_down", () => {
    const state = createTestState();
    state.cursor = [0, 0];
    const ctx = {
      state,
      jsonMode: false,
      verbose: false,
      output: () => {},
      actionLog: [],
    };

    const result = executeCommand("key j", ctx);

    expect(result.state.cursor).toEqual([0, 1]);
  });

  it("handles key k as move_up", () => {
    const state = createTestState();
    state.cursor = [0, 1];
    const ctx = {
      state,
      jsonMode: false,
      verbose: false,
      output: () => {},
      actionLog: [],
    };

    const result = executeCommand("key k", ctx);

    expect(result.state.cursor).toEqual([0, 0]);
  });
});

describe("runShell", () => {
  it("executes multiple commands", () => {
    const state = createTestState();
    state.cursor = [0, 0];
    const outputs: (OutputEvent | string)[] = [];

    const finalState = runShell(["move_down", "move_down"], state, {
      output: (e) => outputs.push(e),
    });

    expect(finalState.cursor).toEqual([0, 2]);
  });

  it("stops on quit", () => {
    const state = createTestState();
    state.cursor = [0, 0];

    const finalState = runShell(["move_down", "quit", "move_down"], state, {
      output: () => {},
    });

    // Should stop after quit, so only one move_down executed
    expect(finalState.cursor).toEqual([0, 1]);
  });

  it("skips comments and empty lines", () => {
    const state = createTestState();
    state.cursor = [0, 0];

    const finalState = runShell(
      ["# comment", "", "move_down", "   ", "move_down"],
      state,
      { output: () => {} },
    );

    expect(finalState.cursor).toEqual([0, 2]);
  });

  it("outputs JSON in json mode", () => {
    const state = createTestState();
    state.cursor = [0, 0];
    const outputs: OutputEvent[] = [];

    runShell(["move_down"], state, {
      jsonMode: true,
      output: (e) => {
        if (typeof e !== "string") outputs.push(e);
      },
    });

    // Should have init, action, and state events
    const events = outputs.map((o) => o.event);
    expect(events).toContain("init");
    expect(events).toContain("action");
    expect(events).toContain("state");
  });

  it("handles state command", () => {
    const state = createTestState();
    const outputs: string[] = [];

    runShell(["state"], state, {
      jsonMode: false,
      output: (e) => {
        if (typeof e === "string") outputs.push(e);
      },
    });

    expect(outputs.some((o) => o.includes("cursor:"))).toBe(true);
  });

  it("handles view command", () => {
    const state = createTestState();
    const outputs: string[] = [];

    runShell(["view"], state, {
      jsonMode: false,
      output: (e) => {
        if (typeof e === "string") outputs.push(e);
      },
    });

    expect(outputs.some((o) => o.includes("Todo"))).toBe(true);
  });
});

describe("REPL filesystem commands", () => {
  // Helper to capture outputs
  function runWithOutput(
    commands: string[],
    state: TreeState,
  ): { finalState: TreeState; outputs: string[] } {
    const outputs: string[] = [];
    const finalState = runShell(commands, state, {
      jsonMode: false,
      output: (e) => {
        if (typeof e === "string") outputs.push(e);
      },
    });
    return { finalState, outputs };
  }

  it("pwd shows current path", () => {
    const state = createTestState();
    state.cursor = [0, 1]; // Todo/Task 2
    const { outputs } = runWithOutput(["pwd"], state);

    expect(outputs[0]).toBe("Todo/Task 2");
  });

  it("pwd shows root path when cursor at top level", () => {
    const state = createTestState();
    state.cursor = [0]; // Todo column
    const { outputs } = runWithOutput(["pwd"], state);

    expect(outputs[0]).toBe("Todo");
  });

  it("ls shows children of current node", () => {
    const state = createTestState();
    state.cursor = [0]; // Todo column
    const { outputs } = runWithOutput(["ls"], state);

    // Should list Task 1, Task 2, Task 3 with task status icons
    expect(outputs[0]).toContain("Task 1");
    expect(outputs[0]).toContain("Task 2");
    expect(outputs[0]).toContain("Task 3");
  });

  it("ls shows (empty) for node without children", () => {
    const state = createTestState();
    state.cursor = [0, 0]; // Task 1 (no children)
    const { outputs } = runWithOutput(["ls"], state);

    expect(outputs[0]).toBe("(empty)");
  });

  it("ls with path argument lists specified node children", () => {
    const state = createTestState();
    state.cursor = [0, 0]; // Start at Task 1
    const { outputs } = runWithOutput(["ls .."], state);

    // Should list Todo's children (siblings of Task 1)
    expect(outputs[0]).toContain("Task 1");
    expect(outputs[0]).toContain("Task 2");
  });

  it("cd changes cursor position", () => {
    const state = createTestState();
    state.cursor = [0]; // Todo column
    // Navigate to child "Task 2" using slugified name (no spaces)
    const { finalState } = runWithOutput(["cd task-2"], state);

    expect(finalState.cursor).toEqual([0, 1]); // Task 2
  });

  it("cd .. goes to parent", () => {
    const state = createTestState();
    state.cursor = [0, 1]; // Todo/Task 2
    const { finalState } = runWithOutput(["cd .."], state);

    expect(finalState.cursor).toEqual([0]); // Back to Todo
  });

  it("cd reports error for non-existent path", () => {
    const state = createTestState();
    const { outputs } = runWithOutput(["cd nonexistent"], state);

    expect(outputs[0]).toContain("cd:");
    expect(outputs[0]).toContain("No such node");
  });

  it("tree shows hierarchical structure", () => {
    const state = createTestState();
    state.cursor = [0]; // Todo column
    const { outputs } = runWithOutput(["tree"], state);

    const output = outputs[0];
    expect(output).toContain("Todo");
    expect(output).toContain("├──");
    expect(output).toContain("└──");
    expect(output).toContain("Task 1");
    expect(output).toContain("Task 3");
  });

  it("tree with depth limit truncates output", () => {
    const state = createTestState();
    state.cursor = [0];
    const { outputs } = runWithOutput(["tree 1"], state);

    const output = outputs[0];
    expect(output).toContain("Todo");
    // Should show children at depth 1 with (+N) suffix if they have children
  });

  it("cat shows node details", () => {
    const state = createTestState();
    state.cursor = [0, 0]; // Task 1
    const { outputs } = runWithOutput(["cat"], state);

    const output = outputs[0];
    expect(output).toContain("# Task 1");
    expect(output).toContain("id: card-1");
    expect(output).toContain("status: todo");
  });

  it("cat with path shows specified node", () => {
    const state = createTestState();
    state.cursor = [0, 0]; // Task 1
    const { outputs } = runWithOutput(["cat ../task-3"], state);

    const output = outputs[0];
    expect(output).toContain("# Task 3");
    expect(output).toContain("id: card-3");
  });

  it("path resolution by slug works", () => {
    const state = createTestState();
    state.cursor = [0]; // Todo
    // "In Progress" should match "in-progress" slug
    const { finalState } = runWithOutput(["cd ../in-progress"], state);

    // Should navigate to "In Progress" column
    expect(finalState.cursor).toEqual([1]);
  });

  it("absolute path from root works", () => {
    const state = createTestState();
    state.cursor = [0, 2]; // Deep in the tree
    const { finalState } = runWithOutput(["cd /in-progress"], state);

    expect(finalState.cursor).toEqual([1]);
  });
});

describe("runShell - integration scenarios", () => {
  it("navigates around the tree", () => {
    const state = createTestState();
    state.cursor = [0, 0]; // card-1

    const finalState = runShell(
      [
        "nav_next_sibling", // card-1 -> card-2
        "nav_next_sibling", // card-2 -> card-3
        "nav_parent", // card-3 -> col-1
        "nav_next_sibling", // col-1 -> col-2
      ],
      state,
      { output: () => {} },
    );

    expect(finalState.cursor).toEqual([1]);
  });

  it("manages selection", () => {
    const state = createTestState();

    const finalState = runShell(
      [
        "select_node_add card-1",
        "select_node_add card-2",
        "select_node_toggle card-1", // Remove card-1
      ],
      state,
      { output: () => {} },
    );

    expect(finalState.selectedNodes.has("card-1")).toBe(false);
    expect(finalState.selectedNodes.has("card-2")).toBe(true);
  });

  it("manages fold state", () => {
    const state = createTestState();

    const finalState = runShell(
      [
        "toggle_fold card-2",
        "fold_level 1", // Fold all at depth 1
      ],
      state,
      { output: () => {} },
    );

    expect(finalState.foldedNodes.has("card-1")).toBe(true);
    expect(finalState.foldedNodes.has("card-2")).toBe(true);
    expect(finalState.foldedNodes.has("card-3")).toBe(true);
  });

  it("handles JSON input", () => {
    const state = createTestState();
    state.cursor = [0, 0];

    const finalState = runShell(
      ['{"type": "NAV_NEXT_SIBLING"}', '{"type": "NAV_NEXT_SIBLING"}'],
      state,
      { jsonMode: true, output: () => {} },
    );

    expect(finalState.cursor).toEqual([0, 2]);
  });
});
