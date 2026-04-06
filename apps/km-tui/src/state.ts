/**
 * Board State Management
 *
 * Pure functions for managing board state - fully testable
 */

import { KNode, findIndexFile } from "@km/core"

/** Progress yield type for step generators */
type StepYield = string | { current?: number; total?: number }
import type { InitialBoardData } from "./types.ts"
import type { ColumnView } from "./hooks/use-columns.ts"
import { deduplicateByFsPath, isCollapsedChild } from "@km/board"
import { parseHeadingRules } from "@km/markdown"
import type { Repo } from "./repo-context.tsx"
import {
  getNodeDisplayName as getNodeDisplayNameBase,
  isNodeUntitled as isNodeUntitledBase,
  getCollapsedTypeSuffix as getCollapsedTypeSuffixBase,
  getParentContext as getParentContextBase,
  getParentContextEx as getParentContextExBase,
  extractBody,
} from "@km/tree"

/**
 * Build cards for a column from its body and structural children.
 * Each body node is its own navigable card (body for styling).
 * Structural (oi) nodes are regular cards.
 *
 * Build card list from body + structural nodes.
 * Returns plain KNode[] — CardView enrichment no longer needed (useNode provides view data).
 */
function buildColumnCards(bodyNodes: KNode[], structuralNodes: KNode[]): KNode[] {
  const cards: KNode[] = [...bodyNodes]
  for (const node of structuralNodes) {
    if (isCollapsedChild(node)) continue
    cards.push(node)
  }
  return cards
}

// Note: Card position tracking is now handled via LayoutContext in board-actions.ts

/** Compute a short badge label: "filename.md (fstype)" or "shortId (type)" */
export function nodeBadgeLabel(node: { fs_path?: string; fstype?: string; type?: string; id: string }): string {
  const basename = node.fs_path?.split("/").pop()
  const fstype = node.fstype ?? node.type
  return basename ? `${basename} (${fstype})` : `${node.id.slice(-8)} (${fstype})`
}

// Bound versions that inject repo dependencies
// These are the primary exports for TUI components
export const getNodeDisplayName = (repo: Repo, node: Parameters<typeof getNodeDisplayNameBase>[0]) =>
  getNodeDisplayNameBase(node, (id) => repo.getChildren(id))
export const isNodeUntitled = (repo: Repo, node: Parameters<typeof isNodeUntitledBase>[0]) =>
  isNodeUntitledBase(node, (id) => repo.getChildren(id))
export const getCollapsedTypeSuffix = (repo: Repo, node: Parameters<typeof getCollapsedTypeSuffixBase>[0]) =>
  getCollapsedTypeSuffixBase(node, (id) => repo.getChildren(id))
export const getParentContext = (
  repo: Repo,
  node: Parameters<typeof getParentContextBase>[0],
  skipParentId?: string | null,
) => getParentContextBase(node, skipParentId, (id) => repo.getNode(id))
export const getParentContextEx = (
  repo: Repo,
  node: Parameters<typeof getParentContextExBase>[0],
  skipParentId?: string | null,
) => getParentContextExBase(node, skipParentId, (id) => repo.getNode(id))

/**
 * Create an empty board data result.
 */
export function createEmptyState(): InitialBoardData {
  return {
    rootId: null,
    rootPath: null,
    columns: [],
    collapsedColumns: new Set(),
    collapsedNodeIds: new Set(),
  }
}

/**
 * Initialize board state from a root node ID, path, or filename
 * Returns null if no suitable board found
 */
export function initBoardState(repo: Repo, rootId?: string): InitialBoardData | null {
  // rootId is required - no longer support root-level view
  // Callers should resolve repo root folder node if needed
  if (!rootId) {
    return null
  }

  // Use repo.getNode for ID lookup (caller should resolve path/filename before calling)
  const root = repo.getNode(rootId)
  if (!root) {
    return null
  }
  return buildBoardState(repo, root.id)
}

