/**
 * App Commands
 *
 * Unified command system for the TUI application.
 * Commands are named operations that can be triggered from multiple sources:
 * - Keyboard shortcuts
 * - Command palette
 * - CLI (via km-sh)
 *
 * Architecture:
 * ```
 * User Input (key, click, command palette)
 *     ↓
 * Command Registry (maps input → command name)
 *     ↓
 * Command Executor (command → typed action)
 *     ↓
 * dispatch(action)
 *     ↓
 * Reducer Chain (App → Board)
 *     ↓
 * Effect Layer (handles TAction side effects)
 * ```
 *
 * Key Design Principles:
 * 1. Commands can have toggle semantics (they read state, compute target)
 * 2. Actions are idempotent (they set to a value, never toggle)
 * 3. Toggle logic lives in commands, not reducers
 */

import type { AppUIAction } from "./appState.ts";
import type { BoardAction, TAction, TNode, TaskStatus } from "@km/board";

// ===== Command Context =====

/**
 * Context provided to commands for computing actions.
 * Commands read this to determine what action to create.
 */
export interface CommandContext {
  /** Currently focused node (at cursor) */
  currentNode: TNode | null;
  /** Current node's ID */
  currentNodeId: string | null;
  /** Current task status (if current node is a task) */
  currentTaskStatus: TaskStatus | null;
  /** Whether current node is a task */
  isTask: boolean;
  /** Parent node ID */
  parentNodeId: string | null;
  /** Sibling count at current level */
  siblingCount: number;
  /** Current index within siblings */
  currentIndex: number;
  /** Depth in tree */
  depth: number;
}

// ===== Action Types =====

/**
 * All actions that can be dispatched.
 */
export type AnyAction = BoardAction | AppUIAction | TAction;

// ===== Command Definition =====

export type CommandCategory =
  | "Navigation"
  | "Selection"
  | "Fold"
  | "Edit"
  | "Task"
  | "Search"
  | "Modal"
  | "View";

/**
 * Command definition.
 * Commands are named operations that create typed actions.
 */
export interface CommandDef {
  /** Unique identifier (snake_case) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description */
  description: string;
  /** Keyboard shortcut(s) for display */
  shortcuts?: string[];
  /** Category for grouping in command palette */
  category: CommandCategory;
  /**
   * Execute the command given context.
   * Returns an action to dispatch, or null if command cannot execute.
   */
  execute: (ctx: CommandContext) => AnyAction | null;
}

// ===== Task Status Helpers =====

/**
 * Get next status in cycle: todo -> wip -> done -> dropped -> todo
 */
export function getNextTaskStatus(current: TaskStatus | null): TaskStatus {
  switch (current) {
    case "todo":
      return "wip";
    case "wip":
      return "done";
    case "done":
      return "dropped";
    case "dropped":
      return "todo";
    default:
      return "todo";
  }
}

// ===== Command Registry =====

/**
 * All commands registered in the system.
 * Order matters for display in command palette.
 */
