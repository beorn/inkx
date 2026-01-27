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

import { Command } from "commander"
import chalk from "chalk"
import {
  resolvePathArg,
  getNextOccurrence,
  naturalToRRule,
} from "@km/storage"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import type { TaskStatus, TaskMark } from "@km/core"

/**
 * Get task mark for status
 */
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
      console.error(chalk.red(`Task not found: ${id}`))
      process.exit(1)
    }

    // View mode - just show current status
    if (!newStatus) {
      const status = node.task_status ?? "todo"
      const statusIcon =
        status === "done"
          ? chalk.green("✓")
          : status === "blocked"
            ? chalk.red("!")
            : status === "dropped"
              ? chalk.dim("-")
              : chalk.dim("○")

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

      console.log(
        `${statusIcon} ${status}: ${node.content?.slice(0, 60) ?? "(no content)"}`,
      )
      return
    }

    // Set mode - validate and update status
    const validStatuses = ["todo", "wip", "blocked", "done", "dropped"]
    if (!validStatuses.includes(newStatus)) {
      console.error(chalk.red(`Invalid status: ${newStatus}`))
      console.error(chalk.dim(`Valid statuses: ${validStatuses.join(", ")}`))
      process.exit(1)
    }

    // Handle recurring tasks when marking done
    if (newStatus === "done") {
      const recurrence =
        (node.data?.recurrence as string) ||
        (node.recurrence as string | undefined)

      if (recurrence) {
        // Convert natural language to RRULE if needed
        const rrule = naturalToRRule(recurrence) || recurrence

        // Calculate next due date
        const baseDate = node.due_date || new Date().toISOString().slice(0, 10)
        const nextDue = getNextOccurrence(rrule, baseDate)

        if (nextDue) {
          // Clone the task with new due date
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
            console.log(
              chalk.green("✓"),
              `Marked done: ${node.content?.slice(0, 40)}`,
            )
            console.log(chalk.blue("↻"), `Next occurrence: ${nextDue}`)
          }
        }
      }
    }

    const newMark = getMarkForStatus(newStatus as TaskStatus)

    repo.updateNode(node.id, {
      task_status: newStatus as TaskStatus,
      task_mark: newMark,
    })

    if (options.json) {
      // For non-recurring done, we haven't output yet
      const recurrence =
        (node.data?.recurrence as string) ||
        (node.recurrence as string | undefined)
      if (newStatus !== "done" || !recurrence) {
        console.log(JSON.stringify({ id: node.id, status: newStatus }))
      }
      return
    }

    const statusIcon =
      newStatus === "done"
        ? chalk.green("✓")
        : newStatus === "blocked"
          ? chalk.red("!")
          : newStatus === "dropped"
            ? chalk.dim("-")
            : chalk.dim("○")

    console.log(
      `${statusIcon} ${chalk.dim(node.id.slice(0, 8))} → ${newStatus}: ${node.content?.slice(0, 50) ?? "(no content)"}`,
    )
  })
