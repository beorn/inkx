/**
 * Task Mutations
 *
 * Functions for modifying tasks: add, claim, release, assign, markDone.
 */

import chalk from "chalk"
import { ulid } from "ulid"
import {
  createVault,
  runGenerator,
  resolvePathArg,
  emitNodeCreated,
  emitNodeUpdated,
  parseTaskMetadata,
  extractTags,
} from "@km/storage"
import type { TaskStatus } from "@km/core"
import { getRootPath } from "../../index.ts"
import { findNodeByPathOrId } from "./queries.ts"

/**
 * Add a task under a parent
 */
export function addTask(
  pathOrId: string | undefined,
  content: string,
  options: { json?: boolean },
): void {
  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using vault = runGenerator(createVault(resolved.vaultRoot))

  // Parse metadata from content
  const metadata = parseTaskMetadata(content)
  const tags = extractTags(content)

  // Resolve parent
  let parentId: string | null = null
  if (pathOrId) {
    const parent = findNodeByPathOrId(vault, pathOrId)
    if (!parent) {
      console.error(chalk.red(`Parent not found: ${pathOrId}`))
      process.exit(1)
    }
    parentId = parent.id
  }

  const nodeId = ulid()
  const event = emitNodeCreated(process.env.USER ?? "user", {
    id: nodeId,
    type: "task",
    parent_id: parentId,
    content: content,
    task_status: "todo" as TaskStatus,
    task_mark: " ",
    due_date: metadata.dueDate,
    scheduled_date: metadata.scheduledDate,
    priority: metadata.priority,
    data: tags.length > 0 ? { tags } : {},
  })

  if (options.json) {
    console.log(JSON.stringify({ id: nodeId, event: event.id }))
    return
  }

  console.log(chalk.green("Created task:"), nodeId.slice(0, 8))
}

/**
 * Mark a task as done
 */
export function markDone(
  pathOrId: string | undefined,
  options: { json?: boolean },
): void {
  if (!pathOrId) {
    console.error(chalk.red("Task ID or path required"))
    process.exit(1)
  }

  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using vault = runGenerator(createVault(resolved.vaultRoot))

  const task = vault.resolveNode(pathOrId, { taskOnly: true })
  if (!task) {
    console.error(chalk.red(`Task not found: ${pathOrId}`))
    process.exit(1)
  }

  emitNodeUpdated(process.env.USER ?? "user", task.id, {
    task_status: "done",
    task_mark: "x",
  })

  if (options.json) {
    console.log(JSON.stringify({ id: task.id, status: "done" }))
    return
  }

  console.log(chalk.green("✓"), "Marked as done:", task.id.slice(0, 8))
}

/**
 * Claim a task (assign to yourself)
 */
export function claimTask(
  pathOrId: string | undefined,
  options: { json?: boolean },
): void {
  if (!pathOrId) {
    console.error(chalk.red("Task ID or path required"))
    process.exit(1)
  }

  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using vault = runGenerator(createVault(resolved.vaultRoot))

  const task = vault.resolveNode(pathOrId, { taskOnly: true })
  if (!task) {
    console.error(chalk.red(`Task not found: ${pathOrId}`))
    process.exit(1)
  }

  const actor = process.env.USER ?? "user"
  emitNodeUpdated(actor, task.id, {
    assigned_to: actor,
    task_status: "wip",
    task_mark: "/",
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

  console.log(chalk.green("◐"), "Claimed:", task.id.slice(0, 8))
}

/**
 * Release a claimed task
 */
export function releaseTask(
  pathOrId: string | undefined,
  options: { json?: boolean },
): void {
  if (!pathOrId) {
    console.error(chalk.red("Task ID or path required"))
    process.exit(1)
  }

  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using vault = runGenerator(createVault(resolved.vaultRoot))

  const task = vault.resolveNode(pathOrId, { taskOnly: true })
  if (!task) {
    console.error(chalk.red(`Task not found: ${pathOrId}`))
    process.exit(1)
  }

  emitNodeUpdated(process.env.USER ?? "user", task.id, {
    assigned_to: null,
    task_status: "todo" as TaskStatus,
    task_mark: " ",
  })

  if (options.json) {
    console.log(
      JSON.stringify({ id: task.id, status: "todo", assigned_to: null }),
    )
    return
  }

  console.log(chalk.dim("○"), "Released:", task.id.slice(0, 8))
}

/**
 * Assign a task to a user
 */
export function assignTask(
  pathOrId: string | undefined,
  user: string,
  options: { json?: boolean },
): void {
  if (!pathOrId) {
    console.error(chalk.red("Task ID or path required"))
    process.exit(1)
  }

  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using vault = runGenerator(createVault(resolved.vaultRoot))

  const task = vault.resolveNode(pathOrId, { taskOnly: true })
  if (!task) {
    console.error(chalk.red(`Task not found: ${pathOrId}`))
    process.exit(1)
  }

  emitNodeUpdated(process.env.USER ?? "user", task.id, {
    assigned_to: user,
  })

  if (options.json) {
    console.log(JSON.stringify({ id: task.id, assigned_to: user }))
    return
  }

  console.log(chalk.green("→"), `Assigned to ${user}:`, task.id.slice(0, 8))
}
