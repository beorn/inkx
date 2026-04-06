/**
 * View Lens Helpers — pure helpers shared by view-lens.ts and consumers.
 *
 * These helpers used to live in view-tree.ts (before the lens migration).
 * They are the canonical source for:
 *   - isCollapsedChild / isDetailOnly — which nodes are hidden from card view
 *   - deduplicateByFsPath — remove duplicate file entries by fs_path
 *   - extractWipLimits — read column WIP limits from frontmatter
 *   - createVirtualBodyNode — synthesize the virtual body column KNode
 *   - CARD_REMAINING_DEPTH — default recursion depth for card sub-items
 */

import { KNode } from "@km/core"
import { parseHeadingRules } from "@km/markdown"

// =============================================================================
// Constants — collapsed/detail-only detection (canonical source)
// =============================================================================

const COLLAPSED_SECTION_NAMES = new Set(["activity", "comments", "attachments"])

/** Default remaining depth for card sub-items.
 *  CardColumn passes this as `remainingDepth` to TreeNode.
 *  At this depth, children are rendered as full TreeNodes; beyond it, as FoldedChildRow. */
export const CARD_REMAINING_DEPTH = 2

// =============================================================================
// Helpers — collapse/detail-only detection (canonical source)
// =============================================================================

function isWellKnownMetadataSection(node: KNode): boolean {
  const nameLC = node.name?.toLowerCase()
  if (nameLC && COLLAPSED_SECTION_NAMES.has(nameLC)) return true
  const titleLC = node.title?.toLowerCase()
  if (titleLC && COLLAPSED_SECTION_NAMES.has(titleLC)) return true
  const contentLC = node.content
    ?.toLowerCase()
    .replace(/\s*km\.\w+::\s*\S*/g, "")
    .trim()
  if (contentLC && COLLAPSED_SECTION_NAMES.has(contentLC)) return true
  return false
}

export function getCollapseRules(node: KNode): { collapse?: boolean } {
  if (node.rules) return node.rules
  return parseHeadingRules(node.content || node.title || "").rules
}

/** Nodes with km.collapse:: true, detailOnly flag, or well-known metadata section names
 *  are shown only in the detail pane, never as cards in columns. */
export function isCollapsedChild(node: KNode): boolean {
  if ((node.data as Record<string, unknown>)?.detailOnly === true) return true
  if (isWellKnownMetadataSection(node)) return true
  return getCollapseRules(node).collapse === true
}

/** Like isCollapsedChild but only returns true for detail-only nodes
 *  (detailOnly flag, well-known Asana metadata sections like Activity/Comments/Attachments).
 *  Does NOT match nodes that only have km.collapse:: true — those should render
 *  as narrow collapsed columns, not be hidden entirely. */
export function isDetailOnly(node: KNode): boolean {
  if ((node.data as Record<string, unknown>)?.detailOnly === true) return true
  if (isWellKnownMetadataSection(node)) return true
  const rules = getCollapseRules(node)
  if (rules.collapse === true) {
    const rawName = (node.name || node.title || node.content || "")
      .toLowerCase()
      .replace(/\s*km\.\w+::\s*\S*/g, "")
      .trim()
    if (COLLAPSED_SECTION_NAMES.has(rawName)) return true
  }
  return false
}

// =============================================================================
// Deduplication (canonical source)
// =============================================================================

/**
 * Deduplicate column nodes that share the same fs_path.
 * Import bugs can create duplicate file entries in the DB.
 * Keeps the node with more children; if tied, keeps the first occurrence.
 */
export function deduplicateByFsPath(nodes: KNode[], getChildCount: (id: string) => number): KNode[] {
  const seen = new Map<string, { node: KNode; childCount: number }>()
  const result: KNode[] = []

  for (const node of nodes) {
    const path = node.fs_path
    if (!path) {
      result.push(node)
      continue
    }
    const childCount = getChildCount(node.id)
    const existing = seen.get(path)
    if (!existing) {
      seen.set(path, { node, childCount })
      result.push(node)
    } else if (childCount > existing.childCount) {
      const idx = result.indexOf(existing.node)
      if (idx >= 0) result[idx] = node
      seen.set(path, { node, childCount })
    }
  }
  return result
}

// =============================================================================
// Virtual body node factory
// =============================================================================

export function createVirtualBodyNode(parentId: string | null): KNode {
  const now = Date.now()
  return {
    id: `__body__${parentId ?? "root"}`,
    type: "h",
    item: {},
    fstype: "mdsection",
    parent_id: parentId,
    parent_idx: 0,
    title: "Description",
    content: "",
    data: {},
    created_at: now,
    updated_at: now,
    version: "",
  }
}

// =============================================================================
// WIP Limits
// =============================================================================

/**
 * Extract WIP limits from column nodes' frontmatter.
 * Looks at each node's data.columns config for { column_name: { limit: number } }.
 */
export function extractWipLimits(nodes: KNode[]): Map<string, number> {
  const limits = new Map<string, number>()

  for (const node of nodes) {
    const columnsConfig = (node.data as { columns?: Record<string, { limit?: number }> })?.columns
    if (!columnsConfig) continue

    for (const [colName, config] of Object.entries(columnsConfig)) {
      if (typeof config?.limit === "number" && config.limit > 0) {
        const normalizedName = colName.toLowerCase().replace(/\s+/g, "_")
        limits.set(normalizedName, config.limit)
      }
    }
  }

  return limits
}
