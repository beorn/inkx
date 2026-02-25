/**
 * Detail Pane Items — compute the flat list of navigable items for detail pane cursor.
 *
 * Separates display-only body blocks from navigable structural children and backlinks.
 * Used by both the action handlers (for cursor movement) and the DetailPane component
 * (for rendering with VirtualList).
 */

import type { KNode } from "@km/core"
import { isOutline, isItem } from "@km/core"
import { extractBody } from "@km/tree"
import type { Repo } from "../repo-context.tsx"

// =============================================================================
// Types
// =============================================================================

export interface DetailItem {
  kind: "structural" | "backlink"
  node: KNode
  /** Unique key for cursor matching. Backlinks use __backlink__ prefix to avoid collision. */
  nodeId: string
}

// =============================================================================
// Task/Note Detail Items
// =============================================================================

/**
 * Compute the flat list of navigable items for the detail pane.
 * Structural children come first, then backlinks (prefixed to avoid collision).
 *
 * Body blocks (paragraphs, code blocks, etc.) are display-only and excluded.
 * List items (li) with task markers are treated as structural.
 */
export function computeDetailItems(repo: Repo, node: KNode): DetailItem[] {
  const items: DetailItem[] = []
  const children = repo.getChildren(node.id)

  // Separate body blocks (display-only) from structural items (navigable)
  const { body: rawBody, items: oiItems } = extractBody(children)
  const liItems: KNode[] = []
  for (const child of rawBody) {
    if (isItem(child.type, child.item) && !isOutline(child.type, child.item)) {
      liItems.push(child)
    }
  }
  const structuralChildren = [...liItems, ...oiItems]

  // Structural items
  for (const child of structuralChildren) {
    items.push({ kind: "structural", node: child, nodeId: child.id })
  }

  // Backlinks (with prefix to avoid ID collision with structural children)
  const backlinks = repo.getBacklinks(node.id)
  const seenBacklinkIds = new Set<string>()
  for (const link of backlinks) {
    if (seenBacklinkIds.has(link.source_id)) continue
    seenBacklinkIds.add(link.source_id)
    const sourceNode = repo.getNode(link.source_id)
    if (sourceNode) {
      items.push({ kind: "backlink", node: sourceNode, nodeId: `__backlink__${sourceNode.id}` })
    }
  }

  return items
}

// =============================================================================
// Folder Detail Items
// =============================================================================

/**
 * For folders: all direct children are navigable.
 */
export function computeFolderDetailItems(repo: Repo, node: KNode): DetailItem[] {
  const items: DetailItem[] = []
  const children = repo.getChildren(node.id)
  for (const child of children) {
    items.push({ kind: "structural", node: child, nodeId: child.id })
  }
  return items
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get all navigable items for a detail pane node (auto-detects folder vs task).
 */
export function getDetailItemsForNode(repo: Repo, node: KNode): DetailItem[] {
  if (isOutline(node.type, node.item) && node.fstype === "folder") {
    return computeFolderDetailItems(repo, node)
  }
  return computeDetailItems(repo, node)
}
