/**
 * Node Formatting (Layer 1 - Shared)
 *
 * Format nodes for display in CLI commands and TUI components.
 * Extracted from list.ts and show.ts for reuse.
 */

import { createTerm, type StyleChain } from "inkx"
import type { KNode } from "@km/core"
import {
  getNodeDisplayName as getNodeDisplayNameBase,
  type CollapsedAncestor,
} from "@km/tree"
import type { Repo } from "../repo-context.tsx"

// Module-level term instance for styling (lazily initialized)
// Uses environment detection (respects NO_COLOR, FORCE_COLOR, etc.)
let _term: ReturnType<typeof createTerm> | null = null
function getStyle(): StyleChain {
  if (!_term) {
    _term = createTerm()
  }
  return _term
}

/**
 * Format a collapsed ancestor for display with its type suffix.
 * Used in tree/context displays.
 */
export function formatCollapsedAncestor(
  repo: Repo,
  ca: CollapsedAncestor,
  showId: boolean,
): string {
  const style = getStyle()
  let prefix = ""
  if (showId) {
    prefix = style.dim(`[${ca.node.id.slice(0, 5)}] `)
  }

  const name = getNodeDisplayNameBase(ca.node, (id) => repo.getChildren(id))
  if (ca.typeSuffix) {
    return prefix + name + style.gray(` ${ca.typeSuffix}`)
  }
  // No collapsed suffix - show individual type indicator
  if (ca.node.type === "folder") {
    return prefix + name + style.gray("/")
  } else if (ca.node.type === "file") {
    // Only add .md if name doesn't already end with it
    return prefix + (name.endsWith(".md") ? name : name + style.gray(".md"))
  } else if (ca.node.type === "section") {
    const depth = (ca.node.data?.depth as number) ?? 1
    return prefix + style.gray("#".repeat(depth) + " ") + name
  }
  return prefix + name
}

/**
 * Format a node for display in listings.
 */
export function formatNode(repo: Repo, node: KNode, showId: boolean): string {
  const style = getStyle()
  let prefix = ""
  if (showId) {
    prefix = style.dim(`[${node.id.slice(0, 5)}] `)
  }

  const name = getNodeDisplayNameBase(node, (id) => repo.getChildren(id))

  switch (node.type) {
    case "folder":
      return prefix + style.blue(name) + style.gray("/")
    case "file":
      return prefix + style.cyan(name)
    case "section": {
      const depth = (node.data?.depth as number) ?? 1
      return prefix + style.gray("#".repeat(depth) + " ") + style.yellow(name)
    }
    case "task": {
      const mark = node.task_mark ?? " "
      const status = node.task_status ?? "todo"
      // Only color the marker character, not the brackets
      const coloredMark =
        status === "done"
          ? style.green(mark)
          : status === "wip"
            ? style.yellow(mark)
            : status === "blocked"
              ? style.red(mark)
              : style.dim(mark)
      const checkbox = style.dim("[") + coloredMark + style.dim("]")
      return prefix + checkbox + " " + (node.content ?? "(no content)")
    }
    case "paragraph":
      return prefix + style.dim("¶ ") + (node.content?.slice(0, 50) ?? "")
    default:
      return (
        prefix + style.dim("• ") + (node.content?.slice(0, 50) ?? node.type)
      )
  }
}

/**
 * Format task status with color.
 */
export function formatStatus(status: string): string {
  const style = getStyle()
  switch (status) {
    case "done":
      return style.green(status)
    case "wip":
      return style.blue(status)
    case "blocked":
      return style.red(status)
    case "waiting":
      return style.yellow(status)
    default:
      return status
  }
}

/**
 * Format a node briefly (for tree/children displays).
 */
export function formatNodeBrief(node: KNode): string {
  const style = getStyle()
  const parts: string[] = []

  parts.push(style.dim(node.id.slice(0, 8)))
  parts.push(style.cyan(node.type))

  if (node.content) {
    parts.push(node.content.slice(0, 50))
  }

  return parts.join("  ")
}
