import type { CommandAction, CommandDef, TaskStatus, TaskSetStatusAction } from "../types.ts"

// Re-export for consumers
export type { TaskSetStatusAction as TaskAction } from "../types.ts"

// Status cycle: todo -> wip -> done -> dropped -> todo
function getNextStatus(current: TaskStatus | null | undefined): TaskStatus {
  switch (current) {
    case "todo":
      return "wip"
    case "wip":
      return "done"
    case "done":
      return "dropped"
    case "dropped":
      return "todo"
    default:
      return "todo"
  }
}

// Note: Task commands need special handling as they modify storage
// They return a marker action that the dispatcher will convert to storage mutations

const cycleTaskStatus = {
  id: "cycle_task_status",
  name: "Cycle Status",
  description: "Cycle through task statuses",
  category: "Task",
  shortLabel: "cycle",
  execute: (ctx) => {
    if (!ctx.currentNode || !ctx.currentNodeId) return null
    const node = ctx.currentNode
    // Check if node is a task
    if (!node.isTask) return null
    const newStatus = getNextStatus(node.item?.task?.status)
    return {
      type: "TASK_SET_STATUS",
      nodeId: ctx.currentNodeId,
      status: newStatus,
    } satisfies TaskSetStatusAction
  },
} satisfies CommandDef

const toggleTaskDone = {
  id: "toggle_task_done",
  name: "Toggle Done",
  description: "Toggle task between done and todo",
  category: "Task",
  shortLabel: "toggle",
  execute: (ctx) => {
    if (!ctx.currentNode || !ctx.currentNodeId) return null
    if (!ctx.currentNode.isTask) return null
    const newStatus = ctx.currentNode.item?.task?.status === "done" ? "todo" : "done"
    return {
      type: "TASK_SET_STATUS",
      nodeId: ctx.currentNodeId,
      status: newStatus,
    } satisfies TaskSetStatusAction
  },
} satisfies CommandDef

function createSetStatusCommand(id: string, name: string, description: string, status: TaskStatus): CommandDef {
  return {
    id,
    name,
    description,
    category: "Task",
    execute: (ctx) => {
      if (!ctx.currentNodeId) return null
      return { type: "TASK_SET_STATUS", nodeId: ctx.currentNodeId, status } satisfies TaskSetStatusAction
    },
  }
}

const setStatusTodo = createSetStatusCommand("set_status_todo", "Set Todo", "Set task status to todo", "todo")
const setStatusWip = createSetStatusCommand(
  "set_status_wip",
  "Set In Progress",
  "Set task status to work in progress",
  "wip",
)
const setStatusBlocked = createSetStatusCommand(
  "set_status_blocked",
  "Set Blocked",
  "Set task status to blocked",
  "blocked",
)
const setStatusDone = createSetStatusCommand("set_status_done", "Set Done", "Mark task as done", "done")
const setStatusDropped = createSetStatusCommand(
  "set_status_dropped",
  "Set Dropped",
  "Mark task as dropped/cancelled",
  "dropped",
)

// Property commands
const setDueDate = {
  id: "set_due_date",
  name: "Set Due Date",
  description: "Set or edit due date",
  category: "Task",
  shortLabel: "due date",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "SET_DUE_DATE", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

const setStartDate = {
  id: "set_start_date",
  name: "Set Start Date",
  description: "Set or edit start date",
  category: "Task",
  shortLabel: "start",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "SET_START_DATE", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

const setRecurring = {
  id: "set_recurring",
  name: "Set Recurring",
  description: "Set recurrence rule",
  category: "Task",
  shortLabel: "recurring",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "SET_RECURRING", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

const setPriority = {
  id: "set_priority",
  name: "Set Priority",
  description: "Cycle task priority (P0-P4)",
  category: "Task",
  shortLabel: "priority",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "SET_PRIORITY", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

function createSetPriorityCommand(level: 0 | 1 | 2 | 3 | 4): CommandDef {
  const type = `SET_PRIORITY_${level}` as
    | "SET_PRIORITY_0"
    | "SET_PRIORITY_1"
    | "SET_PRIORITY_2"
    | "SET_PRIORITY_3"
    | "SET_PRIORITY_4"
  return {
    id: `set_priority_${level}`,
    name: `Set Priority P${level}`,
    description: `Set task priority to P${level}`,
    category: "Task",
    execute: (ctx) => {
      if (!ctx.currentNodeId) return null
      return { type, nodeId: ctx.currentNodeId }
    },
  }
}

const setPriority0 = createSetPriorityCommand(0)
const setPriority1 = createSetPriorityCommand(1)
const setPriority2 = createSetPriorityCommand(2)
const setPriority3 = createSetPriorityCommand(3)
const setPriority4 = createSetPriorityCommand(4)

const setLabel = {
  id: "set_label",
  name: "Set Label",
  description: "Set or add label/tag",
  category: "Task",
  shortLabel: "label",
  execute: () => ({ type: "SET_LABEL" }),
} satisfies CommandDef

const setAssignee = {
  id: "set_assignee",
  name: "Set Assignee",
  description: "Set task assignee",
  category: "Task",
  shortLabel: "assignee",
  execute: () => ({ type: "SET_ASSIGNEE" }),
} satisfies CommandDef

const clearTask = {
  id: "clear_task",
  name: "Clear Task",
  description: "Remove all task properties (status, dates, priority, assignee)",
  category: "Task",
  shortLabel: "clear",
  execute: (ctx): CommandAction | null => {
    if (!ctx.currentNodeId) return null
    return { type: "CLEAR_TASK", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

export const taskCommands: CommandDef[] = [
  clearTask,
  cycleTaskStatus,
  toggleTaskDone,
  setStatusTodo,
  setStatusWip,
  setStatusBlocked,
  setStatusDone,
  setStatusDropped,
  setDueDate,
  setStartDate,
  setRecurring,
  setPriority,
  setPriority0,
  setPriority1,
  setPriority2,
  setPriority3,
  setPriority4,
  setLabel,
  setAssignee,
]
