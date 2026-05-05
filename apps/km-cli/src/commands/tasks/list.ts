/**
 * Task List Command
 *
 * Lists tasks with optional filtering by path, status, or query.
 *
 * Filtering / resolution is delegated to the pure planner in
 * `./list-plan.ts` (`planList`) so unit tests can exercise the filter
 * matrix without booting the silvery import chain. This file owns the
 * I/O: repo load, ancestor collapsing for path display, terminal
 * formatting, and JSON output.
 */

import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { Task, type Repo } from "@km/storage"
import { resolvePathArg } from "@km/fs-mount"
import { loadRepo } from "../../load-repo.ts"
import { collapseAncestorsWithTypes } from "@km/tree"
import { KNode, type KNode as KNodeType } from "@km/core"
import { getRootPath } from "../../program.ts"
import { resolveAssignee } from "../../utils/assignee.ts"
import { getNodeDisplayName, formatCollapsedAncestor, formatTaskWithPath, formatTaskLine } from "./formatters.ts"
import { printTaskDetails } from "../shared-show.ts"
import { buildTaskTree, sortByPath } from "./queries.ts"
import { parseLimitFlag, applyLimit } from "../../utils/limit.ts"
import { planList } from "./list-plan.ts"

// Re-export pure helpers + planner so existing imports keep working
// (tests still hit `filterTasksByAssignee`, `filterTasksByPriority`, etc.).
export {
  filterTasksByPriority,
  filterTasksByBlocked,
  filterTasksByAssignee,
  filterTasksByStatus,
  planList,
  type PlanListInputs,
  type ListPlan,
} from "./list-plan.ts"

export interface ListTasksOptions {
  status?: string
  priority?: string
  query?: string
  assignee?: string
  all?: boolean
  detail?: boolean
  flat?: boolean
  showIds?: boolean
  json?: boolean
  blocked?: boolean
  unblocked?: boolean
  limit?: string | number
}

/**
 * Resolve the --assignee value, expanding "me" to the current user's handle.
 * Exported so tests can pin the resolution behavior independently of process state.
 */
export function resolveAssigneeFilter(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (value.toLowerCase() === "me") return resolveAssignee()
  return value
}

/**
 * Render tasks in flat mode (one line per task with breadcrumb path).
 */
function renderFlat(repo: Repo, tasks: KNodeType[], options: ListTasksOptions): void {
  for (const task of tasks) {
    const rawAncestors = repo.getAncestors(task.id)
    const collapsedAncestors = collapseAncestorsWithTypes(rawAncestors)
    const lines = formatTaskWithPath(repo, task, collapsedAncestors, {
      detail: options.detail,
      flat: true,
      showId: options.showIds,
    })
    for (const line of lines) {
      console.log(line)
    }
  }
}

/**
 * Render tasks in tree mode, grouping by shared ancestor paths.
 * Uses incremental path divergence to avoid repeating shared prefixes.
 */
