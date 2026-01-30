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

import { Command } from "@commander-js/extra-typings"
import { createTerm } from "inkx"

const term = createTerm(process)
import { resolvePathArg, getNextOccurrence, naturalToRRule } from "@km/storage"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import type { TaskStatus, TaskMark, TaskNode, Repo } from "@km/core"

const VALID_STATUSES = ["todo", "wip", "blocked", "done", "dropped"] as const

type StatusOptions = { json?: boolean }

function getMarkForStatus(status: TaskStatus): TaskMark {
  switch (status) {
    case "done":
      return "x"
    case "wip":
      return "/"
    case "blocked":
      return "!"
    case "dropped":
      return "-"
    default:
      return " "
  }
}

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

function getNodeRecurrence(node: TaskNode): string | undefined {
  return (
    (node.data?.recurrence as string) || (node.recurrence as string | undefined)
  )
}

function handleViewMode(node: TaskNode, options: StatusOptions): void {
  const status = node.task_status ?? "todo"

  if (options.json) {
    console.log(
      JSON.stringify({
        id: node.id,
        status,
        mark: node.task_mark ?? " ",
        content: node.content,
      }),
    )
    return
  }

  const statusIcon = getStatusIcon(status)
  const content = node.content?.slice(0, 60) ?? "(no content)"
  console.log(`${statusIcon} ${status}: ${content}`)
}

function handleRecurringTask(
  repo: Repo,
  node: TaskNode,
  options: StatusOptions,
): boolean {
  const recurrence = getNodeRecurrence(node)
  if (!recurrence) return false

  const rrule = naturalToRRule(recurrence) || recurrence
  const baseDate = node.due_date || new Date().toISOString().slice(0, 10)
  const nextDue = getNextOccurrence(rrule, baseDate)

  if (!nextDue) return false

  const newId = repo.cloneTask(node.id, {
    due_date: nextDue,
    task_status: "todo",
    task_mark: " ",
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

function outputStatusChange(
  node: TaskNode,
  newStatus: string,
  options: StatusOptions,
  handledRecurring: boolean,
): void {
  if (options.json) {
    if (!handledRecurring) {
      console.log(JSON.stringify({ id: node.id, status: newStatus }))
    }
    return
  }

  if (handledRecurring) return

  const statusIcon = getStatusIcon(newStatus)
  const content = node.content?.slice(0, 50) ?? "(no content)"
  console.log(
    `${statusIcon} ${term.dim(node.id.slice(0, 8))} → ${newStatus}: ${content}`,
  )
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

    if (!newStatus) {
      handleViewMode(node, options)
      return
    }

    if (
      !VALID_STATUSES.includes(newStatus as (typeof VALID_STATUSES)[number])
    ) {
      console.error(term.red(`Invalid status: ${newStatus}`))
      console.error(term.dim(`Valid statuses: ${VALID_STATUSES.join(", ")}`))
      process.exit(1)
    }

    let handledRecurring = false
    if (newStatus === "done") {
      handledRecurring = handleRecurringTask(repo, node, options)
    }

    const newMark = getMarkForStatus(newStatus as TaskStatus)
    repo.updateNode(node.id, {
      task_status: newStatus as TaskStatus,
      task_mark: newMark,
    })

    outputStatusChange(node, newStatus, options, handledRecurring)
  })