/**
 * Generator version of initBoardState that yields progress
 * Use this for loading screens to allow event loop updates between yields
 */
export function* initBoardStateGenerator(
  repo: Repo,
  rootId?: string,
): Generator<StepYield, InitialBoardData | null, unknown> {
  // rootId is required - no longer support root-level view
  // Callers should resolve repo root folder node if needed
  if (!rootId) {
    return null
  }

  // Use repo.getNode for ID lookup (caller should resolve path/filename before calling)
  const root = repo.getNode(rootId)
  if (!root) {
    return null
  }
  // Delegate to generator version of buildBoardState
  return yield* buildBoardStateGenerator(repo, root.id)
}

/**
 * Generator version of buildBoardState that yields progress.
 *
 * INITIAL-LOAD column derivation path. This is NOT the canonical runtime path —
 * that is deriveColumnsFromRepo() in hooks/use-columns.ts. This path exists for:
 * - Fast startup with progress yielding (loading screen)
 * - Collecting collapsedColumns/collapsedNodeIds for initial board state
 * - Simplified card list (plain KNode[], no embed resolution)
 *
 * Differences from deriveColumnsFromRepo:
 * - No folder-index file expansion (index files handled at column level only)
 * - No embed resolution (useNode handles this at render time)
 * - No per-column memoization cache
 * - WIP limits extracted from root node frontmatter (not column nodes)
 * - Yields progress between columns for loading UI
 *
 * Structural equivalence with deriveColumnsFromRepo is tested in
 * board-zoom.slow.spec.ts ("Zoom View Diff" describe block).
 */
// oxlint-disable-next-line complexity/complexity -- Async generator with batched queries
export function* buildBoardStateGenerator(repo: Repo, rootId: string): Generator<StepYield, InitialBoardData, unknown> {
  const rootNode = repo.getNode(rootId)
  const wipLimits = extractWipLimits(rootNode)
  const collapsedColumns = new Set<number>()
  const collapsedNodeIds = new Set<string>()

  // Get direct children and split into body content vs structural items
  const allChildren = repo.getChildren(rootId)
  const { body: bodyNodes, items: rawColumnNodes } = extractBody(allChildren)

  // Deduplicate column nodes by fs_path (import bugs can create duplicate file entries).
  // Uses batch child counts to keep the node with more children.
  const allColumnIds = rawColumnNodes.map((n) => n.id)
  const allColumnChildCounts = repo.getChildCounts(allColumnIds)
  const columnNodes = deduplicateByFsPath(rawColumnNodes, (id) => allColumnChildCounts.get(id) ?? 0)

  const total = columnNodes.length + (bodyNodes.length > 0 ? 1 : 0)
  yield "Building view"
  yield { current: 0, total }

  // Batch query child counts for all columns
  const columnIds = columnNodes.map((n) => n.id)
  const columnChildCounts = repo.getChildCounts(columnIds)

  // First pass: collect card nodes per column
  const columnCardNodes: KNode[][] = []

  // Filter out body nodes with empty/whitespace-only content (e.g., HTML anchor tags)
  const meaningfulBody = bodyNodes.filter((n) => n.content && n.content.replace(/<[^>]+>/g, "").trim().length > 0)

  for (let colIdx = 0; colIdx < columnNodes.length; colIdx++) {
    const colNode = columnNodes[colIdx]
    if (!colNode) continue

    const colChildCount = columnChildCounts.get(colNode.id) ?? 0
    if (colChildCount === 0) {
      columnCardNodes[colIdx] = []
      continue
    }

    const allCardNodes = repo.getChildren(colNode.id)
    // Filter out folder index files — they are absorbed into the folder's column
    // and must not appear as navigable cards (mirrors kNodeToColumnView filtering)
    const folderIndex = colNode.fstype === "folder" ? findIndexFile(colNode, allCardNodes) : null
    const cardNodes = folderIndex ? allCardNodes.filter((c) => c.id !== folderIndex.id) : allCardNodes
    columnCardNodes[colIdx] = cardNodes

    // Yield progress after each column
    yield { current: colIdx + 1, total }
  }

  // Second pass: build columns
  const columns: ColumnView[] = []

  // Add virtual body column if there's meaningful leading content
  // Filter out nodes with empty/whitespace-only content (e.g., HTML anchor tags)
  if (meaningfulBody.length > 0) {
    columns.push({
      node: createVirtualBodyNode(rootId),
      cardNodes: meaningfulBody.map((n) => ({
        ...n,
        __cardView: true as const,
        isBody: !KNode.isEmbed(n),
        isBrokenEmbed: false,
        hasBodyChildren: false,
      })),
      isVirtual: true,
    })
  }

  for (let colIdx = 0; colIdx < columnNodes.length; colIdx++) {
    const colNode = columnNodes[colIdx]
    if (!colNode) continue

    const cardNodes = columnCardNodes[colIdx] ?? []
    const rules = colNode.rules ?? parseHeadingRules(colNode.content || "").rules

    // Skip hidden columns entirely
    if (rules.hidden) continue

    // Split into body content (before first oi) and structural cards.
    // All body nodes merge into one virtual card; structural nodes are regular cards.
    const { body: colBodyNodes, items: structuralCards } = extractBody(cardNodes)

    const colCardNodes = buildColumnCards(colBodyNodes, structuralCards)

    const colName = getNodeDisplayName(repo, colNode)
    const normalizedName = normalizeColumnName(colName)
    const wipLimit = rules.limit ?? wipLimits.get(normalizedName)

    // Track collapsed columns (offset by body column if present)
    const actualColIdx = colIdx + (bodyNodes.length > 0 ? 1 : 0)
    const isCollapsed = rules.collapse || colNode.data?.collapsed === true
    if (isCollapsed) {
      collapsedColumns.add(actualColIdx)
      collapsedNodeIds.add(colNode.id)
    }

    columns.push({ node: colNode, cardNodes: colCardNodes, wipLimit, rules })
  }

  return {
    rootId,
    rootPath: null,
    columns,
    collapsedColumns,
    collapsedNodeIds,
  }
}

