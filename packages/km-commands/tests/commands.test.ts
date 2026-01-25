/**
 * Commands Tests
 *
 * Tests that all command definitions return correct action types
 * and handle context appropriately.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { allCommands } from "../src/commands/index.ts";
import { navigationCommands } from "../src/commands/navigation.ts";
import { selectionCommands } from "../src/commands/selection.ts";
import { editCommands } from "../src/commands/edit.ts";
import { taskCommands } from "../src/commands/task.ts";
import { viewCommands } from "../src/commands/view.ts";
import { historyCommands } from "../src/commands/history.ts";
import { tuiCommands } from "../src/commands/tui.ts";
import type { CommandContext, TNode, CommandAction } from "../src/types.ts";

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
    childrenLoaded: true,
    isTask: opts?.isTask ?? false,
    depth: 0,
    data: {},
    created_at: 0,
    updated_at: 0,
    version: "",
    task_status: opts?.task_status,
    ...opts,
  };
}

// Helper to create minimal CommandContext
function createContext(overrides?: Partial<CommandContext>): CommandContext {
  const defaultNode = createNode("current-node");

  return {
    currentNode: defaultNode,
    currentNodeId: "current-node",
    selectedNodes: [],
    viewMode: "cards",
    siblingCount: 1,
    siblingIndex: 0,
    columnIndex: 0,
    columnCount: 1,
    moveMode: false,
    foldedNodes: new Set(),
    ...overrides,
  };
}

// Helper to create context with task node
function createTaskContext(
  status?: "todo" | "wip" | "done" | "dropped" | "blocked",
): CommandContext {
  const taskNode = createNode("task-node", [], {
    isTask: true,
    task_status: status ?? "todo",
  });

  return {
    currentNode: taskNode,
    currentNodeId: "task-node",
    selectedNodes: [],
    viewMode: "cards",
    siblingCount: 1,
    siblingIndex: 0,
    columnIndex: 0,
    columnCount: 1,
    moveMode: false,
    foldedNodes: new Set(),
  };
}

// Helper to create context with null currentNode
function createNullNodeContext(): CommandContext {
  return {
    currentNode: null,
    currentNodeId: null,
    selectedNodes: [],
    viewMode: "cards",
    siblingCount: 0,
    siblingIndex: 0,
    columnIndex: 0,
    columnCount: 0,
    moveMode: false,
    foldedNodes: new Set(),
  };
}

describe("allCommands", () => {
  it("exports all command groups", () => {
    const expectedCount =
      navigationCommands.length +
      selectionCommands.length +
      editCommands.length +
      taskCommands.length +
      viewCommands.length +
      historyCommands.length +
      tuiCommands.length;

    expect(allCommands.length).toBe(expectedCount);
  });

  it("all commands have required fields", () => {
    for (const cmd of allCommands) {
      expect(cmd.id).toBeDefined();
      expect(typeof cmd.id).toBe("string");
      expect(cmd.name).toBeDefined();
      expect(typeof cmd.name).toBe("string");
      expect(cmd.description).toBeDefined();
      expect(typeof cmd.description).toBe("string");
      expect(cmd.category).toBeDefined();
      expect(typeof cmd.execute).toBe("function");
    }
  });

  it("all command ids are unique", () => {
    const ids = allCommands.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe("navigationCommands", () => {
  describe("structural cursor movement (hjkl)", () => {
    const cursorCommands = [
      { id: "cursor_prev", dir: "prev" as const },
      { id: "cursor_next", dir: "next" as const },
      { id: "cursor_in", dir: "in" as const },
      { id: "cursor_out", dir: "out" as const },
      { id: "cursor_first", dir: "first" as const },
      { id: "cursor_last", dir: "last" as const },
    ];

    for (const { id, dir } of cursorCommands) {
      it(`${id} returns CURSOR_MOVE with dir="${dir}"`, () => {
        const cmd = navigationCommands.find((c) => c.id === id);
        expect(cmd).toBeDefined();

        const result = cmd!.execute(createContext());

        expect(result).toEqual({ type: "CURSOR_MOVE", dir });
      });
    }
  });

  describe("visual cursor movement (arrows)", () => {
    const arrowCommands = [
      { id: "cursor_up", dir: "up" as const },
      { id: "cursor_down", dir: "down" as const },
      { id: "cursor_left", dir: "left" as const },
      { id: "cursor_right", dir: "right" as const },
    ];

    for (const { id, dir } of arrowCommands) {
      it(`${id} returns CURSOR_MOVE with dir="${dir}"`, () => {
        const cmd = navigationCommands.find((c) => c.id === id);
        expect(cmd).toBeDefined();

        const result = cmd!.execute(createContext());

        expect(result).toEqual({ type: "CURSOR_MOVE", dir });
      });
    }
  });

  describe("history navigation", () => {
    it("nav_back returns NAV_BACK action", () => {
      const cmd = navigationCommands.find((c) => c.id === "nav_back");
      const result = cmd!.execute(createContext());

      expect(result).toEqual({ type: "NAV_BACK" });
    });

    it("nav_forward returns NAV_FORWARD action", () => {
      const cmd = navigationCommands.find((c) => c.id === "nav_forward");
      const result = cmd!.execute(createContext());

      expect(result).toEqual({ type: "NAV_FORWARD" });
    });
  });

  describe("zoom commands", () => {
    it("zoom_in returns ZOOM_IN with nodeId when currentNode exists", () => {
      const node = createNode("zoom-target");
      const ctx = createContext({
        currentNode: node,
        currentNodeId: "zoom-target",
      });

      const cmd = navigationCommands.find((c) => c.id === "zoom_in");
      const result = cmd!.execute(ctx);

      // Simplified action - just nodeId, no nodes array
      expect(result).toEqual({
        type: "ZOOM_IN",
        nodeId: "zoom-target",
      });
    });

    it("zoom_in returns null when currentNode is null", () => {
      const ctx = createNullNodeContext();
      const cmd = navigationCommands.find((c) => c.id === "zoom_in");
      const result = cmd!.execute(ctx);

      expect(result).toBeNull();
    });

    it("zoom_out returns ZOOM_OUT", () => {
      const cmd = navigationCommands.find((c) => c.id === "zoom_out");
      const result = cmd!.execute(createContext());

      // Simplified action - no nodes array
      expect(result).toEqual({ type: "ZOOM_OUT" });
    });
  });
});

describe("selectionCommands", () => {
  describe("basic selection operations", () => {
    it("select_toggle returns SELECT_NODE_TOGGLE when currentNodeId exists", () => {
      const ctx = createContext({ currentNodeId: "node-1" });
      const cmd = selectionCommands.find((c) => c.id === "select_toggle");
      const result = cmd!.execute(ctx);

      expect(result).toEqual({ type: "SELECT_NODE_TOGGLE", nodeId: "node-1" });
    });

    it("select_toggle returns null when currentNodeId is null", () => {
      const ctx = createNullNodeContext();
      const cmd = selectionCommands.find((c) => c.id === "select_toggle");
      const result = cmd!.execute(ctx);

      expect(result).toBeNull();
    });

    it("select_add returns SELECT_NODE_ADD when currentNodeId exists", () => {
      const ctx = createContext({ currentNodeId: "node-2" });
      const cmd = selectionCommands.find((c) => c.id === "select_add");
      const result = cmd!.execute(ctx);

      expect(result).toEqual({ type: "SELECT_NODE_ADD", nodeId: "node-2" });
    });

    it("select_remove returns SELECT_NODE_REMOVE when currentNodeId exists", () => {
      const ctx = createContext({ currentNodeId: "node-3" });
      const cmd = selectionCommands.find((c) => c.id === "select_remove");
      const result = cmd!.execute(ctx);

      expect(result).toEqual({ type: "SELECT_NODE_REMOVE", nodeId: "node-3" });
    });
  });

  describe("bulk selection", () => {
    it("select_all_siblings returns SELECT_ALL_SIBLINGS", () => {
      const cmd = selectionCommands.find((c) => c.id === "select_all_siblings");
      const result = cmd!.execute(createContext());

      expect(result).toEqual({ type: "SELECT_ALL_SIBLINGS" });
    });

    it("select_all returns SELECT_ALL", () => {
      const cmd = selectionCommands.find((c) => c.id === "select_all");
      const result = cmd!.execute(createContext());

      expect(result).toEqual({ type: "SELECT_ALL" });
    });

    it("clear_selection returns CLEAR_SELECTION", () => {
      const cmd = selectionCommands.find((c) => c.id === "clear_selection");
      const result = cmd!.execute(createContext());

      expect(result).toEqual({ type: "CLEAR_SELECTION" });
    });
  });

  describe("extend selection", () => {
    const extendCommands = [
      { id: "extend_select_up", type: "EXTEND_SELECT_UP" as const },
      { id: "extend_select_down", type: "EXTEND_SELECT_DOWN" as const },
      { id: "extend_select_left", type: "EXTEND_SELECT_LEFT" as const },
      { id: "extend_select_right", type: "EXTEND_SELECT_RIGHT" as const },
    ];

    for (const { id, type } of extendCommands) {
      it(`${id} returns ${type}`, () => {
        const cmd = selectionCommands.find((c) => c.id === id);
        const result = cmd!.execute(createContext());

        expect(result).toEqual({ type });
      });
    }
  });
});

describe("editCommands", () => {
  describe("move mode", () => {
    it("enter_move_mode returns ENTER_MOVE_MODE", () => {
      const cmd = editCommands.find((c) => c.id === "enter_move_mode");
      const result = cmd!.execute(createContext());

      expect(result).toEqual({ type: "ENTER_MOVE_MODE" });
    });

    it("confirm_move returns CONFIRM_MOVE", () => {
      const cmd = editCommands.find((c) => c.id === "confirm_move");
      const result = cmd!.execute(createContext());

      expect(result).toEqual({ type: "CONFIRM_MOVE" });
    });

    it("cancel_move returns CANCEL_MOVE", () => {
      const cmd = editCommands.find((c) => c.id === "cancel_move");
      const result = cmd!.execute(createContext());

      expect(result).toEqual({ type: "CANCEL_MOVE" });
    });

    it("confirm_move and cancel_move have move mode restriction", () => {
      const confirmCmd = editCommands.find((c) => c.id === "confirm_move");
      const cancelCmd = editCommands.find((c) => c.id === "cancel_move");

      expect(confirmCmd!.modes).toContain("move");
      expect(cancelCmd!.modes).toContain("move");
    });
  });

  describe("shift commands", () => {
    const shiftCommands = [
      { id: "shift_up", type: "SHIFT_UP" as const },
      { id: "shift_down", type: "SHIFT_DOWN" as const },
      { id: "shift_left", type: "SHIFT_LEFT" as const },
      { id: "shift_right", type: "SHIFT_RIGHT" as const },
    ];

    for (const { id, type } of shiftCommands) {
      it(`${id} returns ${type}`, () => {
        const cmd = editCommands.find((c) => c.id === id);
        const result = cmd!.execute(createContext());

        expect(result).toEqual({ type });
      });
    }
  });
});

describe("taskCommands", () => {
  describe("cycle_task_status", () => {
    const cmd = taskCommands.find((c) => c.id === "cycle_task_status")!;

    it("returns null when currentNode is null", () => {
      const result = cmd.execute(createNullNodeContext());
      expect(result).toBeNull();
    });

    it("returns null when node is not a task", () => {
      const nonTaskNode = createNode("non-task", [], { isTask: false });
      const ctx = createContext({
        currentNode: nonTaskNode,
        currentNodeId: "non-task",
      });

      const result = cmd.execute(ctx);
      expect(result).toBeNull();
    });

    it("returns TASK_SET_STATUS with next status", () => {
      const ctx = createTaskContext("todo");
      const result = cmd.execute(ctx) as CommandAction;

      expect(result).toEqual({
        type: "TASK_SET_STATUS",
        nodeId: "task-node",
        status: "wip",
      });
    });

    it("cycles through statuses: todo -> wip -> done -> dropped -> todo", () => {
      const statuses: Array<"todo" | "wip" | "done" | "dropped"> = [
        "todo",
        "wip",
        "done",
        "dropped",
      ];
      const expectedNext = ["wip", "done", "dropped", "todo"];

      for (let i = 0; i < statuses.length; i++) {
        const ctx = createTaskContext(statuses[i]!);
        const result = cmd.execute(ctx) as { type: string; status: string };

        expect(result.status).toBe(expectedNext[i]!);
      }
    });

    it("treats undefined/null status as starting at todo", () => {
      const taskNode = createNode("task-node", [], {
        isTask: true,
        task_status: undefined,
      });
      const ctx = createContext({
        currentNode: taskNode,
        currentNodeId: "task-node",
      });

      const result = cmd.execute(ctx) as { type: string; status: string };
      expect(result.status).toBe("todo");
    });
  });

  describe("toggle_task_done", () => {
    const cmd = taskCommands.find((c) => c.id === "toggle_task_done")!;

    it("returns null when currentNode is null", () => {
      const result = cmd.execute(createNullNodeContext());
      expect(result).toBeNull();
    });

    it("returns null when node is not a task", () => {
      const ctx = createContext({ currentNode: createNode("not-task") });
      const result = cmd.execute(ctx);
      expect(result).toBeNull();
    });

    it("toggles from todo to done", () => {
      const ctx = createTaskContext("todo");
      const result = cmd.execute(ctx) as {
        type: string;
        nodeId: string;
        status: string;
      };

      expect(result).toEqual({
        type: "TASK_SET_STATUS",
        nodeId: "task-node",
        status: "done",
      });
    });

    it("toggles from done to todo", () => {
      const ctx = createTaskContext("done");
      const result = cmd.execute(ctx) as {
        type: string;
        nodeId: string;
        status: string;
      };

      expect(result).toEqual({
        type: "TASK_SET_STATUS",
        nodeId: "task-node",
        status: "todo",
      });
    });

    it("sets wip to done (not toggle)", () => {
      const ctx = createTaskContext("wip");
      const result = cmd.execute(ctx) as { type: string; status: string };

      expect(result.status).toBe("done");
    });
  });

  describe("direct status setters", () => {
    const statusSetters = [
      { id: "set_status_todo", status: "todo" as const },
      { id: "set_status_wip", status: "wip" as const },
      { id: "set_status_blocked", status: "blocked" as const },
      { id: "set_status_done", status: "done" as const },
      { id: "set_status_dropped", status: "dropped" as const },
    ];

    for (const { id, status } of statusSetters) {
      describe(id, () => {
        const cmd = taskCommands.find((c) => c.id === id)!;

        it(`returns TASK_SET_STATUS with status="${status}"`, () => {
          const ctx = createContext({ currentNodeId: "node-1" });
          const result = cmd.execute(ctx);

          expect(result).toEqual({
            type: "TASK_SET_STATUS",
            nodeId: "node-1",
            status,
          });
        });

        it("returns null when currentNodeId is null", () => {
          const ctx = createNullNodeContext();
          const result = cmd.execute(ctx);

          expect(result).toBeNull();
        });
      });
    }
  });
});

describe("viewCommands (fold and view config)", () => {
  describe("fold commands", () => {
    it("toggle_fold returns TOGGLE_FOLD with nodeId", () => {
      const ctx = createContext({ currentNodeId: "fold-target" });
      const cmd = viewCommands.find((c) => c.id === "toggle_fold");
      const result = cmd!.execute(ctx);

      expect(result).toEqual({ type: "TOGGLE_FOLD", nodeId: "fold-target" });
    });

    it("toggle_fold returns null when currentNodeId is null", () => {
      const ctx = createNullNodeContext();
      const cmd = viewCommands.find((c) => c.id === "toggle_fold");
      const result = cmd!.execute(ctx);

      expect(result).toBeNull();
    });

    it("toggle_collapse returns TOGGLE_COLLAPSE with nodeId", () => {
      const ctx = createContext({ currentNodeId: "collapse-target" });
      const cmd = viewCommands.find((c) => c.id === "toggle_collapse");
      const result = cmd!.execute(ctx);

      expect(result).toEqual({
        type: "TOGGLE_COLLAPSE",
        nodeId: "collapse-target",
      });
    });

    it("fold_all returns FOLD_LEVEL with depth 1", () => {
      const cmd = viewCommands.find((c) => c.id === "fold_all");
      const result = cmd!.execute(createContext());

      expect(result).toEqual({ type: "FOLD_LEVEL", depth: 1 });
    });

    it("unfold_all returns UNFOLD_LEVEL with depth 99", () => {
      const cmd = viewCommands.find((c) => c.id === "unfold_all");
      const result = cmd!.execute(createContext());

      expect(result).toEqual({ type: "UNFOLD_LEVEL", depth: 99 });
    });
  });

  describe("view configuration commands", () => {
    it("increase_outline_depth returns INCREASE_OUTLINE_DEPTH", () => {
      const cmd = viewCommands.find((c) => c.id === "increase_outline_depth");
      const result = cmd!.execute(createContext());

      expect(result).toEqual({ type: "INCREASE_OUTLINE_DEPTH" });
    });

    it("decrease_outline_depth returns DECREASE_OUTLINE_DEPTH", () => {
      const cmd = viewCommands.find((c) => c.id === "decrease_outline_depth");
      const result = cmd!.execute(createContext());

      expect(result).toEqual({ type: "DECREASE_OUTLINE_DEPTH" });
    });

    it("increase_content_lines returns INCREASE_CONTENT_LINES", () => {
      const cmd = viewCommands.find((c) => c.id === "increase_content_lines");
      const result = cmd!.execute(createContext());

      expect(result).toEqual({ type: "INCREASE_CONTENT_LINES" });
    });

    it("decrease_content_lines returns DECREASE_CONTENT_LINES", () => {
      const cmd = viewCommands.find((c) => c.id === "decrease_content_lines");
      const result = cmd!.execute(createContext());

      expect(result).toEqual({ type: "DECREASE_CONTENT_LINES" });
    });
  });
});

describe("historyCommands", () => {
  it("undo returns HISTORY_UNDO action", () => {
    const cmd = historyCommands.find((c) => c.id === "undo");
    const result = cmd!.execute(createContext());

    expect(result).toEqual({ type: "HISTORY_UNDO" });
  });

  it("redo returns HISTORY_REDO action", () => {
    const cmd = historyCommands.find((c) => c.id === "redo");
    const result = cmd!.execute(createContext());

    expect(result).toEqual({ type: "HISTORY_REDO" });
  });

  it("history commands are in Edit category", () => {
    for (const cmd of historyCommands) {
      expect(cmd.category).toBe("Edit");
    }
  });
});

describe("command categories", () => {
  it("all navigation commands are in Navigation category", () => {
    for (const cmd of navigationCommands) {
      expect(cmd.category).toBe("Navigation");
    }
  });

  it("all selection commands are in Selection category", () => {
    for (const cmd of selectionCommands) {
      expect(cmd.category).toBe("Selection");
    }
  });

  it("all edit commands are in Edit category", () => {
    for (const cmd of editCommands) {
      expect(cmd.category).toBe("Edit");
    }
  });

  it("all task commands are in Task category", () => {
    for (const cmd of taskCommands) {
      expect(cmd.category).toBe("Task");
    }
  });

  it("view commands are in Fold or View category", () => {
    for (const cmd of viewCommands) {
      expect(["Fold", "View"]).toContain(cmd.category);
    }
  });
});

describe("null context handling", () => {
  const nullCtx = createNullNodeContext();

  // Commands that should return null when currentNode/currentNodeId is null
  const nullSafeCommands = [
    "select_toggle",
    "select_add",
    "select_remove",
    "zoom_in",
    "toggle_fold",
    "toggle_collapse",
    "cycle_task_status",
    "toggle_task_done",
    "set_status_todo",
    "set_status_wip",
    "set_status_blocked",
    "set_status_done",
    "set_status_dropped",
  ];

  for (const cmdId of nullSafeCommands) {
    it(`${cmdId} returns null when currentNode is null`, () => {
      const cmd = allCommands.find((c) => c.id === cmdId);
      expect(cmd).toBeDefined();

      const result = cmd!.execute(nullCtx);
      expect(result).toBeNull();
    });
  }

  // Commands that should still return actions regardless of currentNode
  const alwaysActionCommands = [
    "cursor_next",
    "cursor_prev",
    "select_all",
    "clear_selection",
    "enter_move_mode",
    "undo",
    "redo",
    "fold_all",
  ];

  for (const cmdId of alwaysActionCommands) {
    it(`${cmdId} returns action even when currentNode is null`, () => {
      const cmd = allCommands.find((c) => c.id === cmdId);
      expect(cmd).toBeDefined();

      const result = cmd!.execute(nullCtx);
      expect(result).not.toBeNull();
    });
  }
});
