/**
 * Node Formatting (Layer 1 - Shared)
 *
 * Format nodes for display in CLI commands and TUI components.
 * Extracted from list.ts and show.ts for reuse.
 */

import { createTerm, type StyleChain } from "inkx"
import { getStatusForMarker, type KNode } from "@km/core"
import { getNodeDisplayName as getNodeDisplayNameBase, type CollapsedAncestor } from "@km/tree"
import type { Repo } from "../repo-context.tsx"

/**
 * Create a term instance with environment detection.
 * Called per-invocation to avoid module-level mutable state.
 */
function createTermStyle(): StyleChain {
  return createTerm()
}

/** Collapse content to a single line, truncated. */
function oneLine(text: string, max = 80): string {
  const collapsed = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim()
  return collapsed.length > max ? collapsed.slice(0, max) + "…" : collapsed
}

/**
 * Format a collapsed ancestor for display with its type suffix.
 * Used in tree/context displays.
 */
export function formatCollapsedAncestor(repo: Repo, ca: CollapsedAncestor, showId: boolean): string {
  const style = createTermStyle()
  let prefix = ""
  if (showId) {
    prefix = style.dim(`[${ca.node.id.slice(0, 5)}] `)
  }

  const name = getNodeDisplayNameBase(ca.node, (id) => repo.getChildren(id))
  if (ca.typeSuffix) {
    return prefix + name + style.gray(` ${ca.typeSuffix}`)
  }
  // No collapsed suffix - show individual type indicator based on fstype
  if (ca.node.type === "oi") {
    switch (ca.node.fstype) {
      case "folder":
        return prefix + name + style.gray("/")
      case "file":
      case "mdfile":
        return prefix + (name.endsWith(".md") ? name : name + style.gray(".md"))
      case "mdsection": {
        const depth = (ca.node.data?.depth as number) ?? 1
        return prefix + style.gray("#".repeat(depth) + " ") + name
      }
    }
  }
  return prefix + name
}

/**
 * Format a node for display in listings.
 */
export function formatNode(repo: Repo, node: KNode, showId: boolean): string {
  const style = createTermStyle()
  let prefix = ""
  if (showId) {
    prefix = style.dim(`[${node.id.slice(0, 5)}] `)
  }

  const name = getNodeDisplayNameBase(node, (id) => repo.getChildren(id))

  // Handle outline items by fstype
  if (node.type === "oi") {
    switch (node.fstype) {
      case "folder":
        return prefix + style.blue(name) + style.gray("/")
      case "file":
      case "mdfile":
        return prefix + style.cyan(name)
      case "mdsection": {
        const depth = (node.data?.depth as number) ?? 1
        return prefix + style.gray("#".repeat(depth) + " ") + style.yellow(name)
      }
      default:
        return prefix + style.yellow(name)
    }
  }

  // Handle tasks (li with task_marker)
  if (node.task_marker != null) {
    const marker = node.task_marker
    // Extract inner character from bracket marker: "[x]" → "x"
    const inner = marker.length === 3 ? marker[1]! : marker
    const status = getStatusForMarker(marker) ?? "todo"
    // Only color the marker character, not the brackets
    const coloredMark =
      status === "done"
        ? style.green(inner)
        : status === "wip"
          ? style.yellow(inner)
          : status === "blocked"
            ? style.red(inner)
            : style.dim(inner)
    const checkbox = style.dim("[") + coloredMark + style.dim("]")
    return prefix + checkbox + " " + oneLine(node.content ?? "(no content)")
  }

  switch (node.type) {
    case "h": {
      const depth = (node.data?.depth as number) ?? 1
      return prefix + style.dim("#".repeat(depth) + " ") + oneLine(node.content ?? "")
    }
    case "p":
      return prefix + style.dim("¶ ") + oneLine(node.content ?? "")
    case "hr":
      return prefix + style.dim("---")
    case "code":
      return prefix + style.dim("``` ") + oneLine(node.content ?? "")
    case "quote":
      return prefix + style.dim("> ") + oneLine(node.content ?? "")
    case "table":
      return prefix + style.dim("| ") + oneLine(node.content ?? "table")
    default:
      return prefix + style.dim("• ") + oneLine(node.content ?? node.type)
  }
}

/**
 * Format task status with color.
 */
export function formatStatus(status: string): string {
  const style = createTermStyle()
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
  const style = createTermStyle()
  const parts: string[] = []

  parts.push(style.dim(node.id.slice(0, 8)))
  parts.push(style.cyan(node.type))

  if (node.content) {
    parts.push(node.content.slice(0, 50))
  }

  return parts.join("  ")
}
