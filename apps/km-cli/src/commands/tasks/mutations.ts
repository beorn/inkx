/**
 * Task Mutations
 *
 * Functions for modifying tasks: create, claim, release, assign, markDone.
 */

import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg, parseTaskMetadata, extractTags } from "@km/storage"
import { loadRepo } from "../../load-repo.ts"
import type { TaskStatus } from "@km/core"
import { getRootPath } from "../../program.ts"
import { findNodeByPathOrId } from "./queries.ts"

/**
 * Create a task under a parent
 */
export async function createTask(
  pathOrId: string | undefined,
  content: string,
  options: { json?: boolean },
): Promise<void> {
  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)

  // Parse metadata from content
  const metadata = parseTaskMetadata(content)
  const tags = extractTags(content)

  // Resolve parent
  let parentId: string | null = null
  if (pathOrId) {
    const parent = findNodeByPathOrId(repo, pathOrId)
    if (!parent) {
      console.error(term.red(`Parent not found: ${pathOrId}`))
      process.exit(1)
    }
    parentId = parent.id
  }

  const nodeId = repo.addNode(parentId, {
    type: "p",
    item: true,
    list_marker: "-",
    task_marker: "[ ]",
    content: content,
    task_status: "todo" as TaskStatus,
    due_at: metadata.dueAt,
    start_at: metadata.startAt,
    priority: metadata.priority,
    data: tags.length > 0 ? { tags } : {},
  })

  if (options.json) {
    console.log(JSON.stringify({ id: nodeId }))
    return
  }

  console.log(term.green("Created task:"), nodeId.slice(-8))
}

/**
 * Mark a task as done
 */
export async function markDone(pathOrId: string | undefined, options: { json?: boolean }): Promise<void> {
  if (!pathOrId) {
    console.error(term.red("Task ID or path required"))
    process.exit(1)
  }

  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)

  const task = repo.resolveNode(pathOrId, { taskOnly: true })
  if (!task) {
    console.error(term.red(`Task not found: ${pathOrId}`))
    process.exit(1)
  }

  repo.updateNode(task.id, {
    task_status: "done",
    task_marker: "[x]",
  })

  if (options.json) {
    console.log(JSON.stringify({ id: task.id, status: "done" }))
    return
  }

  console.log(term.green("✓"), "Marked as done:", task.id.slice(-8))
}

/**
 * Claim a task (assign to yourself)
 */
export async function claimTask(pathOrId: string | undefined, options: { json?: boolean }): Promise<void> {
  if (!pathOrId) {
    console.error(term.red("Task ID or path required"))
    process.exit(1)
  }

  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)

  const task = repo.resolveNode(pathOrId, { taskOnly: true })
  if (!task) {
    console.error(term.red(`Task not found: ${pathOrId}`))
    process.exit(1)
  }

  const actor = process.env.USER ?? "user"
  repo.updateNode(task.id, {
    assigned_to: actor,
    task_status: "wip",
    task_marker: "[/]",
  })

  if (options.json) {
    console.log(
      JSON.stringify({
        id: task.id,
        status: "wip",
        assigned_to: actor,
      }),
    )
    return
  }

  console.log(term.green("◐"), "Claimed:", task.id.slice(-8))
}

/**
 * Release a claimed task
 */
export async function releaseTask(pathOrId: string | undefined, options: { json?: boolean }): Promise<void> {
  if (!pathOrId) {
    console.error(term.red("Task ID or path required"))
    process.exit(1)
  }

  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)

  const task = repo.resolveNode(pathOrId, { taskOnly: true })
  if (!task) {
    console.error(term.red(`Task not found: ${pathOrId}`))
    process.exit(1)
  }

  repo.updateNode(task.id, {
    assigned_to: undefined,
    task_status: "todo" as TaskStatus,
    task_marker: "[ ]",
  })

  if (options.json) {
    console.log(JSON.stringify({ id: task.id, status: "todo", assigned_to: null }))
    return
  }

  console.log(term.dim("○"), "Released:", task.id.slice(-8))
}

/**
 * Assign a task to a user
 */
export async function assignTask(
  pathOrId: string | undefined,
  user: string,
  options: { json?: boolean },
): Promise<void> {
  if (!pathOrId) {
    console.error(term.red("Task ID or path required"))
    process.exit(1)
  }

  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)

  const task = repo.resolveNode(pathOrId, { taskOnly: true })
  if (!task) {
    console.error(term.red(`Task not found: ${pathOrId}`))
    process.exit(1)
  }

  repo.updateNode(task.id, {
    assigned_to: user,
  })

  if (options.json) {
    console.log(JSON.stringify({ id: task.id, assigned_to: user }))
    return
  }

  console.log(term.green("→"), `Assigned to ${user}:`, task.id.slice(-8))
}