export const commands: CommandDef[] = [
  // ===== Navigation Commands =====
  {
    id: "cursor_up",
    name: "Move Up",
    description: "Move cursor to previous sibling",
    shortcuts: ["k", "↑"],
    category: "Navigation",
    execute: () => ({ type: "CURSOR_MOVE", dir: "prev" }),
  },
  {
    id: "cursor_down",
    name: "Move Down",
    description: "Move cursor to next sibling",
    shortcuts: ["j", "↓"],
    category: "Navigation",
    execute: () => ({ type: "CURSOR_MOVE", dir: "next" }),
  },
  {
    id: "cursor_left",
    name: "Move to Parent",
    description: "Move cursor to parent node",
    shortcuts: ["h", "←"],
    category: "Navigation",
    execute: () => ({ type: "CURSOR_MOVE", dir: "out" }),
  },
  {
    id: "cursor_right",
    name: "Move to Child",
    description: "Move cursor to first child",
    shortcuts: ["l", "→"],
    category: "Navigation",
    execute: () => ({ type: "CURSOR_MOVE", dir: "in" }),
  },
  {
    id: "cursor_first",
    name: "Move to First",
    description: "Move cursor to first sibling",
    shortcuts: ["gg"],
    category: "Navigation",
    execute: () => ({ type: "CURSOR_MOVE", dir: "first" }),
  },
  {
    id: "cursor_last",
    name: "Move to Last",
    description: "Move cursor to last sibling",
    shortcuts: ["G"],
    category: "Navigation",
    execute: () => ({ type: "CURSOR_MOVE", dir: "last" }),
  },

  // ===== Task Commands =====
  {
    id: "toggle_task_done",
    name: "Toggle Done",
    description: "Toggle task between done and todo",
    shortcuts: ["x"],
    category: "Task",
    execute: (ctx) => {
      if (!ctx.isTask || !ctx.currentNodeId) return null;
      // Toggle logic: if done -> todo, else -> done
      const newStatus = ctx.currentTaskStatus === "done" ? "todo" : "done";
      return {
        type: "UPDATE_NODE",
        nodeId: ctx.currentNodeId,
        updates: { task_status: newStatus },
      };
    },
  },
  {
    id: "cycle_task_status",
    name: "Cycle Status",
    description: "Cycle through task statuses (todo → wip → done → dropped)",
    shortcuts: ["Space"],
    category: "Task",
    execute: (ctx) => {
      if (!ctx.isTask || !ctx.currentNodeId) return null;
      const newStatus = getNextTaskStatus(ctx.currentTaskStatus);
      return {
        type: "UPDATE_NODE",
        nodeId: ctx.currentNodeId,
        updates: { task_status: newStatus },
      };
    },
  },
  {
    id: "set_task_todo",
    name: "Set Todo",
    description: "Set task status to todo",
    shortcuts: [],
    category: "Task",
    execute: (ctx) => {
      if (!ctx.isTask || !ctx.currentNodeId) return null;
      return {
        type: "UPDATE_NODE",
        nodeId: ctx.currentNodeId,
        updates: { task_status: "todo" },
      };
    },
  },
  {
    id: "set_task_wip",
    name: "Set In Progress",
    description: "Set task status to work in progress",
    shortcuts: [],
    category: "Task",
    execute: (ctx) => {
      if (!ctx.isTask || !ctx.currentNodeId) return null;
      return {
        type: "UPDATE_NODE",
        nodeId: ctx.currentNodeId,
        updates: { task_status: "wip" },
      };
    },
  },
  {
    id: "set_task_done",
    name: "Set Done",
    description: "Set task status to done",
    shortcuts: [],
    category: "Task",
    execute: (ctx) => {
      if (!ctx.isTask || !ctx.currentNodeId) return null;
      return {
        type: "UPDATE_NODE",
        nodeId: ctx.currentNodeId,
        updates: { task_status: "done" },
      };
    },
  },
  {
    id: "set_task_blocked",
    name: "Set Blocked",
    description: "Set task status to blocked",
    shortcuts: [],
    category: "Task",
    execute: (ctx) => {
      if (!ctx.isTask || !ctx.currentNodeId) return null;
      return {
        type: "UPDATE_NODE",
        nodeId: ctx.currentNodeId,
        updates: { task_status: "blocked" },
      };
    },
  },
  {
    id: "set_task_dropped",
    name: "Set Dropped",
    description: "Set task status to dropped/cancelled",
    shortcuts: [],
    category: "Task",
    execute: (ctx) => {
      if (!ctx.isTask || !ctx.currentNodeId) return null;
      return {
        type: "UPDATE_NODE",
        nodeId: ctx.currentNodeId,
        updates: { task_status: "dropped" },
      };
    },
  },

  // ===== Edit Commands =====
  {
    id: "delete_node",
    name: "Delete Node",
    description: "Delete the current node",
    shortcuts: ["d"],
    category: "Edit",
    execute: (ctx) => {
      if (!ctx.currentNodeId) return null;
      return { type: "DELETE_NODE", nodeId: ctx.currentNodeId };
    },
  },

  // ===== Fold Commands =====
  {
    id: "toggle_fold",
    name: "Toggle Fold",
    description: "Fold or unfold current node",
    shortcuts: ["z"],
    category: "Fold",
    execute: (ctx) => {
      if (!ctx.currentNodeId) return null;
      return { type: "TOGGLE_FOLD", nodeId: ctx.currentNodeId };
    },
  },

  // ===== Selection Commands =====
  {
    id: "toggle_select",
    name: "Toggle Selection",
    description: "Toggle selection of current node",
    shortcuts: ["v"],
    category: "Selection",
    execute: (ctx) => {
      if (!ctx.currentNodeId) return null;
      return { type: "SELECT_NODE_TOGGLE", nodeId: ctx.currentNodeId };
    },
  },
  {
    id: "select_all",
    name: "Select All",
    description: "Select all nodes at current level",
    shortcuts: ["Cmd+A"],
    category: "Selection",
    execute: () => ({ type: "SELECT_ALL" }),
  },
  {
    id: "clear_selection",
    name: "Clear Selection",
    description: "Clear all selections",
    shortcuts: ["Escape"],
    category: "Selection",
    execute: () => ({ type: "CLEAR_SELECTION" }),
  },

  // ===== Modal Commands =====
  {
    id: "toggle_search",
    name: "Search",
    description: "Open or close search mode",
    shortcuts: ["/"],
    category: "Search",
    execute: () => ({ type: "TOGGLE_SEARCH_MODE" }),
  },
  {
    id: "toggle_help",
    name: "Help",
    description: "Show or hide help overlay",
    shortcuts: ["?"],
    category: "Modal",
    execute: () => ({ type: "TOGGLE_HELP_MODE" }),
  },
  {
    id: "toggle_command_palette",
    name: "Command Palette",
    description: "Open command palette",
    shortcuts: ["Cmd+K", "Cmd+Shift+P"],
    category: "Modal",
    execute: () => ({ type: "TOGGLE_COMMAND_PALETTE" }),
  },
  {
    id: "toggle_new_item",
    name: "New Item",
    description: "Open new item dialog",
    shortcuts: ["n"],
    category: "Modal",
    execute: () => ({ type: "TOGGLE_NEW_ITEM_MODE" }),
  },
  {
    id: "toggle_project_picker",
    name: "Project Picker",
    description: "Open project picker",
    shortcuts: ["p"],
    category: "Modal",
    execute: () => ({ type: "TOGGLE_PROJECT_PICKER" }),
  },
  {
    id: "toggle_detail_pane",
    name: "Detail Pane",
    description: "Show or hide detail pane",
    shortcuts: ["i"],
    category: "Modal",
    execute: () => ({ type: "TOGGLE_DETAIL_PANE" }),
  },
];

