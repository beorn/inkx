import type { CommandDef, TaskStatus, TaskSetStatusAction } from "../types.ts";

// Re-export for consumers
export type { TaskSetStatusAction as TaskAction } from "../types.ts";

// Status cycle: todo -> wip -> done -> dropped -> todo
function getNextStatus(current: TaskStatus | null | undefined): TaskStatus {
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

// Note: Task commands need special handling as they modify storage
// They return a marker action that the dispatcher will convert to storage mutations

export const cycleTaskStatus: CommandDef = {
  id: "cycle_task_status",
  name: "Cycle Status",
  description: "Cycle through task statuses",
  category: "Task",
  shortcuts: ["Space"],
  execute: (ctx) => {
    if (!ctx.currentNode || !ctx.currentNodeId) return null;
    const node = ctx.currentNode;
    // Check if node is a task
    if (!node.isTask) return null;
    const newStatus = getNextStatus(node.task_status);
    return {
      type: "TASK_SET_STATUS",
      nodeId: ctx.currentNodeId,
      status: newStatus,
    } satisfies TaskSetStatusAction;
  },
};

export const toggleTaskDone: CommandDef = {
  id: "toggle_task_done",
  name: "Toggle Done",
  description: "Toggle task between done and todo",
  category: "Task",
  shortcuts: ["x"],
  execute: (ctx) => {
    if (!ctx.currentNode || !ctx.currentNodeId) return null;
    if (!ctx.currentNode.isTask) return null;
    const newStatus = ctx.currentNode.task_status === "done" ? "todo" : "done";
    return {
      type: "TASK_SET_STATUS",
      nodeId: ctx.currentNodeId,
      status: newStatus,
    } satisfies TaskSetStatusAction;
  },
};

export const setStatusTodo: CommandDef = {
  id: "set_status_todo",
  name: "Set Todo",
  description: "Set task status to todo",
  category: "Task",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null;
    return {
      type: "TASK_SET_STATUS",
      nodeId: ctx.currentNodeId,
      status: "todo",
    } satisfies TaskSetStatusAction;
  },
};

export const setStatusWip: CommandDef = {
  id: "set_status_wip",
  name: "Set In Progress",
  description: "Set task status to work in progress",
  category: "Task",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null;
    return {
      type: "TASK_SET_STATUS",
      nodeId: ctx.currentNodeId,
      status: "wip",
    } satisfies TaskSetStatusAction;
  },
};

export const setStatusBlocked: CommandDef = {
  id: "set_status_blocked",
  name: "Set Blocked",
  description: "Set task status to blocked",
  category: "Task",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null;
    return {
      type: "TASK_SET_STATUS",
      nodeId: ctx.currentNodeId,
      status: "blocked",
    } satisfies TaskSetStatusAction;
  },
};

export const setStatusDone: CommandDef = {
  id: "set_status_done",
  name: "Set Done",
  description: "Mark task as done",
  category: "Task",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null;
    return {
      type: "TASK_SET_STATUS",
      nodeId: ctx.currentNodeId,
      status: "done",
    } satisfies TaskSetStatusAction;
  },
};

export const setStatusDropped: CommandDef = {
  id: "set_status_dropped",
  name: "Set Dropped",
  description: "Mark task as dropped/cancelled",
  category: "Task",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null;
    return {
      type: "TASK_SET_STATUS",
      nodeId: ctx.currentNodeId,
      status: "dropped",
    } satisfies TaskSetStatusAction;
  },
};

export const taskCommands: CommandDef[] = [
  cycleTaskStatus,
  toggleTaskDone,
  setStatusTodo,
  setStatusWip,
  setStatusBlocked,
  setStatusDone,
  setStatusDropped,
];
