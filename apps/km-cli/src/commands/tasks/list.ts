/**
 * Task List Command
 *
 * Lists tasks with optional filtering by path, status, or query.
 */

import chalk from "chalk"
import { resolvePathArg, type Repo } from "@km/storage"
import { loadRepo } from "../../load-repo.ts"
import { collapseAncestorsWithTypes } from "@km/tree"
import type { KNode, TaskStatus } from "@km/core"
import { getRootPath } from "../../program.ts"
import {
  getNodeDisplayName,
  formatCollapsedAncestor,
  formatTaskWithPath,
  formatTaskLine,
} from "./formatters.ts"
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
  verbose?: boolean
  flat?: boolean
  id?: boolean
  json?: boolean
}

/**
 * List tasks (optionally scoped to a root node or filtered by path/query)
 */
export async function listTasks(
  pathOrId: string | undefined,
  options: ListTasksOptions,
): Promise<void> {
  const resolved = resolvePathArg(undefined, getRootPath() || process.cwd())
  using repo = await loadRepo(resolved.repoRoot)

  let tasks: KNode[]
  let rootNode: KNode | null = null
  let pathFilter: string | null = null

  // Handle query option first (takes precedence)
  // Also treat positional arg as query if it looks like one
  const queryArg =
    options.query || (pathOrId && looksLikeQuery(pathOrId) ? pathOrId : null)
  if (queryArg) {
    // Build query string, adding default status filter
    let queryStr = queryArg
    if (!options.all && !queryStr.includes("status:")) {
      queryStr = `-status:done ${queryStr}`
    }
    if (options.status) {
      queryStr = `status:${options.status} ${queryStr}`
    }
    tasks = repo.query(queryStr)
  } else if (pathOrId) {
    // Try to find an exact node match first
    rootNode = findNodeByPathOrId(repo, pathOrId)

    if (rootNode) {
      // If the root IS a task, show its details
      if (rootNode.type === "task") {
        showTaskDetails(repo, rootNode, options)
        return
      }

      // Get tasks under this root
      tasks = getTasksUnderNode(repo, rootNode.id)
    } else {
      // No exact match - treat as path filter (like `bun test <filter>`)
      pathFilter = pathOrId

      // Get tasks with status filter via repo
      const allTasks = repo.getAllTasks().filter((t) => {
        if (options.status && t.task_status !== options.status) return false
        if (!options.all && !options.status && t.task_status === "done") {
          return false
        }
        return true
      })

      // Filter by path match
      tasks = allTasks.filter(
        (t) => pathFilter && taskPathMatches(repo, t, pathFilter),
      )
    }

    // Apply status filter for root node case
    if (rootNode) {
      if (options.status) {
        tasks = tasks.filter((t) => t.task_status === options.status)
      } else if (!options.all) {
        tasks = tasks.filter(
          (t) => t.task_status === "todo" || t.task_status === "wip",
        )
      }
    }
  } else {
    // Global task list via repo
    tasks = repo.getAllTasks().filter((t) => {
      if (options.status && t.task_status !== options.status) return false
      if (!options.all && !options.status && t.task_status === "done") {
        return false
      }
      return true
    })
  }

  if (options.json) {
    console.log(JSON.stringify(tasks, null, 2))
    return
  }

  if (tasks.length === 0) {
    console.log(chalk.dim("No tasks found"))
    return
  }

  // Show context header
  if (rootNode) {
    console.log(chalk.bold(getNodeDisplayName(repo, rootNode)))
    console.log()
  } else if (pathFilter) {
    console.log(chalk.dim(`Filter: ${pathFilter}`))
    console.log()
  }

  // Flat mode: simple single-line display
  if (options.flat) {
    for (const task of tasks) {
      const rawAncestors = repo.getAncestors(task.id)
      const collapsedAncestors = collapseAncestorsWithTypes(rawAncestors)
      const lines = formatTaskWithPath(repo, task, collapsedAncestors, {
        verbose: options.verbose,
        flat: true,
        showId: options.id,
      })
      for (const line of lines) {
        console.log(line)
      }
    }
    console.log()
    console.log(chalk.dim(`${tasks.length} task(s)`))
    return
  }

  // Tree mode: group tasks by shared paths
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
      if (ca && ca.node.type !== "section") {
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
      console.log(prefix + chalk.dim(formatCollapsedAncestor(repo, ca)))
      if (ca.node.type === "section") {
        hasSection = true
      } else {
        // Only folders/files increase the depth
        fsDepth++
      }
    }

    // Check if any ancestor was a section (for task indent)
    if (!hasSection) {
      hasSection = collapsedAncestors.some((ca) => ca.node.type === "section")
    }

    // Task indent: fsDepth + 3 spaces if under a section (to align with section content)
    const taskIndent = hasSection ? fsDepth + 3 : fsDepth
    const taskPrefix = " ".repeat(taskIndent)
    console.log(
      taskPrefix +
        formatTaskLine(task, { verbose: options.verbose, showId: options.id }),
    )

    previousAncestorKeys = ancestorKeys
  }

  console.log()
  console.log(chalk.dim(`${tasks.length} task(s)`))
}

/**
 * Show task details
 */
export function showTaskDetails(
  repo: Repo,
  task: KNode,
  options: { json?: boolean },
): void {
  if (options.json) {
    console.log(JSON.stringify(task, null, 2))
    return
  }

  console.log(chalk.bold("Task:"), task.id)
  console.log(chalk.dim("Status:"), task.task_status ?? "todo")
  console.log(chalk.dim("Content:"), task.content ?? "(none)")
  if (task.due_date) console.log(chalk.dim("Due:"), task.due_date)
  if (task.scheduled_date) {
    console.log(chalk.dim("Scheduled:"), task.scheduled_date)
  }
  if (task.priority) console.log(chalk.dim("Priority:"), task.priority)
  if (task.assigned_to) console.log(chalk.dim("Assigned:"), task.assigned_to)
  if (task.parent_id) {
    console.log(chalk.dim("Parent:"), task.parent_id.slice(0, 8))
  }
  console.log(
    chalk.dim("Created:"),
    new Date(task.created_at ?? Date.now()).toISOString(),
  )

  // Show child tasks if any
  const children = getTasksUnderNode(repo, task.id)
  if (children.length > 0) {
    console.log()
    console.log(chalk.dim(`${children.length} subtask(s):`))
    for (const child of children) {
      console.log("  " + formatTaskLine(child, { showId: true }))
    }
  }
}
