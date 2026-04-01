/**
 * Task List Command
 *
 * Lists tasks with optional filtering by path, status, or query.
 */

import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg, type Repo } from "@km/storage"
import { loadRepo } from "../../load-repo.ts"
import { collapseAncestorsWithTypes } from "@km/tree"
import { KNode, type KNode as KNodeType } from "@km/core"
import { getRootPath } from "../../program.ts"
import { getNodeDisplayName, formatCollapsedAncestor, formatTaskWithPath, formatTaskLine } from "./formatters.ts"
import {
  findNodeByPathOrId,
  getTasksUnderNode,
  buildTaskTree,
  sortByPath,
  taskPathMatches,
  looksLikeQuery,
} from "./queries.ts"

export interface ListTasksOptions {
  status?: string
  query?: string
  all?: boolean
  detail?: boolean
  flat?: boolean
  id?: boolean
  json?: boolean
}

/** Result of resolving input arguments into a filtered task list */
interface ResolvedInput {
  tasks: KNodeType[]
  rootNode: KNodeType | null
  pathFilter: string | null
}

/**
 * Filter tasks by status options (shared across multiple resolution paths).
 * Returns only tasks matching the requested status/all flags.
 *
 * @param defaultMode - "excludeDone" excludes only done tasks (global/path-filter default);
 *                      "active" keeps only todo/wip tasks (root-scoped default)
 */
function filterTasksByStatus(
  tasks: KNodeType[],
  options: Pick<ListTasksOptions, "status" | "all">,
  defaultMode: "excludeDone" | "active" = "excludeDone",
): KNodeType[] {
  if (options.status) {
    return tasks.filter((t) => t.item?.task?.status === options.status)
  }
  if (!options.all) {
    if (defaultMode === "active") {
      return tasks.filter((t) => t.item?.task?.status === "todo" || t.item?.task?.status === "wip")
    }
    return tasks.filter((t) => t.item?.task?.status !== "done")
  }
  return tasks
}

/**
 * Resolve tasks from a query argument (--query flag or query-like positional).
 * Builds the query string with default status filters and runs it against the repo.
 */
function resolveFromQuery(
  repo: Repo,
  queryArg: string,
  options: Pick<ListTasksOptions, "status" | "all">,
): KNodeType[] {
  let queryStr = queryArg
  if (!options.all && !queryStr.includes("status:")) {
    queryStr = `-status:done ${queryStr}`
  }
  if (options.status) {
    queryStr = `status:${options.status} ${queryStr}`
  }
  return repo.query(queryStr)
}

/**
 * Resolve tasks from a path-or-ID positional argument.
 * Returns null if the pathOrId points to a single task (caller should show details instead).
 */
function resolveFromPathOrId(
  repo: Repo,
  pathOrId: string,
  options: Pick<ListTasksOptions, "status" | "all">,
): ResolvedInput | null {
  // Try to find an exact node match first
  const rootNode = findNodeByPathOrId(repo, pathOrId)

  if (rootNode) {
    // If the root IS a task, signal the caller to show details
    if (KNode.isListItem(rootNode) && rootNode.item?.task?.marker !== undefined) {
      return null
    }

    // Get tasks under this root, then apply status filter.
    // Root-scoped listing defaults to active tasks only (todo + wip).
    const subtasks = getTasksUnderNode(repo, rootNode.id)
    const tasks = filterTasksByStatus(subtasks, options, "active")
    return { tasks, rootNode, pathFilter: null }
  }

  // No exact match - treat as path filter (like `bun test <filter>`)
  const allTasks = filterTasksByStatus(repo.getAllTasks(), options)
  const tasks = allTasks.filter((t) => taskPathMatches(repo, t, pathOrId))
  return { tasks, rootNode: null, pathFilter: pathOrId }
}

/**
 * Resolve input arguments into a filtered task list and context.
 * Returns null when the input points to a single task (details shown as side-effect).
 */
function resolveInput(repo: Repo, pathOrId: string | undefined, options: ListTasksOptions): ResolvedInput | null {
  // Handle query option first (takes precedence).
  // Also treat positional arg as query if it looks like one.
  const queryArg = options.query || (pathOrId && looksLikeQuery(pathOrId) ? pathOrId : null)

  if (queryArg) {
    return {
      tasks: resolveFromQuery(repo, queryArg, options),
      rootNode: null,
      pathFilter: null,
    }
  }

  if (pathOrId) {
    const result = resolveFromPathOrId(repo, pathOrId, options)
    if (!result) {
      // pathOrId resolved to a single task - show details as side-effect
      const rootNode = findNodeByPathOrId(repo, pathOrId)
      if (rootNode) showTaskDetails(repo, rootNode, options)
      return null
    }
    return result
  }

  // Global task list (no positional arg, no query)
  const tasks = filterTasksByStatus(repo.getAllTasks(), options)
  return { tasks, rootNode: null, pathFilter: null }
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
      showId: options.id,
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
    console.log(taskPrefix + formatTaskLine(task, { detail: options.detail, showId: options.id }))

    previousAncestorKeys = ancestorKeys
  }
}

/**
 * Render the resolved task list (handles JSON, flat, and tree modes).
 */
function renderTaskList(repo: Repo, input: ResolvedInput, options: ListTasksOptions): void {
  const { tasks, rootNode, pathFilter } = input

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
  console.log(term.dim(`${tasks.length} task(s)`))
}

/**
 * List tasks (optionally scoped to a root node or filtered by path/query)
 */
export async function listTasks(pathOrId: string | undefined, options: ListTasksOptions): Promise<void> {
  const resolved = resolvePathArg(undefined, getRootPath() || process.cwd())
  using repo = await loadRepo(resolved.repoRoot)

  const input = resolveInput(repo, pathOrId, options)
  if (!input) return // Single task details already shown

  renderTaskList(repo, input, options)
}

/**
 * Show task details
 */
function showTaskDetails(repo: Repo, task: KNodeType, options: { json?: boolean }): void {
  if (options.json) {
    console.log(JSON.stringify(task, null, 2))
    return
  }

  console.log(term.bold("Task:"), task.id)
  console.log(term.dim("Status:"), task.item?.task?.status ?? "todo")
  console.log(term.dim("Content:"), task.content ?? "(none)")
  if (task.due_at) console.log(term.dim("Due:"), task.due_at)
  if (task.start_at) {
    console.log(term.dim("Start:"), task.start_at)
  }
  if (task.priority) console.log(term.dim("Priority:"), task.priority)
  if (task.assigned_to) {
    console.log(term.dim("Assigned:"), task.assigned_to)
  }
  if (task.parent_id) {
    console.log(term.dim("Parent:"), task.parent_id.slice(-8))
  }
  console.log(term.dim("Created:"), new Date(task.created_at ?? Date.now()).toISOString())

  // Show child tasks if any
  const children = getTasksUnderNode(repo, task.id)
  if (children.length > 0) {
    console.log()
    console.log(term.dim(`${children.length} subtask(s):`))
    for (const child of children) {
      console.log("  " + formatTaskLine(child, { showId: true }))
    }
  }
}
