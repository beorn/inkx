/**
 * Task Status Subcommand
 *
 * View or set task status: km task status <id> [new-status]
 */

import { Command } from "@commander-js/extra-typings"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/storage"
import { loadRepo } from "../../load-repo.ts"
import { getMarkerForStatus } from "@km/core"
import type { TaskStatus } from "@km/core"
import { getRootPath } from "../../program.ts"

/** Get styled status icon for terminal display */
function getStatusIcon(status: string): string {
  switch (status) {
    case "done":
      return term.green("✓")
    case "wip":
      return term.yellow("●")
    case "blocked":
      return term.red("✗")
    default:
      return term.dim("○")
  }
}

/**
 * Create the status subcommand
 */
export function createStatusCommand() {
  return new Command("status")
    .description("View or set task status")
    .argument("<id>", "Task ID or prefix")
    .argument("[new-status]", "New status (todo, wip, blocked, done, dropped)")
    .option("--json", "Output as JSON")
    .action(async (id, newStatus, options) => {
      const resolved = resolvePathArg(process.cwd(), getRootPath())
      using repo = await loadRepo(resolved.repoRoot)
      const task = repo.resolveNode(id, { taskOnly: true })

      if (!task) {
        console.error(term.red(`No task found with ID prefix: ${id}`))
        process.exit(1)
      }

      if (!newStatus) {
        // View mode - just show current status
        if (options.json) {
          console.log(
            JSON.stringify({
              id: task.id,
              status: task.task_status ?? "todo",
              mark: task.task_marker ?? "[ ]",
              content: task.content,
            }),
          )
          return
        }

        const status = task.task_status ?? "todo"
        console.log(`${getStatusIcon(status)} ${status}: ${task.content?.slice(0, 60) ?? "(no content)"}`)
        return
      }

      // Set mode - update the status
      const validStatuses = ["todo", "wip", "blocked", "done", "dropped"]
      if (!validStatuses.includes(newStatus)) {
        console.error(term.red(`Invalid status: ${newStatus}`))
        console.error(term.dim(`Valid statuses: ${validStatuses.join(", ")}`))
        process.exit(1)
      }

      const newMarker = getMarkerForStatus(newStatus as TaskStatus)

      repo.updateNode(task.id, {
        task_status: newStatus as TaskStatus,
        task_marker: newMarker,
      })

      if (options.json) {
        console.log(JSON.stringify({ id: task.id, status: newStatus }))
        return
      }

      console.log(
        `${getStatusIcon(newStatus)} ${term.dim(task.id.slice(0, 8))} → ${newStatus}: ${task.content?.slice(0, 50) ?? "(no content)"}`,
      )
    })
}
