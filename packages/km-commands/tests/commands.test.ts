/**
 * Commands Tests
 *
 * Tests that all command definitions return correct action types
 * and handle context appropriately.
 */

import { describe, it, expect } from "vitest"
import { allCommands } from "../src/commands/index.ts"
import { navigationCommands } from "../src/commands/navigation.ts"
import { selectionCommands } from "../src/commands/selection.ts"
import { editCommands } from "../src/commands/edit.ts"
import { taskCommands } from "../src/commands/task.ts"
import { viewCommands } from "../src/commands/view.ts"
import { historyCommands } from "../src/commands/history.ts"
import { tuiCommands } from "../src/commands/tui.ts"
import { textEditingCommands } from "../src/commands/text-editing.ts"
import { blockEditCommands } from "../src/commands/block-edit.ts"
import { dialogCommands, filterDialogCommands, favoritesDialogCommands } from "../src/commands/dialog.ts"
import { paneCommands } from "../src/commands/pane.ts"
import type { CommandContext, TNode, KmOp, CommandDef } from "../src/types.ts"

// ============================================================================
// Test Helpers
// ============================================================================

/** Create minimal TNode for testing */
function createNode(id: string, children: TNode[] = [], opts?: Partial<TNode>): TNode {
  return {
    id,
    type: "h",
    item: opts?.item?.task ? { task: { status: opts.item.task.status ?? "todo", marker: "[ ]" } } : {},
    parent_id: null,
    parent_idx: 0,
    symlink_to: null,
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
    ...opts,
  }
}

/** Create minimal CommandContext for testing */
function createContext(overrides?: Partial<CommandContext>): CommandContext {
  const defaultNode = createNode("current-node")
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
    foldDepths: new Map(),
    ...overrides,
  }
}

/** Create context with task node */
function createTaskContext(status?: "todo" | "wip" | "done" | "dropped" | "blocked"): CommandContext {
  const taskNode = createNode("task-node", [], {
    isTask: true,
    item: { task: { status: status ?? "todo", marker: "[ ]" } },
  })
  return createContext({
    currentNode: taskNode,
    currentNodeId: "task-node",
  })
}

/** Create context with null currentNode */
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
    foldDepths: new Map(),
  }
}

/** Find command by id in a command list */
function findCommand(commands: readonly CommandDef[], id: string): CommandDef {
  const cmd = commands.find((c) => c.id === id)
  if (!cmd) throw new Error(`Command not found: ${id}`)
  return cmd
}

/** Execute a command and return the result */
function executeCommand(
  commands: readonly CommandDef[],
  id: string,
  ctx: CommandContext = createContext(),
): KmOp | KmOp[] | null {
  return findCommand(commands, id).execute(ctx)
}

/** Assert command returns expected action type */
function expectAction(
  commands: readonly CommandDef[],
  id: string,
  expected: Record<string, unknown> | null,
  ctx: CommandContext = createContext(),
): void {
  expect(executeCommand(commands, id, ctx)).toEqual(expected)
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
      tuiCommands.length +
      textEditingCommands.length +
      blockEditCommands.length +
      dialogCommands.length +
      filterDialogCommands.length +
      favoritesDialogCommands.length +
      paneCommands.length

    expect(allCommands.length).toBe(expectedCount)
  })

  it("all commands have required fields", () => {
    for (const cmd of allCommands) {
      expect(cmd.id).toBeDefined()
      expect(typeof cmd.id).toBe("string")
      expect(cmd.name).toBeDefined()
      expect(typeof cmd.name).toBe("string")
      expect(cmd.description).toBeDefined()
      expect(typeof cmd.description).toBe("string")
      expect(cmd.category).toBeDefined()
      expect(typeof cmd.execute).toBe("function")
    }
  })

  it("all command ids are unique", () => {
    const ids = allCommands.map((c) => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })
})

describe("navigationCommands", () => {
  describe("structural cursor movement (hjkl)", () => {
    it.each([
      ["cursor_prev", "prev"],
      ["cursor_next", "next"],
      ["cursor_in", "in"],
      ["cursor_out", "out"],
      ["cursor_first", "first"],
      ["cursor_last", "last"],
    ] as const)("%s returns CURSOR_MOVE with dir=%s", (id, dir) => {
      expectAction(navigationCommands, id, { type: "CURSOR_MOVE", dir })
    })
  })

  describe("visual cursor movement (arrows)", () => {
    it.each([
      ["cursor_up", "up"],
      ["cursor_down", "down"],
      ["cursor_left", "left"],
      ["cursor_right", "right"],
    ] as const)("%s returns CURSOR_MOVE with dir=%s", (id, dir) => {
      expectAction(navigationCommands, id, { type: "CURSOR_MOVE", dir })
    })
  })

  describe("history navigation", () => {
    it.each([
      ["nav_back", "NAV_BACK"],
      ["nav_forward", "NAV_FORWARD"],
    ] as const)("%s returns %s action", (id, type) => {
      expectAction(navigationCommands, id, { type })
    })
  })

  describe("zoom commands", () => {
    it("zoom_in returns ZOOM_IN with nodeId when currentNode exists", () => {
      const ctx = createContext({
        currentNode: createNode("zoom-target"),
        currentNodeId: "zoom-target",
      })
      expectAction(
        navigationCommands,
        "zoom_in",
        {
          type: "ZOOM_IN",
          nodeId: "zoom-target",
        },
        ctx,
      )
    })

    it("zoom_in returns null when currentNode is null", () => {
      expectAction(navigationCommands, "zoom_in", null, createNullNodeContext())
    })
  })
})

