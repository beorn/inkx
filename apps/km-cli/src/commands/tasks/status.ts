/**
 * Task Status Subcommand
 *
 * View or set task status: km task status <id> [new-status]
 *
 * Logic lives in `./status-plan.ts` (pure); this file owns I/O —
 * commander wiring, repo load, terminal coloring, and JSON emission.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/fs-mount"
import { loadRepo } from "../../load-repo.ts"
import { getRootPath } from "../../program.ts"
import { planStatus, VALID_STATUSES } from "./status-plan.ts"

// Re-export the planner so existing imports keep working.
export { planStatus, VALID_STATUSES, type StatusPlan } from "./status-plan.ts"

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

      const plan = planStatus(task, id, newStatus)

      if (plan.kind === "not-found") {
        console.error(term.red(`No task found with ID prefix: ${plan.id}`))
        process.exit(1)
      }

      if (plan.kind === "invalid-status") {
        console.error(term.red(`Invalid status: ${plan.given}`))
        console.error(term.dim(`Valid statuses: ${plan.valid.join(", ")}`))
        process.exit(1)
      }

      if (plan.kind === "view") {
        if (options.json) {
          console.log(
            JSON.stringify({
              id: plan.id,
              status: plan.status,
              mark: plan.marker,
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- planStatus returns kind="view" only when task is non-null
              content: task!.content,
            }),
          )
          return
        }
        console.log(`${getStatusIcon(plan.status)} ${plan.status}: ${plan.content.slice(0, 60)}`)
        return
      }

      // plan.kind === "set"
      repo.updateNode(plan.id, {
        item: { task: { status: plan.status, marker: plan.marker } },
      })

      if (options.json) {
        console.log(JSON.stringify({ id: plan.id, status: plan.status }))
        return
      }

      console.log(
        `${getStatusIcon(plan.status)} ${term.dim(plan.id.slice(-8))} → ${plan.status}: ${plan.content.slice(0, 50)}`,
      )
    })
}
