/**
 * Task Set/Clear Subcommands
 *
 * Set or clear task field values.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/storage"
import { getMarkerForStatus } from "@km/core"
import type { TaskStatus } from "@km/core"
import { getRootPath } from "../../program.ts"
import { loadRepo } from "../../load-repo.ts"

/**
 * Create the set subcommand
 *
 * km task set <id> due:2025-01-20      # Set due date
 * km task set <id> priority:P1          # Set priority
 * km task set <id> status:blocked      # Set blocked
 */
export function createSetCommand() {
  return new Command("set")
    .description("Set task field values")
    .argument("<id>", "Task ID or prefix")
    .argument("<fields...>", "Field:value pairs (due:2025-01-20, priority:P1, status:todo)")
    .option("--json", "Output as JSON")
    .action(async (id, fields, options) => {
      const resolved = resolvePathArg(process.cwd(), getRootPath())
      using repo = await loadRepo(resolved.repoRoot)
      const task = repo.resolveNode(id, { taskOnly: true })

      if (!task) {
        console.error(term.red(`No task found with ID prefix: ${id}`))
        process.exit(1)
      }

      const updates: Record<string, unknown> = {}

      for (const field of fields) {
        const colonIndex = field.indexOf(":")
        if (colonIndex === -1) {
          console.error(term.red(`Invalid field format: ${field} (expected field:value)`))
          process.exit(1)
        }

        const key = field.slice(0, colonIndex).toLowerCase()
        const value = field.slice(colonIndex + 1)

        switch (key) {
          case "due":
          case "due_date":
          case "due_at":
            updates.due_at = value || null
            break
          case "start":
          case "scheduled":
          case "scheduled_date":
          case "start_at":
            updates.start_at = value || null
            break
          case "priority":
            updates.priority = value || null
            break
          case "status":
          case "task_status":
            updates.task_status = value as TaskStatus
            updates.task_marker = getMarkerForStatus(value as TaskStatus)
            break
          case "assigned":
          case "assigned_to":
          case "owner":
            updates.assigned_to = value || null
            break
          default:
            console.error(term.yellow(`Unknown field: ${key}`))
        }
      }

      if (Object.keys(updates).length === 0) {
        console.error(term.red("No valid field updates provided"))
        process.exit(1)
      }

      repo.updateNode(task.id, updates)

      if (options.json) {
        console.log(JSON.stringify({ id: task.id, updates }))
        return
      }

      console.log(term.green("✓"), `Updated ${Object.keys(updates).join(", ")}:`, task.id.slice(-8))
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

      const updates: Record<string, unknown> = {}

      for (const field of fields) {
        const key = field.toLowerCase()

        switch (key) {
          case "due":
          case "due_date":
          case "due_at":
            updates.due_at = null
            break
          case "start":
          case "scheduled":
          case "scheduled_date":
          case "start_at":
            updates.start_at = null
            break
          case "p":
          case "priority":
            updates.priority = null
            break
          case "assigned":
          case "assigned_to":
          case "owner":
            updates.assigned_to = null
            break
          default:
            console.error(term.yellow(`Unknown field: ${key}`))
        }
      }

      if (Object.keys(updates).length === 0) {
        console.error(term.red("No valid fields to clear"))
        process.exit(1)
      }

      repo.updateNode(task.id, updates)

      if (options.json) {
        console.log(JSON.stringify({ id: task.id, cleared: fields }))
        return
      }

      console.log(term.dim("○"), `Cleared ${fields.join(", ")}:`, task.id.slice(-8))
    })
}
