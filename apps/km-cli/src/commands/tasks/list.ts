/**
 * Task List Command
 *
 * Lists tasks with optional filtering by path, status, or query.
 */

import { createTerm } from "inkx"

const term = createTerm(process)
import { resolvePathArg, type Repo } from "@km/storage"
import { loadRepo } from "../../load-repo.ts"
import { collapseAncestorsWithTypes, type CollapsedAncestor } from "@km/tree"
import type { KNode } from "@km/core"
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

interface TaskLookupResult {
  tasks: KNode[]
  rootNode: KNode | null
  pathFilter: string | null
}

/** Build query string with status filters */
function buildQueryString(queryArg: string, options: ListTasksOptions): string {
  let queryStr = queryArg
  if (!options.all && !queryStr.includes("status:")) {
    queryStr = `-status:done ${queryStr}`
  }
  if (options.status) {
    queryStr = `status:${options.status} ${queryStr}`
  }
  return queryStr
}

/** Filter tasks by status options */
function filterByStatus(tasks: KNode[], options: ListTasksOptions): KNode[] {
  return tasks.filter((t) => {
    if (options.status) return t.task_status === options.status
    if (options.all) return true
    return t.task_status === "todo" || t.task_status === "wip"
  })
}

/** Get tasks via query search */
function getTasksByQuery(
  repo: Repo,
  queryArg: string,
  options: ListTasksOptions,
): TaskLookupResult {
  const queryStr = buildQueryString(queryArg, options)
  return { tasks: repo.query(queryStr), rootNode: null, pathFilter: null }
}

/** Get tasks filtered by path pattern */
function getTasksByPathFilter(
  repo: Repo,
  pathFilter: string,
  options: ListTasksOptions,
): TaskLookupResult {
  const allTasks = filterByStatus(repo.getAllTasks(), options)
  const tasks = allTasks.filter((t) => taskPathMatches(repo, t, pathFilter))
  return { tasks, rootNode: null, pathFilter }
}

/** Get tasks under a specific node */
function getTasksUnderRoot(
  repo: Repo,
  rootNode: KNode,
  options: ListTasksOptions,
): TaskLookupResult {
  const tasks = filterByStatus(getTasksUnderNode(repo, rootNode.id), options)
  return { tasks, rootNode, pathFilter: null }
}

/** Get all tasks (global list) */
function getAllTasksFiltered(
  repo: Repo,
  options: ListTasksOptions,
): TaskLookupResult {
  return {
    tasks: filterByStatus(repo.getAllTasks(), options),
    rootNode: null,
    pathFilter: null,
  }
}

/** Resolve which tasks to display based on pathOrId and options */
function resolveTasks(
  repo: Repo,
  pathOrId: string | undefined,
  options: ListTasksOptions,
): TaskLookupResult | { showDetails: KNode } {
  // Query takes precedence (explicit option or query-like positional arg)
  const queryArg =
    options.query || (pathOrId && looksLikeQuery(pathOrId) ? pathOrId : null)
  if (queryArg) {
    return getTasksByQuery(repo, queryArg, options)
  }

  // No path/id specified - show all tasks
  if (!pathOrId) {
    return getAllTasksFiltered(repo, options)
  }

  // Try exact node match
  const rootNode = findNodeByPathOrId(repo, pathOrId)
  if (!rootNode) {
    return getTasksByPathFilter(repo, pathOrId, options)
  }

  // Single task - show details instead of list
  if (rootNode.type === "task") {
    return { showDetails: rootNode }
  }

  return getTasksUnderRoot(repo, rootNode, options)
}

/** Find divergence point between two ancestor key arrays */
function findDivergenceIndex(
  previousKeys: string[],
  currentKeys: string[],
): number {
  let i = 0
  while (
    i < previousKeys.length &&
    i < currentKeys.length &&
    previousKeys[i] === currentKeys[i]
  ) {
    i++
  }
  return i
}

/** Count filesystem depth (folders/files, not sections) up to index */
function countFsDepth(
  ancestors: CollapsedAncestor[],
  upToIndex: number,
): number {
  let depth = 0
  for (let i = 0; i < upToIndex && i < ancestors.length; i++) {
    const ca = ancestors[i]
    if (ca && ca.node.type !== "section") depth++
  }
  return depth
}

/** Print new path elements and return updated fsDepth and hasSection */
function printNewPathElements(
  repo: Repo,
  ancestors: CollapsedAncestor[],
  startIndex: number,
  initialFsDepth: number,
): { fsDepth: number; hasSection: boolean } {
  let fsDepth = initialFsDepth
  let hasSection = false

  for (let i = startIndex; i < ancestors.length; i++) {
    const ca = ancestors[i]
    if (!ca) continue
    console.log(
      " ".repeat(fsDepth) + term.dim(formatCollapsedAncestor(repo, ca)),
    )
    if (ca.node.type === "section") {
      hasSection = true
    } else {
      fsDepth++
    }
  }

  return { fsDepth, hasSection }
}