// ===== Command Registry Functions =====

/** Get command by ID */
export function getCommand(id: string): CommandDef | undefined {
  return commands.find((cmd) => cmd.id === id);
}

/** Get commands by category */
export function getCommandsByCategory(): Map<CommandCategory, CommandDef[]> {
  const byCategory = new Map<CommandCategory, CommandDef[]>();
  for (const cmd of commands) {
    const list = byCategory.get(cmd.category) || [];
    list.push(cmd);
    byCategory.set(cmd.category, list);
  }
  return byCategory;
}

/** Simple fuzzy match for command palette */
export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
    }
  }
  return qi === q.length;
}

/** Filter commands by fuzzy search query */
export function filterCommands(query: string): CommandDef[] {
  if (!query) return commands;
  return commands.filter(
    (cmd) =>
      fuzzyMatch(query, cmd.name) ||
      fuzzyMatch(query, cmd.description) ||
      fuzzyMatch(query, cmd.id),
  );
}

/**
 * Execute a command by ID with the given context.
 * Returns the action to dispatch, or null if command not found or cannot execute.
 */
export function executeCommand(
  commandId: string,
  ctx: CommandContext,
): AnyAction | null {
  const cmd = getCommand(commandId);
  if (!cmd) return null;
  return cmd.execute(ctx);
}

// ===== Legacy Exports (for backward compatibility) =====

// Re-export with old names for compatibility
export type AppCommandDef = CommandDef;
export type AppCommandCategory = CommandCategory;
export const appCommands = commands;
export const getAppCommandById = getCommand;
export const getAppCommandsByCategory = getCommandsByCategory;
export const filterAppCommands = filterCommands;