describe("selectionCommands", () => {
  describe("node-specific selection operations", () => {
    it.each([
      ["select_toggle", "SELECT_NODE_TOGGLE", "node-1"],
      ["select_add", "SELECT_NODE_ADD", "node-2"],
      ["select_remove", "SELECT_NODE_REMOVE", "node-3"],
    ] as const)("%s returns %s when currentNodeId exists", (id, type, nodeId) => {
      const ctx = createContext({ currentNodeId: nodeId })
      expectAction(selectionCommands, id, { type, nodeId }, ctx)
    })

    it.each([["select_toggle"], ["select_add"], ["select_remove"]])(
      "%s returns null when currentNodeId is null",
      (id) => {
        expectAction(selectionCommands, id, null, createNullNodeContext())
      },
    )
  })

  describe("bulk selection", () => {
    it.each([
      ["select_all_siblings", "SELECT_ALL_SIBLINGS"],
      ["select_all", "SELECT_ALL"],
      ["clear_selection", "CLEAR_SELECTION"],
    ] as const)("%s returns %s", (id, type) => {
      expectAction(selectionCommands, id, { type })
    })
  })

  describe("extend selection", () => {
    it.each([
      ["extend_select_up", "EXTEND_SELECT_UP"],
      ["extend_select_down", "EXTEND_SELECT_DOWN"],
      ["extend_select_left", "EXTEND_SELECT_LEFT"],
      ["extend_select_right", "EXTEND_SELECT_RIGHT"],
    ] as const)("%s returns %s", (id, type) => {
      expectAction(selectionCommands, id, { type })
    })
  })
})

describe("editCommands", () => {
  describe("move mode", () => {
    it.each([
      ["enter_move_mode", "ENTER_MOVE_MODE"],
      ["confirm_move", "CONFIRM_MOVE"],
      ["cancel_move", "CANCEL_MOVE"],
    ] as const)("%s returns %s", (id, type) => {
      expectAction(editCommands, id, { type })
    })

    it.each([["confirm_move"], ["cancel_move"]])("%s has move mode restriction", (id) => {
      expect(findCommand(editCommands, id).modes).toContain("move")
    })
  })

  describe("shift commands", () => {
    it.each([
      ["shift_up", "SHIFT_UP"],
      ["shift_down", "SHIFT_DOWN"],
      ["shift_left", "SHIFT_LEFT"],
      ["shift_right", "SHIFT_RIGHT"],
    ] as const)("%s returns %s", (id, type) => {
      expectAction(editCommands, id, { type })
    })
  })
})

describe("taskCommands", () => {
  describe("cycle_task_status", () => {
    it("returns null when currentNode is null", () => {
      expectAction(taskCommands, "cycle_task_status", null, createNullNodeContext())
    })

    it("returns null when node is not a task", () => {
      const ctx = createContext({
        currentNode: createNode("non-task", [], { isTask: false }),
        currentNodeId: "non-task",
      })
      expectAction(taskCommands, "cycle_task_status", null, ctx)
    })

    it("emits TASK_CYCLE_STATUS for any task status (handler cycles per-card)", () => {
      // km-tui.task-toggle-cycles: cycle_task_status must emit TASK_CYCLE_STATUS
      // (no pre-computed status) so the dispatcher can advance each selected
      // card from its own current status when multi-selected.
      for (const from of ["todo", "wip", "blocked", "done", "dropped"] as const) {
        const result = executeCommand(taskCommands, "cycle_task_status", createTaskContext(from)) as KmOp
        expect(result).toEqual({
          type: "TASK_CYCLE_STATUS",
          nodeId: "task-node",
        })
      }
    })

    it("emits TASK_CYCLE_STATUS even when task has no status yet", () => {
      const ctx = createContext({
        currentNode: createNode("task-node", [], {
          isTask: true,
          item: { task: undefined },
        }),
        currentNodeId: "task-node",
      })
      const result = executeCommand(taskCommands, "cycle_task_status", ctx) as KmOp
      expect(result).toEqual({ type: "TASK_CYCLE_STATUS", nodeId: "task-node" })
    })
  })

  describe("toggle_task_done", () => {
    it("returns null when currentNode is null", () => {
      expectAction(taskCommands, "toggle_task_done", null, createNullNodeContext())
    })

    it("returns null when node is not a task", () => {
      expectAction(taskCommands, "toggle_task_done", null, createContext({ currentNode: createNode("not-task") }))
    })

    it.each([
      ["todo", "done"],
      ["done", "todo"],
      ["wip", "done"],
    ] as const)("toggles %s -> %s", (from, to) => {
      const result = executeCommand(taskCommands, "toggle_task_done", createTaskContext(from)) as KmOp
      expect(result).toEqual({
        type: "TASK_SET_STATUS",
        nodeId: "task-node",
        status: to,
      })
    })
  })

  describe("direct status setters", () => {
    it.each([
      ["set_status_todo", "todo"],
      ["set_status_wip", "wip"],
      ["set_status_blocked", "blocked"],
      ["set_status_done", "done"],
      ["set_status_dropped", "dropped"],
    ] as const)("%s returns TASK_SET_STATUS with status=%s", (id, status) => {
      const ctx = createContext({ currentNodeId: "node-1" })
      expectAction(taskCommands, id, { type: "TASK_SET_STATUS", nodeId: "node-1", status }, ctx)
    })

    it.each([
      ["set_status_todo"],
      ["set_status_wip"],
      ["set_status_blocked"],
      ["set_status_done"],
      ["set_status_dropped"],
    ])("%s returns null when currentNodeId is null", (id) => {
      expectAction(taskCommands, id, null, createNullNodeContext())
    })
  })
})