function renderTree(repo: Repo, tasks: KNodeType[], options: ListTasksOptions): void {
  const tasksWithAncestors = buildTaskTree(repo, tasks)
  const sorted = sortByPath(tasksWithAncestors)

  let previousAncestorKeys: string[] = []

  for (const { task, collapsedAncestors, ancestorKeys } of sorted) {
    // Find where current path diverges from previous
    let divergeIndex = 0
    while (
      divergeIndex < previousAncestorKeys.length &&
      divergeIndex < ancestorKeys.length &&
      previousAncestorKeys[divergeIndex] === ancestorKeys[divergeIndex]
    ) {
      divergeIndex++
    }

    // Count fs depth (folders/files) before divergence point
    let fsDepth = 0
    for (let i = 0; i < divergeIndex && i < collapsedAncestors.length; i++) {
      const ca = collapsedAncestors[i]
      if (ca && !(KNode.isOutline(ca.node) && ca.node.fstype === "mdsection")) {
        fsDepth++
      }
    }

    // Print only the new path elements with appropriate indentation
    // - Folders/files: 1 space per level
    // - Sections: same indent as their file (# prefix shows heading level)
    let hasSection = false
    for (let i = divergeIndex; i < collapsedAncestors.length; i++) {
      const ca = collapsedAncestors[i]
      if (!ca) continue
      const prefix = " ".repeat(fsDepth)
      console.log(prefix + term.dim(formatCollapsedAncestor(repo, ca)))
      if (KNode.isOutline(ca.node) && ca.node.fstype === "mdsection") {
        hasSection = true
      } else {
        // Only folders/files increase the depth
        fsDepth++
      }
    }

    // Check if any ancestor was a section (for task indent)
    if (!hasSection) {
      hasSection = collapsedAncestors.some((ca) => KNode.isOutline(ca.node) && ca.node.fstype === "mdsection")
    }

    // Task indent: fsDepth + 3 spaces if under a section (to align with section content)
    const taskIndent = hasSection ? fsDepth + 3 : fsDepth
    const taskPrefix = " ".repeat(taskIndent)
    console.log(taskPrefix + formatTaskLine(task, { detail: options.detail, showId: options.showIds }))

    previousAncestorKeys = ancestorKeys
  }
}

/**
 * Render the resolved task list (handles JSON, flat, and tree modes).
 */
function renderTaskList(
  repo: Repo,
  input: { tasks: KNodeType[]; rootNode: KNodeType | null; pathFilter: string | null },
  options: ListTasksOptions,
): void {
  const { rootNode, pathFilter } = input

  const limit = parseLimitFlag(options.limit)
  const { items: tasks, totalMsg } = applyLimit(input.tasks, limit)

  if (options.json) {
    console.log(JSON.stringify(tasks, null, 2))
    return
  }

  if (tasks.length === 0) {
    console.log(term.dim("No tasks found"))
    return
  }

  // Show context header
  if (rootNode) {
    console.log(term.bold(getNodeDisplayName(repo, rootNode)))
    console.log()
  } else if (pathFilter) {
    console.log(term.dim(`Filter: ${pathFilter}`))
    console.log()
  }

  if (options.flat) {
    renderFlat(repo, tasks, options)
  } else {
    renderTree(repo, tasks, options)
  }

  console.log()
  console.log(term.dim(`${totalMsg} task(s)`))
}

/**
 * List tasks (optionally scoped to a root node or filtered by path/query)
 */
export async function listTasks(pathOrId: string | undefined, options: ListTasksOptions): Promise<void> {
  const resolved = resolvePathArg(undefined, getRootPath() || process.cwd())
  using repo = await loadRepo(resolved.repoRoot)

  const plan = planList(repo, {
    pathOrId,
    query: options.query,
    status: options.status,
    priority: options.priority,
    assignee: resolveAssigneeFilter(options.assignee),
    all: options.all,
    blocked: options.blocked,
    unblocked: options.unblocked,
  })

  if (plan.kind === "single-task") {
    showTaskDetails(repo, plan.task, options)
    return
  }

  renderTaskList(repo, { tasks: plan.tasks, rootNode: plan.rootNode, pathFilter: plan.pathFilter }, options)
}

/**
 * Show task details — delegates to the shared `printTaskDetails` helper
 * so `tasks <id>` and `bd show <id>` stay in sync, then appends the
 * task-specific subtask listing.
 */
function showTaskDetails(repo: Repo, task: KNodeType, options: { json?: boolean }): void {
  printTaskDetails(repo, task, { json: options.json })
  if (options.json) return

  // Subtask list is task-mode only — bd uses Blocked-by / dependency
  // tree instead of a flat subtask roll-up.
  const children = Task.under(repo, task.id)
  if (children.length > 0) {
    console.log()
    console.log(term.dim(`${children.length} subtask(s):`))
    for (const child of children) {
      console.log("  " + formatTaskLine(child, { showId: true }))
    }
  }
}
