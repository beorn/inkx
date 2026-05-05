/**
 * Task Set/Clear Subcommands
 *
 * Set or clear task field values.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/fs-mount"
import { getRootPath } from "../../program.ts"
import { loadRepo } from "../../load-repo.ts"
import { planSetFields, planClearFields } from "./set-clear-plan.ts"

// Re-export so existing imports continue to work.
export { planSetFields, planClearFields, type SetFieldPlan, type ClearFieldPlan } from "./set-clear-plan.ts"

/**
 * Create the set subcommand
 *
 * km task set <id> due:2025-01-20      # Set due date
 * km task set <id> priority:P1         # Set priority
 * km task set <id> status:blocked      # Set blocked
 * km task set <id> type:bug            # Set bead-style type tag
 * km task set <id> parent:@km/scope    # Reparent under another node
 * km task set <id> aliases:foo,bar     # Set frontmatter aliases
 */
export function createSetCommand() {
  return new Command("set")
    .description("Set task field values")
    .argument("<id>", "Task ID or prefix")
    .argument(
      "<fields...>",
      "Field:value pairs (due:2025-01-20, priority:P1, status:todo, type:bug, parent:<ref>, aliases:a,b)",
    )
    .option("--json", "Output as JSON")
    .action(async (id, fields, options) => {
      const resolved = resolvePathArg(process.cwd(), getRootPath())
      using repo = await loadRepo(resolved.repoRoot)
      const task = repo.resolveNode(id, { taskOnly: true })

      if (!task) {
        console.error(term.red(`No task found with ID prefix: ${id}`))
        process.exit(1)
      }

      const plan = planSetFields(repo, task.id, fields)

      for (const warning of plan.warnings) {
        console.error(term.yellow(warning))
      }
      if (plan.errors.length > 0) {
        for (const err of plan.errors) {
          console.error(term.red(err))
        }
        process.exit(1)
      }

      const hasUpdates = Object.keys(plan.updates).length > 0
      if (!hasUpdates && plan.newParentId === undefined) {
        console.error(term.red("No valid field updates provided"))
        process.exit(1)
      }

      if (hasUpdates) {
        repo.updateNode(task.id, plan.updates)
      }

      if (plan.newParentId) {
        const siblings = repo.getChildren(plan.newParentId)
        repo.moveNode(task.id, plan.newParentId, siblings.length)
      }

      const updatedKeys = [...Object.keys(plan.updates), ...(plan.newParentId ? ["parent"] : [])]

      if (options.json) {
        const payload: Record<string, unknown> = { id: task.id, updates: plan.updates }
        if (plan.newParentId) payload.parent = plan.newParentId
        console.log(JSON.stringify(payload))
        return
      }

      console.log(term.green("✓"), `Updated ${updatedKeys.join(", ")}:`, task.id.slice(-8))
    })
}

/**
 * Create the clear subcommand
 *
 * km task clear <id> due        # Clear due date
 * km task clear <id> priority   # Clear priority
 */
export function createClearCommand() {
  return new Command("clear")
    .description("Clear task field values")
    .argument("<id>", "Task ID or prefix")
    .argument("<fields...>", "Fields to clear (due, priority, scheduled, assigned)")
    .option("--json", "Output as JSON")
    .action(async (id, fields, options) => {
      const resolved = resolvePathArg(process.cwd(), getRootPath())
      using repo = await loadRepo(resolved.repoRoot)
      const task = repo.resolveNode(id, { taskOnly: true })

      if (!task) {
        console.error(term.red(`No task found with ID prefix: ${id}`))
        process.exit(1)
      }

      const plan = planClearFields(fields)
      for (const warning of plan.warnings) {
        console.error(term.yellow(warning))
      }

      if (Object.keys(plan.updates).length === 0) {
        console.error(term.red("No valid fields to clear"))
        process.exit(1)
      }

      repo.updateNode(task.id, plan.updates)

      if (options.json) {
        console.log(JSON.stringify({ id: task.id, cleared: fields }))
        return
      }

      console.log(term.dim("○"), `Cleared ${fields.join(", ")}:`, task.id.slice(-8))
    })
}
