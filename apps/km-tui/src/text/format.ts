/**
 * Node Formatting (Layer 1 - Shared)
 *
 * Format nodes for display in CLI commands and TUI components.
 * Extracted from list.ts and show.ts for reuse.
 *
 * Uses theme tokens via themeFg() for semantic coloring:
 * - $disabled-fg for dimmed chrome (suffixes, markers)
 * - $link for navigation elements (folders, files)
 * - $primary for headings and section names
 * - $success/$warning/$error for task status
 */

import { createTerm, type StyleChain } from "@silvery/react"
import { getStatusForMarker, isOutline, type KNode } from "@km/core"
import { getNodeDisplayName as getNodeDisplayNameBase, type CollapsedAncestor } from "@km/tree"
import type { Repo } from "../repo-context.tsx"
import { themeFg } from "./colors.ts"

/**
 * Compute section depth from tree nesting.
 * Direct children of a file node are H2 (depth 2). Each additional
 * mdsection ancestor adds 1 to the depth.
 */
function computeSectionDepth(node: KNode, getNode: (id: string) => KNode | null | undefined): number {
  let depth = 2 // Direct file children are H2
  let current = node.parent_id ? getNode(node.parent_id) : undefined
  while (isOutline(current?.type ?? "", current?.item) && current?.fstype === "mdsection") {
    depth++
    current = current.parent_id ? getNode(current.parent_id) : undefined
  }
  return depth
}

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
    return prefix + name + themeFg(` ${ca.typeSuffix}`, "$disabled-fg")
  }
  // No collapsed suffix - show individual type indicator based on fstype
  if (isOutline(ca.node.type, ca.node.item)) {
    switch (ca.node.fstype) {
      case "folder":
        return prefix + name + themeFg("/", "$disabled-fg")
      case "file":
      case "mdfile":
        return prefix + (name.endsWith(".md") ? name : name + themeFg(".md", "$disabled-fg"))
      case "mdsection": {
        const depth = computeSectionDepth(ca.node, (id) => repo.getNode(id))
        return prefix + themeFg("#".repeat(depth) + " ", "$disabled-fg") + name
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
  if (isOutline(node.type, node.item)) {
    switch (node.fstype) {
      case "folder":
        return prefix + themeFg(name, "$link") + themeFg("/", "$disabled-fg")
      case "file":
      case "mdfile":
        return prefix + themeFg(name, "$link")
      case "mdsection": {
        const depth = computeSectionDepth(node, (id) => repo.getNode(id))
        return prefix + themeFg("#".repeat(depth) + " ", "$disabled-fg") + themeFg(name, "$primary")
      }
      default:
        return prefix + themeFg(name, "$primary")
    }
  }

  // Handle tasks (items with task_marker)
  if (node.task_marker != null) {
    const marker = node.task_marker
    // Extract inner character from bracket marker: "[x]" → "x"
    const inner = marker.length === 3 ? (marker[1] ?? marker) : marker
    const status = getStatusForMarker(marker) ?? "todo"
    // Only color the marker character, not the brackets
    const coloredMark =
      status === "done"
        ? themeFg(inner, "$success")
        : status === "wip"
          ? themeFg(inner, "$warning")
          : status === "blocked"
            ? themeFg(inner, "$error")
            : style.dim(inner)
    const checkbox = style.dim("[") + coloredMark + style.dim("]")
    return prefix + checkbox + " " + oneLine(node.content ?? "(no content)")
  }

  switch (node.type) {
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
  switch (status) {
    case "done":
      return themeFg(status, "$success")
    case "wip":
      return themeFg(status, "$link")
    case "blocked":
      return themeFg(status, "$error")
    case "waiting":
      return themeFg(status, "$warning")
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
  parts.push(themeFg(node.type, "$link"))

  if (node.content) {
    parts.push(node.content.slice(0, 50))
  }

  return parts.join("  ")
}