describe("viewCommands (fold and view config)", () => {
  describe("fold commands", () => {
    it("toggle_fold returns TOGGLE_FOLD with nodeId", () => {
      expectAction(
        viewCommands,
        "toggle_fold",
        { type: "TOGGLE_FOLD", nodeId: "fold-target" },
        createContext({ currentNodeId: "fold-target" }),
      )
    })

    it("toggle_fold returns null when currentNodeId is null", () => {
      expectAction(viewCommands, "toggle_fold", null, createNullNodeContext())
    })

    it("toggle_collapse returns TOGGLE_COLLAPSE with nodeId", () => {
      expectAction(
        viewCommands,
        "toggle_collapse",
        { type: "TOGGLE_COLLAPSE", nodeId: "collapse-target" },
        createContext({ currentNodeId: "collapse-target" }),
      )
    })

    it("fold_all returns FOLD_LEVEL with depth 1", () => {
      expectAction(viewCommands, "fold_all_more", { type: "FOLD_LEVEL", depth: 1 })
    })

    it("unfold_all returns UNFOLD_LEVEL with depth 99", () => {
      expectAction(viewCommands, "unfold_all_more", { type: "UNFOLD_LEVEL", depth: 99 })
    })
  })

  describe("view configuration commands", () => {
    it.each([
      ["increase_outline_depth", "INCREASE_OUTLINE_DEPTH"],
      ["decrease_outline_depth", "DECREASE_OUTLINE_DEPTH"],
      ["increase_content_lines", "INCREASE_CONTENT_LINES"],
      ["decrease_content_lines", "DECREASE_CONTENT_LINES"],
      ["clear_filters", "CLEAR_FILTERS"],
    ] as const)("%s returns %s", (id, type) => {
      expectAction(viewCommands, id, { type })
    })
  })
})

describe("historyCommands", () => {
  it.each([
    ["undo", "HISTORY_UNDO"],
    ["redo", "HISTORY_REDO"],
  ] as const)("%s returns %s action", (id, type) => {
    expectAction(historyCommands, id, { type })
  })

  it("all history commands are in Edit category", () => {
    for (const cmd of historyCommands) {
      expect(cmd.category).toBe("Edit")
    }
  })
})

describe("command categories", () => {
  it.each([
    ["navigation", navigationCommands, "Navigation"],
    ["selection", selectionCommands, "Selection"],
    ["edit", editCommands, "Edit"],
    ["task", taskCommands, "Task"],
  ] as const)("all %s commands are in %s category", (_, commands, category) => {
    for (const cmd of commands) {
      expect(cmd.category).toBe(category)
    }
  })

  it("view commands are in Fold or View category", () => {
    for (const cmd of viewCommands) {
      expect(["Fold", "View"]).toContain(cmd.category)
    }
  })
})

describe("null context handling", () => {
  const nullCtx = createNullNodeContext()

  // Commands that should return null when currentNode/currentNodeId is null
  it.each([
    ["select_toggle"],
    ["select_add"],
    ["select_remove"],
    ["zoom_in"],
    ["toggle_fold"],
    ["toggle_collapse"],
    ["cycle_task_status"],
    ["toggle_task_done"],
    ["set_status_todo"],
    ["set_status_wip"],
    ["set_status_blocked"],
    ["set_status_done"],
    ["set_status_dropped"],
  ])("%s returns null when currentNode is null", (cmdId) => {
    expectAction(allCommands, cmdId, null, nullCtx)
  })

  // Commands that should still return actions regardless of currentNode
  it.each([
    ["cursor_next"],
    ["cursor_prev"],
    ["select_all"],
    ["clear_selection"],
    ["enter_move_mode"],
    ["undo"],
    ["redo"],
    ["fold_all_more"],
  ])("%s returns action even when currentNode is null", (cmdId) => {
    const result = executeCommand(allCommands, cmdId, nullCtx)
    expect(result).not.toBeNull()
  })
})
