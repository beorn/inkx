import type { CommandDef, TaskStatus, TaskSetStatusAction } from "../types.ts"

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
  shortcuts: ["Space"],
  execute: (ctx) => {
    if (!ctx.currentNode || !ctx.currentNodeId) return null
    const node = ctx.currentNode
    // Check if node is a task
    if (!node.isTask) return null
    const newStatus = getNextStatus(node.task_status)
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
  shortcuts: ["x"],
  execute: (ctx) => {
    if (!ctx.currentNode || !ctx.currentNodeId) return null
    if (!ctx.currentNode.isTask) return null
    const newStatus = ctx.currentNode.task_status === "done" ? "todo" : "done"
    return {
      type: "TASK_SET_STATUS",
      nodeId: ctx.currentNodeId,
      status: newStatus,
    } satisfies TaskSetStatusAction
  },
} satisfies CommandDef

const setStatusTodo = {
  id: "set_status_todo",
  name: "Set Todo",
  description: "Set task status to todo",
  category: "Task",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return {
      type: "TASK_SET_STATUS",
      nodeId: ctx.currentNodeId,
      status: "todo",
    } satisfies TaskSetStatusAction
  },
} satisfies CommandDef

const setStatusWip = {
  id: "set_status_wip",
  name: "Set In Progress",
  description: "Set task status to work in progress",
  category: "Task",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return {
      type: "TASK_SET_STATUS",
      nodeId: ctx.currentNodeId,
      status: "wip",
    } satisfies TaskSetStatusAction
  },
} satisfies CommandDef

const setStatusBlocked = {
  id: "set_status_blocked",
  name: "Set Blocked",
  description: "Set task status to blocked",
  category: "Task",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return {
      type: "TASK_SET_STATUS",
      nodeId: ctx.currentNodeId,
      status: "blocked",
    } satisfies TaskSetStatusAction
  },
} satisfies CommandDef

const setStatusDone = {
  id: "set_status_done",
  name: "Set Done",
  description: "Mark task as done",
  category: "Task",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return {
      type: "TASK_SET_STATUS",
      nodeId: ctx.currentNodeId,
      status: "done",
    } satisfies TaskSetStatusAction
  },
} satisfies CommandDef

const setStatusDropped = {
  id: "set_status_dropped",
  name: "Set Dropped",
  description: "Mark task as dropped/cancelled",
  category: "Task",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return {
      type: "TASK_SET_STATUS",
      nodeId: ctx.currentNodeId,
      status: "dropped",
    } satisfies TaskSetStatusAction
  },
} satisfies CommandDef

// Property commands
const setDueDate = {
  id: "set_due_date",
  name: "Set Due Date",
  description: "Set or edit due date",
  category: "Task",
  shortcuts: ["td"],
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
  shortcuts: ["ts"],
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
  shortcuts: ["tr"],
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "SET_RECURRING", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

const setPriority = {
  id: "set_priority",
  name: "Set Priority",
  description: "Set task priority",
  category: "Task",
  shortcuts: ["sp"],
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "SET_PRIORITY", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

const setLabel = {
  id: "set_label",
  name: "Set Label",
  description: "Set or add label/tag",
  category: "Task",
  shortcuts: ["sl"],
  execute: () => ({ type: "SET_LABEL" }),
} satisfies CommandDef

const setAssignee = {
  id: "set_assignee",
  name: "Set Assignee",
  description: "Set task assignee",
  category: "Task",
  shortcuts: ["sa"],
  execute: () => ({ type: "SET_ASSIGNEE" }),
} satisfies CommandDef

export const taskCommands: CommandDef[] = [
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
  setLabel,
  setAssignee,
]