/** Print task in tree mode with proper indentation */
function printTreeTask(
  repo: Repo,
  task: KNode,
  collapsedAncestors: CollapsedAncestor[],
  ancestorKeys: string[],
  previousAncestorKeys: string[],
  options: ListTasksOptions,
): void {
  const divergeIndex = findDivergenceIndex(previousAncestorKeys, ancestorKeys)
  const initialFsDepth = countFsDepth(collapsedAncestors, divergeIndex)

  const { fsDepth, hasSection: newHasSection } = printNewPathElements(
    repo,
    collapsedAncestors,
    divergeIndex,
    initialFsDepth,
  )

  const hasSection =
    newHasSection || collapsedAncestors.some((ca) => ca.node.type === "section")
  const taskIndent = hasSection ? fsDepth + 3 : fsDepth

  console.log(
    " ".repeat(taskIndent) +
      formatTaskLine(task, { verbose: options.verbose, showId: options.id }),
  )
}

/** Output tasks in flat mode */
function outputFlatMode(
  repo: Repo,
  tasks: KNode[],
  options: ListTasksOptions,
): void {
  for (const task of tasks) {
    const rawAncestors = repo.getAncestors(task.id)
    const collapsedAncestors = collapseAncestorsWithTypes(rawAncestors)
    const lines = formatTaskWithPath(repo, task, collapsedAncestors, {
      verbose: options.verbose,
      flat: true,
      showId: options.id,
    })
    for (const line of lines) console.log(line)
  }
  console.log()
  console.log(term.dim(`${tasks.length} task(s)`))
}

/** Output tasks in tree mode */
function outputTreeMode(
  repo: Repo,
  tasks: KNode[],
  options: ListTasksOptions,
): void {
  const tasksWithAncestors = buildTaskTree(repo, tasks)
  const sorted = sortByPath(tasksWithAncestors)

  let previousAncestorKeys: string[] = []
  for (const { task, collapsedAncestors, ancestorKeys } of sorted) {
    printTreeTask(
      repo,
      task,
      collapsedAncestors,
      ancestorKeys,
      previousAncestorKeys,
      options,
    )
    previousAncestorKeys = ancestorKeys
  }

  console.log()
  console.log(term.dim(`${tasks.length} task(s)`))
}

/** Print context header for the task list */
function printContextHeader(
  repo: Repo,
  rootNode: KNode | null,
  pathFilter: string | null,
): void {
  if (rootNode) {
    console.log(term.bold(getNodeDisplayName(repo, rootNode)))
    console.log()
  } else if (pathFilter) {
    console.log(term.dim(`Filter: ${pathFilter}`))
    console.log()
  }
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

  const result = resolveTasks(repo, pathOrId, options)

  // Handle single task details view
  if ("showDetails" in result) {
    showTaskDetails(repo, result.showDetails, options)
    return
  }

  const { tasks, rootNode, pathFilter } = result

  if (options.json) {
    console.log(JSON.stringify(tasks, null, 2))
    return
  }

  if (tasks.length === 0) {
    console.log(term.dim("No tasks found"))
    return
  }

  printContextHeader(repo, rootNode, pathFilter)

  if (options.flat) {
    outputFlatMode(repo, tasks, options)
  } else {
    outputTreeMode(repo, tasks, options)
  }
}

/**
 * Show task details
 */
function showTaskDetails(
  repo: Repo,
  task: KNode,
  options: { json?: boolean },
): void {
  if (options.json) {
    console.log(JSON.stringify(task, null, 2))
    return
  }

  console.log(term.bold("Task:"), task.id)
  console.log(term.dim("Status:"), task.task_status ?? "todo")
  console.log(term.dim("Content:"), task.content ?? "(none)")
  if (task.due_date) console.log(term.dim("Due:"), task.due_date)
  if (task.scheduled_date) {
    console.log(term.dim("Scheduled:"), task.scheduled_date)
  }
  if (task.priority) console.log(term.dim("Priority:"), task.priority)
  if (task.assigned_to) {
    console.log(term.dim("Assigned:"), task.assigned_to)
  }
  if (task.parent_id) {
    console.log(term.dim("Parent:"), task.parent_id.slice(0, 8))
  }
  console.log(
    term.dim("Created:"),
    new Date(task.created_at ?? Date.now()).toISOString(),
  )

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
