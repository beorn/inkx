/**
 * Status Command
 *
 * View or set task status. Replaces km done and km toggle.
 *
 * km status <id>              # View task status
 * km status <id> done         # Mark as done
 * km status <id> todo         # Mark as todo
 * km status <id> blocked      # Mark as blocked
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg, getNextOccurrence, naturalToRRule } from "@km/storage"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import { getMarkerForStatus } from "@km/core"
import type { TaskStatus, KNode } from "@km/core"
import type { Repo } from "@km/storage"

/** Get styled status icon for terminal display */
function getStatusIcon(status: string): string {
  switch (status) {
    case "done":
      return term.green("✓")
    case "blocked":
      return term.red("!")
    case "dropped":
      return term.dim("-")
    default:
      return term.dim("○")
  }
}

/** Display current task status (view mode, no mutation) */
function displayStatus(node: KNode, options: { json?: boolean }): void {
  const status = node.task_status ?? "todo"

  if (options.json) {
    console.log(
      JSON.stringify({
        id: node.id,
        status,
        mark: node.task_marker ?? "[ ]",
        content: node.content,
      }),
    )
    return
  }

  const icon = getStatusIcon(status)
  console.log(`${icon} ${status}: ${node.content?.slice(0, 60) ?? "(no content)"}`)
}

/**
 * Handle recurring task completion: clone the task with next due date.
 * Returns true if the task was recurring (and output was emitted), false otherwise.
 */
function handleRecurringTask(repo: Repo, node: KNode, options: { json?: boolean }): boolean {
  const recurrence = (node.data?.rrule as string) || (node.rrule as string | undefined)
  if (!recurrence) return false

  // Convert natural language to RRULE if needed
  const rrule = naturalToRRule(recurrence) || recurrence

  // Calculate next due date
  const baseDate = node.due_at || new Date().toISOString().slice(0, 10)
  const nextDue = getNextOccurrence(rrule, baseDate)
  if (!nextDue) return false

  // Clone the task with new due date
  const newId = repo.cloneTask(node.id, {
    due_at: nextDue,
    task_status: "todo",
    task_marker: "[ ]",
  })

  if (options.json) {
    console.log(
      JSON.stringify({
        id: node.id,
        status: "done",
        recurring: true,
        next_id: newId,
        next_due: nextDue,
      }),
    )
  } else {
    console.log(term.green("✓"), `Marked done: ${node.content?.slice(0, 40)}`)
    console.log(term.blue("↻"), `Next occurrence: ${nextDue}`)
  }

  return true
}

export const statusCommand = new Command("status")
  .description("View or set task status")
  .argument("<id>", "Task ID, path, or filename")
  .argument("[status]", "New status: todo, wip, blocked, done, dropped")
  .option("--json", "Output as JSON")
  .action(async (id, newStatus, options) => {
    const resolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = await loadRepo(resolved.repoRoot)
    const node = repo.resolveNode(id, { taskOnly: true })

    if (!node) {
      console.error(term.red(`Task not found: ${id}`))
      process.exit(1)
    }

    // View mode - just show current status
    if (!newStatus) {
      displayStatus(node, options)
      return
    }

    // Set mode - validate and update status
    const validStatuses = ["todo", "wip", "blocked", "done", "dropped"]
    if (!validStatuses.includes(newStatus)) {
      console.error(term.red(`Invalid status: ${newStatus}`))
      console.error(term.dim(`Valid statuses: ${validStatuses.join(", ")}`))
      process.exit(1)
    }

    // Handle recurring tasks when marking done
    const isRecurring = newStatus === "done" && handleRecurringTask(repo, node, options)

    const newMarker = getMarkerForStatus(newStatus as TaskStatus)

    repo.updateNode(node.id, {
      task_status: newStatus as TaskStatus,
      task_marker: newMarker,
    })

    if (options.json) {
      if (!isRecurring) {
        console.log(JSON.stringify({ id: node.id, status: newStatus }))
      }
      return
    }

    const icon = getStatusIcon(newStatus)
    console.log(
      `${icon} ${term.dim(node.id.slice(0, 8))} → ${newStatus}: ${node.content?.slice(0, 50) ?? "(no content)"}`,
    )
  })
