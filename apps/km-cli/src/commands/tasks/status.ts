/**
 * Task Status Subcommand
 *
 * View or set task status: km task status <id> [new-status]
 */

import { Command } from "commander"
import chalk from "chalk"
import { emitNodeUpdated, getTaskByIdPrefix } from "@km/storage"
import { getMarkForStatus } from "@km/core"
import type { TaskStatus } from "@km/core"

/**
 * Create the status subcommand
 */
export function createStatusCommand(): Command {
  return new Command("status")
    .description("View or set task status")
    .argument("<id>", "Task ID or prefix")
    .argument("[new-status]", "New status (todo, wip, blocked, done, dropped)")
    .option("--json", "Output as JSON")
    .action((id, newStatus, options) => {
      const task = getTaskByIdPrefix(id)

      if (!task) {
        console.error(chalk.red(`No task found with ID prefix: ${id}`))
        process.exit(1)
      }

      if (!newStatus) {
        // View mode - just show current status
        if (options.json) {
          console.log(
            JSON.stringify({
              id: task.id,
              status: task.task_status ?? "todo",
              mark: task.task_mark ?? " ",
              content: task.content,
            }),
          )
          return
        }

        const status = task.task_status ?? "todo"
        const statusIcon =
          status === "done"
            ? chalk.green("✓")
            : status === "wip"
              ? chalk.yellow("●")
              : status === "blocked"
                ? chalk.red("✗")
                : chalk.dim("○")

        console.log(
          `${statusIcon} ${status}: ${task.content?.slice(0, 60) ?? "(no content)"}`,
        )
        return
      }

      // Set mode - update the status
      const validStatuses = ["todo", "wip", "blocked", "done", "dropped"]
      if (!validStatuses.includes(newStatus)) {
        console.error(chalk.red(`Invalid status: ${newStatus}`))
        console.error(chalk.dim(`Valid statuses: ${validStatuses.join(", ")}`))
        process.exit(1)
      }

      const newMark = getMarkForStatus(newStatus as TaskStatus)

      emitNodeUpdated("cli", task.id, {
        task_status: newStatus as TaskStatus,
        task_mark: newMark,
      })

      if (options.json) {
        console.log(JSON.stringify({ id: task.id, status: newStatus }))
        return
      }

      const statusIcon =
        newStatus === "done"
          ? chalk.green("✓")
          : newStatus === "wip"
            ? chalk.yellow("●")
            : newStatus === "blocked"
              ? chalk.red("✗")
              : chalk.dim("○")

      console.log(
        `${statusIcon} ${chalk.dim(task.id.slice(0, 8))} → ${newStatus}: ${task.content?.slice(0, 50) ?? "(no content)"}`,
      )
    })
}
