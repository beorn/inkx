/**
 * Detail Pane Items — compute the flat list of navigable items for detail pane cursor.
 *
 * Separates display-only body blocks from navigable structural children and backlinks.
 * Used by both the action handlers (for cursor movement) and the DetailPane component
 * (for rendering with VirtualList).
 *
 * Navigation order: topbar → metadata rows → structural children → backlinks.
 * The topbar represents the item itself. Metadata rows let users navigate properties.
 */

import type { KNode } from "@km/core"
import { isOutline, isItem, decomposeDatetime } from "@km/core"
import { extractBody } from "@km/tree"
import type { Repo } from "../repo-context.tsx"

// =============================================================================
// Types
// =============================================================================

export type DetailItemKind = "topbar" | "meta" | "structural" | "backlink"

export interface DetailItem {
  kind: DetailItemKind
  node: KNode
  /** Unique key for cursor matching. Topbar uses __topbar__, meta uses __meta__<key>. */
  nodeId: string
  /** For meta items: the metadata key (e.g., "Status", "Priority"). */
  metaKey?: string
}

/** Well-known topbar cursor ID */
export const DETAIL_TOPBAR_ID = "__topbar__"

/** Prefix for metadata cursor IDs */
export const DETAIL_META_PREFIX = "__meta__"

// =============================================================================
// Task/Note Detail Items
// =============================================================================

/**
 * Compute metadata keys present on a node.
 * Returns the list of navigable metadata row keys in display order.
 */
export function computeMetadataKeys(node: KNode): string[] {
  const keys: string[] = []
  if (node.task_status) keys.push("Status")
  if (node.priority) keys.push("Priority")
  const dueParts = decomposeDatetime(node.due_at)
  if (dueParts?.date) keys.push("Due")
  const startParts = decomposeDatetime(node.start_at)
  if (startParts?.date) keys.push("Start")
  if (node.rrule) keys.push("Recurrence")
  const data = node.data as Record<string, unknown> | undefined
  const metadata = (data?.metadata ?? {}) as Record<string, unknown>
  if (metadata.created) keys.push("Created")
  if (metadata.completed) keys.push("Completed")
  if (node.assigned_to) keys.push("Assigned")
  // Projects, tags, mentions — check for presence
  const projectMemberships = data?.projectMemberships as Array<{ project: string }> | undefined
  if (projectMemberships && projectMemberships.length > 0) keys.push("Projects")
  if (node.assigned_to || node.task_status) {
    // Tags/mentions are extracted from content — just check if data has them
    const dataRefs = data as { mentions?: string[]; tags?: string[] } | undefined
    if (dataRefs?.tags && dataRefs.tags.length > 0) keys.push("Tags")
    if (dataRefs?.mentions && dataRefs.mentions.length > 0) keys.push("Mentions")
  }
  return keys
}

/**
 * Compute the flat list of navigable items for the detail pane.
 * Order: topbar → metadata rows → structural children → backlinks.
 *
 * Body blocks (paragraphs, code blocks, etc.) are display-only and excluded.
 * List items (li) with task markers are treated as structural.
 */
export function computeDetailItems(repo: Repo, node: KNode): DetailItem[] {
  const items: DetailItem[] = []

  // Topbar — the item itself
  items.push({ kind: "topbar", node, nodeId: DETAIL_TOPBAR_ID })

  // Metadata rows
  const metaKeys = computeMetadataKeys(node)
  for (const key of metaKeys) {
    items.push({ kind: "meta", node, nodeId: `${DETAIL_META_PREFIX}${key}`, metaKey: key })
  }

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
 * For folders: topbar + all direct children are navigable.
 */
export function computeFolderDetailItems(repo: Repo, node: KNode): DetailItem[] {
  const items: DetailItem[] = []

  // Topbar — the folder itself
  items.push({ kind: "topbar", node, nodeId: DETAIL_TOPBAR_ID })

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
