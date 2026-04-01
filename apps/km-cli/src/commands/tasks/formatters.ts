/**
 * Task Display Formatters
 *
 * Functions for formatting tasks and their paths for CLI output.
 */

import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { getNodeDisplayName as getNodeDisplayNameRaw, type CollapsedAncestor } from "@km/tree"
import type { Repo } from "@km/storage"
import { KNode, type KNode as KNodeType } from "@km/core"

/**
 * Get display name for a node (using repo for children lookup)
 */
export function getNodeDisplayName(repo: Repo, node: KNodeType): string {
  return getNodeDisplayNameRaw(node, (parentId) => repo.getChildren(parentId))
}

/**
 * Format a collapsed ancestor for display with its type suffix
 */
export function formatCollapsedAncestor(repo: Repo, ca: CollapsedAncestor): string {
  const name = getNodeDisplayName(repo, ca.node)
  if (ca.typeSuffix) {
    return name + term.gray(` ${ca.typeSuffix}`)
  }
  // No collapsed suffix - show individual type indicator
  if (KNode.isOutline(ca.node) && ca.node.fstype === "folder") {
    return name + term.gray("/")
  } else if (KNode.isOutline(ca.node) && (ca.node.fstype === "file" || ca.node.fstype === "mdfile")) {
    // Only add .md if name doesn't already end with it
    return name.endsWith(".md") ? name : name + term.gray(".md")
  } else if (KNode.isOutline(ca.node) && ca.node.fstype === "mdsection") {
    // Compute depth from tree nesting (direct file children = H2)
    let depth = 2
    let current: KNodeType | null | undefined = ca.node.parent_id ? repo.getNode(ca.node.parent_id) : undefined
    while (current && KNode.isOutline(current) && current.fstype === "mdsection") {
      depth++
      current = current.parent_id ? repo.getNode(current.parent_id) : undefined
    }
    return term.gray("#".repeat(depth) + " ") + name
  }
  return name
}

/**
 * Format a task for display with path
 */
export function formatTaskWithPath(
  repo: Repo,
  task: KNodeType,
  collapsedAncestors: CollapsedAncestor[],
  options: { detail?: boolean; flat?: boolean; showId?: boolean } = {},
): string[] {
  const lines: string[] = []

  if (options.flat) {
    // Single line: path → task
    const pathParts = collapsedAncestors.map((ca) => term.dim(formatCollapsedAncestor(repo, ca)))
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
      lines.push(prefix + term.dim(formatCollapsedAncestor(repo, ca)))
      if (KNode.isOutline(ca.node) && ca.node.fstype === "mdsection") {
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
export function formatTaskLine(task: KNodeType, options: { detail?: boolean; showId?: boolean } = {}): string {
  const marker = task.item?.task?.marker ?? "[ ]"
  const status = task.item?.task?.status ?? "todo"

  // Color the checkbox based on status, using actual task marker
  const checkboxStr = marker
  const checkbox =
    status === "done"
      ? term.green(checkboxStr)
      : status === "wip"
        ? term.yellow(checkboxStr)
        : status === "blocked"
          ? term.red(checkboxStr)
          : term.dim(checkboxStr)

  const content = task.content ?? "(no content)"

  // Build line: checkbox, optional id, content
  let line = `${checkbox} `
  if (options.showId) {
    // Show last 8 chars of ID (the random part, not timestamp)
    const shortId = task.id.slice(-8)
    line += `${term.dim(shortId)}  `
  }
  line += content

  if (options.detail) {
    if (task.due_at) {
      line += term.cyan(` 📅 ${task.due_at}`)
    }
    if (task.priority) {
      line += ` ${task.priority}`
    }
    if (task.assigned_to) {
      line += term.magenta(` @${task.assigned_to}`)
    }
  }

  return line
}
