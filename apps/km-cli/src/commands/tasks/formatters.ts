/**
 * Task Display Formatters
 *
 * Functions for formatting tasks and their paths for CLI output.
 */

import chalk from "chalk"
import {
  getNodeDisplayName as getNodeDisplayNameRaw,
  type CollapsedAncestor,
} from "@km/tree"
import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"

/**
 * Get display name for a node (using repo for children lookup)
 */
export function getNodeDisplayName(repo: Repo, node: KNode): string {
  return getNodeDisplayNameRaw(node, (parentId) => repo.getChildren(parentId))
}

/**
 * Format a collapsed ancestor for display with its type suffix
 */
export function formatCollapsedAncestor(
  repo: Repo,
  ca: CollapsedAncestor,
): string {
  const name = getNodeDisplayName(repo, ca.node)
  if (ca.typeSuffix) {
    return name + chalk.gray(` ${ca.typeSuffix}`)
  }
  // No collapsed suffix - show individual type indicator
  if (ca.node.type === "folder") {
    return name + chalk.gray("/")
  } else if (ca.node.type === "file") {
    // Only add .md if name doesn't already end with it
    return name.endsWith(".md") ? name : name + chalk.gray(".md")
  } else if (ca.node.type === "section") {
    const depth = (ca.node.data?.depth as number) ?? 1
    return chalk.gray("#".repeat(depth) + " ") + name
  }
  return name
}

/**
 * Format a task for display with path
 */
export function formatTaskWithPath(
  repo: Repo,
  task: KNode,
  collapsedAncestors: CollapsedAncestor[],
  options: { verbose?: boolean; flat?: boolean; showId?: boolean } = {},
): string[] {
  const lines: string[] = []

  if (options.flat) {
    // Single line: path → task
    const pathParts = collapsedAncestors.map((ca) =>
      chalk.dim(formatCollapsedAncestor(repo, ca)),
    )
    const pathStr = pathParts.length > 0 ? pathParts.join(" › ") + " › " : ""
    lines.push(pathStr + formatTaskLine(task, options))
  } else {
    // Multi-line: each ancestor on its own line
    // - Folders/files: 1 space per level
    // - Sections: same indent as their file (# prefix shows heading level)
    let fsDepth = 0
    let hasSection = false
    for (const ca of collapsedAncestors) {
      const prefix = " ".repeat(fsDepth)
      lines.push(prefix + chalk.dim(formatCollapsedAncestor(repo, ca)))
      if (ca.node.type === "section") {
        hasSection = true
      } else {
        // Only folders/files increase the depth
        fsDepth++
      }
    }
    // Task indent: fsDepth + 3 spaces if under a section (to align with section content)
    const taskIndent = hasSection ? fsDepth + 3 : fsDepth
    const taskPrefix = " ".repeat(taskIndent)
    lines.push(taskPrefix + formatTaskLine(task, options))
  }

  return lines
}

/**
 * Format the task line itself (checkbox, id, content)
 */
export function formatTaskLine(
  task: KNode,
  options: { verbose?: boolean; showId?: boolean } = {},
): string {
  const mark = task.task_mark ?? " "
  const status = task.task_status ?? "todo"

  // Color the checkbox based on status, using actual task mark
  const checkboxStr = `[${mark}]`
  const checkbox =
    status === "done"
      ? chalk.green(checkboxStr)
      : status === "wip"
        ? chalk.yellow(checkboxStr)
        : status === "blocked"
          ? chalk.red(checkboxStr)
          : chalk.dim(checkboxStr)

  const content = task.content ?? "(no content)"

  // Build line: checkbox, optional id, content
  let line = `${checkbox} `
  if (options.showId) {
    // Show last 8 chars of ID (the random part, not timestamp)
    const shortId = task.id.slice(-8)
    line += `${chalk.dim(shortId)}  `
  }
  line += content

  if (options.verbose) {
    if (task.due_date) {
      line += chalk.cyan(` 📅 ${task.due_date}`)
    }
    if (task.priority) {
      const p = task.priority === 1 ? "⏫" : task.priority === 2 ? "🔼" : "🔽"
      line += ` ${p}`
    }
    if (task.assigned_to) {
      line += chalk.magenta(` @${task.assigned_to}`)
    }
  }

  return line
}