/**
 * Create a virtual node for the body column.
 * This node represents leading non-section content grouped for display.
 */
function createVirtualBodyNode(parentId: string): KNode {
  const now = Date.now()
  return {
    id: `__body__${parentId}`,
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

/**
 * Extract WIP limits from frontmatter columns config
 * Frontmatter format: columns: { column_name: { limit: number } }
 */
function extractWipLimits(rootNode: KNode | null): Map<string, number> {
  const limits = new Map<string, number>()
  if (!rootNode?.data?.columns) return limits

  const columnsConfig = rootNode.data.columns
  if (typeof columnsConfig !== "object" || columnsConfig === null) return limits
  for (const [colName, config] of Object.entries(columnsConfig as Record<string, { limit?: number }>)) {
    if (typeof config?.limit === "number" && config.limit > 0) {
      // Normalize column name: lowercase, replace spaces with underscores
      const normalizedName = colName.toLowerCase().replace(/\s+/g, "_")
      limits.set(normalizedName, config.limit)
    }
  }
  return limits
}

/**
 * Normalize column name for WIP limit lookup
 * Matches frontmatter keys like "in_progress" to column names like "In Progress"
 */
function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "_")
}

/**
 * Build board state from a specific root ID (synchronous).
 * Delegates to the generator version, exhausting all yields.
 *
 * Used for initial board setup (driver.ts, test helpers). For runtime column
 * derivation after the board is live, use deriveColumnsFromRepo() instead.
 */
export function buildBoardState(repo: Repo, rootId: string): InitialBoardData {
  const gen = buildBoardStateGenerator(repo, rootId)
  let result = gen.next()
  while (!result.done) result = gen.next()
  return result.value
}
