/**
 * Add Command
 *
 * Add tasks to boards/lists via transclusion (link).
 * Tasks are linked to the board without changing their original location.
 *
 * km add @next TASKID          # Link task to @next board
 * km add @next ./inbox/**      # Link all inbox tasks to @next
 * km add +project TASKID       # Link task to project
 */

import { Command } from "@commander-js/extra-typings"
import { createTerm } from "@beorn/chalkx"

const term = createTerm(process)
import { ulid } from "ulid"
import {
  queryTasks,
  resolvePathArg,
  emitNodeCreatedWithEmitter,
} from "@km/storage"
import type { KNode } from "@km/core"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"

interface AddOptions {
  dryRun?: boolean
  json?: boolean
}

export const addCommand = new Command("add")
  .description("Add tasks to a board or list")
  .argument("<target>", "Target board/list (ID, path, or filename like @next)")
  .argument("<source...>", "Task IDs or query (e.g., ./inbox/**, status:todo)")
  .option("--dry-run", "Preview without making changes")
  .option("--json", "Output as JSON")
  .action(async (target: string, sources: string[], options: AddOptions) => {
    // Resolve target path argument - may detect repo root
    const resolvedTarget = resolvePathArg(target, getRootPath())
    using repo = await loadRepo(resolvedTarget.repoRoot)

    if (!resolvedTarget.nodeRef) {
      console.error(term.style().red(`Cannot add to a directory`))
      process.exit(1)
    }

    // Resolve target board/container
    const targetNode = repo.resolveNode(resolvedTarget.nodeRef)
    if (!targetNode) {
      console.error(term.style().red(`Target not found: ${target}`))
      console.error(
        term.style().dim("Use ID, path, or filename (e.g., @next, @inbox.md)"),
      )
      process.exit(1)
    }

    // Collect tasks to add (store full node for link creation)
    const tasksToAdd: KNode[] = []

    for (const source of sources) {
      // Resolve source path if it's a filesystem path
      const resolvedSource = resolvePathArg(source, resolvedTarget.repoRoot)

      // Try as node ID/path first
      const nodeRef = resolvedSource.nodeRef ?? source
      const node = repo.resolveNode(nodeRef, "task")
      if (node) {
        tasksToAdd.push(node)
        continue
      }

      // Try as query
      const queryResults = queryTasks(repo.database, source)
      if (queryResults.length > 0) {
        for (const task of queryResults) {
          // Don't add duplicates
          if (!tasksToAdd.some((t) => t.id === task.id)) {
            tasksToAdd.push(task)
          }
        }
        continue
      }

      // Nothing found
      console.warn(term.style().yellow(`No tasks found for: ${source}`))
    }

    if (tasksToAdd.length === 0) {
      console.log(term.style().yellow("No tasks to add"))
      process.exit(0)
    }

    // Find the default column (section with data.rules.default=true)
    // Falls back to the first section if no explicit default is set
    let actualTarget = targetNode
    const findDefaultSection = (parentId: string): KNode | undefined => {
      const children = repo.getChildren(parentId)
      let firstSection: KNode | undefined
      for (const child of children) {
        if (child.type === "section") {
          // Track first section as fallback
          if (!firstSection) {
            firstSection = child
          }
          const rules = child.data?.rules as { default?: boolean } | undefined
          if (rules?.default) {
            return child
          }
          // Search deeper for explicit default
          const found = findDefaultSection(child.id)
          if (found) return found
        }
      }
      // No explicit default found, return first section as fallback
      return firstSection
    }
    const defaultColumn = findDefaultSection(targetNode.id)
    if (defaultColumn) {
      actualTarget = defaultColumn
    }

    // Use timestamp-based ordering for new items
    let nextIdx = Date.now()

    if (options.dryRun) {
      console.log(term.style().cyan("Dry run - would link:"))
      for (const task of tasksToAdd) {
        console.log(
          `  ${term.style().dim(task.id.slice(0, 8))} ${(task.content || "").slice(0, 50)}`,
        )
      }
      console.log(
        term
          .style()
          .dim(`\nTo: ${targetNode.content || targetNode.fs_path || target}`),
      )
      return
    }

    // Create link nodes in the target (transclusion - tasks stay in original location)
    for (const task of tasksToAdd) {
      // Create a link node that points to the original task
      const linkId = ulid()
      emitNodeCreatedWithEmitter(repo.emitter, "cli:add", {
        id: linkId,
        type: "task",
        parent_id: actualTarget.id,
        parent_idx: nextIdx++,
        link_to: task.id, // Points to the original task
        // Copy some properties for display purposes
        content: task.content,
        task_status: task.task_status,
        task_mark: task.task_mark,
      })
    }

    if (options.json) {
      console.log(
        JSON.stringify({
          target: targetNode.id,
          linked: tasksToAdd.map((t) => t.id),
          count: tasksToAdd.length,
        }),
      )
      return
    }

    console.log(
      term.style().green("✓"),
      `Linked ${tasksToAdd.length} task(s) to ${targetNode.content || target}`,
    )
    for (const task of tasksToAdd.slice(0, 5)) {
      console.log(
        term
          .style()
          .dim(`  ${task.id.slice(0, 8)} ${(task.content || "").slice(0, 40)}`),
      )
    }
    if (tasksToAdd.length > 5) {
      console.log(term.style().dim(`  ... and ${tasksToAdd.length - 5} more`))
    }
  })
