/**
 * ViewNode Tree — Explicit visual tree derived from KNode data tree.
 *
 * Provides a single authoritative derivation of visual roles (board, column, card, subitem)
 * from tree position. Replaces multiple ad-hoc role derivations across the codebase.
 *
 * The tree mirrors what deriveColumnsFromRepo() produces, but as a recursive structure
 * with parent pointers, traversal utilities, and cursor path derivation.
 */

import { KNode, extractSlotTargets, findIndexFile, namesAreSimilar } from "@km/core"
import { extractBody } from "@km/tree"
import { parseHeadingRules } from "@km/markdown"
import type { SectionRules } from "@km/markdown"

// =============================================================================
// Types
// =============================================================================

export type ViewRole = "board" | "body-column" | "column" | "card" | "subitem"

export interface ViewNode {
  /** Same as the underlying KNode.id, or synthetic for virtual nodes */
  id: string
  /** Visual role determined by position in the tree */
  role: ViewRole
  /** The source KNode (null for virtual body column) */
  node: KNode | null
  /** Visual parent (correct for embeds — differs from data parent) */
  parent: ViewNode | null
  /** Visual children (embeds resolved, collapsed pruned, detail-only excluded) */
  children: ViewNode[]
  /** True if this is body content (non-outline before first heading) */
  isBody: boolean
  /** Pre-resolved embed target, if this node is an embed */
  resolvedEmbed?: KNode
  /** Section rules (WIP limit, color, collapse) */
  rules?: SectionRules
}

/** Minimal repo interface — only what buildViewTree needs */
export interface ViewTreeRepo {
  getNode(id: string): KNode | null
  getChildren(parentId: string | null): KNode[]
  getNodesBatch(ids: string[]): Map<string, KNode>
}

/**
 * Per-column ViewNode cache entry.
 * Keyed on column node ID; invalidated when the column's children array
 * reference changes (childrenCache returns a new array when busted).
 */
export interface ViewNodeCacheEntry {
  /** Reference identity check — childrenCache returns same array if not busted */
  childrenRef: KNode[]
  /** Cached ViewNode subtree for this column */
  node: ViewNode
}

/** Cache for per-column ViewNode subtrees. Pass to buildViewTree to enable caching. */
export type ViewNodeColumnCache = Map<string, ViewNodeCacheEntry>

// =============================================================================
// Constants — detail-only detection (mirrors use-columns.ts)
// =============================================================================

const COLLAPSED_SECTION_NAMES = new Set(["activity", "comments", "attachments"])

// =============================================================================
// Helpers — collapse/detail-only detection (mirrors use-columns.ts)
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

function getCollapseRules(node: KNode): { collapse?: boolean } {
  if (node.rules) return node.rules
  return parseHeadingRules(node.content || node.title || "").rules
}

function isCollapsedChild(node: KNode): boolean {
  if ((node.data as Record<string, unknown>)?.detailOnly === true) return true
  if (isWellKnownMetadataSection(node)) return true
  return getCollapseRules(node).collapse === true
}

function isDetailOnly(node: KNode): boolean {
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
// Deduplication (mirrors use-columns.ts)
// =============================================================================

function deduplicateByFsPath(nodes: KNode[], getChildCount: (id: string) => number): KNode[] {
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
// Virtual body node factory (mirrors use-columns.ts)
// =============================================================================

function createVirtualBodyNode(parentId: string | null): KNode {
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
// Core: buildViewTree
// =============================================================================

/**
 * Build an explicit visual tree from KNode data.
 *
 * Replicates what deriveColumnsFromRepo does, but as a recursive ViewNode tree.
 * The tree root has role "board", its children are columns (or body-column),
 * column children are cards, and card children are subitems.
 */
export function buildViewTree(
  repo: ViewTreeRepo,
  rootId: string | null,
  _foldDepths: Map<string, number>,
  cache?: ViewNodeColumnCache,
): ViewNode {
  const boardNode = rootId ? repo.getNode(rootId) : null

  const root: ViewNode = {
    id: rootId ?? "__root__",
    role: "board",
    node: boardNode,
    parent: null,
    children: [],
    isBody: false,
  }

  const allChildren = repo.getChildren(rootId)
  const { body: bodyNodes, items: columnNodes } = extractBody(allChildren)

  // --- Body column ---
  const filteredBody = bodyNodes.filter(
    (n) => !isCollapsedChild(n) && n.content != null && n.content.replace(/<[^>]+>/g, "").trim().length > 0,
  )

  if (filteredBody.length > 0) {
    const bodyCol: ViewNode = {
      id: `__body__${rootId ?? "root"}`,
      role: "body-column",
      node: createVirtualBodyNode(rootId),
      parent: root,
      children: [],
      isBody: false,
    }
    const bodyIdSet = new Set(filteredBody.filter((n) => !KNode.isEmbed(n)).map((n) => n.id))
    for (const bNode of filteredBody) {
      bodyCol.children.push(buildCardNode(repo, bNode, bodyCol, bodyIdSet))
    }
    root.children.push(bodyCol)
  }

  // --- Structural columns ---
  const deduped = deduplicateByFsPath(columnNodes, (id) => repo.getChildren(id).length)

  // Folder-index expansion
  const rootNode = rootId ? repo.getNode(rootId) : null
  const indexFile = rootNode?.fstype === "folder" ? findIndexFile(rootNode, deduped) : null

  if (indexFile) {
    expandIndexFileViewNodes(repo, indexFile, deduped, root, cache)
  } else {
    for (const node of deduped) {
      if (isDetailOnly(node)) continue
      root.children.push(buildColumnNodeCached(repo, node, root, cache))
    }
  }

  return root
}

// =============================================================================
// Cached column builder
// =============================================================================

/**
 * Build a column ViewNode, using the cache when available.
 * Cache key: column node ID. Invalidated when the column's children array
 * reference changes (the repo's childrenCache returns a new array on bust).
 */
function buildColumnNodeCached(
  repo: ViewTreeRepo,
  node: KNode,
  parent: ViewNode,
  cache?: ViewNodeColumnCache,
): ViewNode {
  if (cache) {
    const childrenRef = repo.getChildren(node.id)
    const entry = cache.get(node.id)

    if (entry && entry.childrenRef === childrenRef) {
      // Cache hit — reuse subtree, fix parent pointer to new root
      const cached = entry.node
      cached.parent = parent
      return cached
    }

    // Cache miss — build fresh, store in cache
    const col = buildColumnNode(repo, node, parent)
    cache.set(node.id, { childrenRef, node: col })
    return col
  }

  return buildColumnNode(repo, node, parent)
}

// =============================================================================
// Column builder
// =============================================================================

function buildColumnNode(repo: ViewTreeRepo, node: KNode, parent: ViewNode): ViewNode {
  const rules: SectionRules = node.rules ?? parseHeadingRules(node.content || node.title || "").rules

  const col: ViewNode = {
    id: node.id,
    role: "column",
    node,
    parent,
    children: [],
    isBody: false,
    rules,
  }

  // If collapsed (but not detail-only — those are excluded), children are empty
  if (getCollapseRules(node).collapse === true) {
    return col
  }

  // Split children into body + structural cards (like kNodeToColumnView)
  const allCardNodes = repo.getChildren(node.id)
  const folderIndex = node.fstype === "folder" ? findIndexFile(node, allCardNodes) : null
  const filteredCardNodes = folderIndex ? allCardNodes.filter((c) => c.id !== folderIndex.id) : allCardNodes
  const { body: bodyCards, items: structuralCards } = extractBody(filteredCardNodes)

  const bodyIdSet = new Set<string>()
  const rawCards: KNode[] = []

  for (const child of bodyCards) {
    if (isCollapsedChild(child)) continue
    rawCards.push(child)
    if (!KNode.isEmbed(child)) bodyIdSet.add(child.id)
  }
  for (const child of structuralCards) {
    if (isCollapsedChild(child)) continue
    rawCards.push(child)
  }

  for (const card of rawCards) {
    col.children.push(buildCardNode(repo, card, col, bodyIdSet))
  }

  return col
}

// =============================================================================
// Card + subitem builder
// =============================================================================

function buildCardNode(repo: ViewTreeRepo, node: KNode, parent: ViewNode, bodyIds: Set<string>): ViewNode {
  const isBody = bodyIds.has(node.id)
  const resolvedEmbed = node.embed_source ? (repo.getNode(node.embed_source) ?? undefined) : undefined

  const card: ViewNode = {
    id: node.id,
    role: "card",
    node,
    parent,
    children: [],
    isBody,
    resolvedEmbed,
  }

  // Card children come from resolved embed target or the card node itself
  const sourceId = resolvedEmbed?.id ?? node.id
  const cardChildren = repo.getChildren(sourceId)

  for (const child of cardChildren) {
    card.children.push(buildSubitemNode(repo, child, card))
  }

  return card
}

function buildSubitemNode(repo: ViewTreeRepo, node: KNode, parent: ViewNode): ViewNode {
  const resolvedEmbed = node.embed_source ? (repo.getNode(node.embed_source) ?? undefined) : undefined

  const sub: ViewNode = {
    id: node.id,
    role: "subitem",
    node,
    parent,
    children: [],
    isBody: false,
    resolvedEmbed,
  }

  const sourceId = resolvedEmbed?.id ?? node.id
  const subChildren = repo.getChildren(sourceId)

  for (const child of subChildren) {
    sub.children.push(buildSubitemNode(repo, child, sub))
  }

  return sub
}

// =============================================================================
// Folder-index expansion (mirrors expandIndexFileColumns in use-columns.ts)
// =============================================================================

function expandIndexFileViewNodes(
  repo: ViewTreeRepo,
  indexFile: KNode,
  deduped: KNode[],
  root: ViewNode,
  cache?: ViewNodeColumnCache,
): void {
  const indexChildren = repo.getChildren(indexFile.id)
  const { body: indexBody } = extractBody(indexChildren)

  // Identify slot children
  const slotChildIds = new Set<string>()
  for (const child of indexChildren) {
    const targets = extractSlotTargets([child])
    if (targets.length > 0) {
      const allResolved = targets.every((target) =>
        deduped.some((fc) => fc !== indexFile && namesAreSimilar(fc.name ?? "", target)),
      )
      if (allResolved) slotChildIds.add(child.id)
    }
  }

  const isBodyContent = (n: KNode) =>
    !slotChildIds.has(n.id) &&
    !isCollapsedChild(n) &&
    n.content != null &&
    n.content.replace(/<[^>]+>/g, "").trim().length > 0

  const filteredIndexBody = indexBody.filter(isBodyContent)
  const fallbackBody: KNode[] = []

  const bodyInsertIdx = root.children.length
  const referencedIds = new Set<string>()

  const resolveSlot = (target: string): boolean => {
    const child = deduped.find((n) => n !== indexFile && namesAreSimilar(n.name ?? "", target))
    if (child) {
      root.children.push(buildColumnNodeCached(repo, child, root, cache))
      referencedIds.add(child.id)
      return true
    }
    return false
  }

  for (const child of indexChildren) {
    const targets = extractSlotTargets([child])
    if (targets.length > 0) {
      const allResolved = targets.every((target) =>
        deduped.some((fc) => fc !== indexFile && namesAreSimilar(fc.name ?? "", target)),
      )
      if (allResolved) {
        for (const target of targets) resolveSlot(target)
        continue
      }
      if (!KNode.isOutline(child)) {
        if (!indexBody.includes(child) && isBodyContent(child)) fallbackBody.push(child)
        continue
      }
    }
    if (KNode.isOutline(child)) {
      if (!isDetailOnly(child)) {
        root.children.push(buildColumnNodeCached(repo, child, root, cache))
      }
    } else if (!indexBody.includes(child) && isBodyContent(child)) {
      fallbackBody.push(child)
    }
  }

  // Body column from index body + fallback
  const allBodyNodes = [...filteredIndexBody, ...fallbackBody]
  if (allBodyNodes.length > 0) {
    const bodyCol: ViewNode = {
      id: `__body__${indexFile.parent_id ?? "root"}`,
      role: "body-column",
      node: createVirtualBodyNode(indexFile.parent_id),
      parent: root,
      children: [],
      isBody: false,
    }
    const bodyIdSet = new Set(allBodyNodes.filter((n) => !KNode.isEmbed(n)).map((n) => n.id))
    for (const bNode of allBodyNodes) {
      bodyCol.children.push(buildCardNode(repo, bNode, bodyCol, bodyIdSet))
    }
    root.children.splice(bodyInsertIdx, 0, bodyCol)
  }

  // Unreferenced folder children
  for (const node of deduped) {
    if (node === indexFile || referencedIds.has(node.id)) continue
    if (isDetailOnly(node)) continue
    root.children.push(buildColumnNodeCached(repo, node, root, cache))
  }
}

// =============================================================================
// Utilities
// =============================================================================

/** O(1) node lookup by id */
export function buildViewIndex(tree: ViewNode): Map<string, ViewNode> {
  const index = new Map<string, ViewNode>()
  for (const node of dfsTraversal(tree)) {
    index.set(node.id, node)
  }
  return index
}

/** DFS traversal yielding navigable nodes in visual order */
export function* dfsTraversal(tree: ViewNode): Generator<ViewNode> {
  yield tree
  for (const child of tree.children) {
    yield* dfsTraversal(child)
  }
}

/** Derive cursor path from root to target node */
export function deriveCursorPath(index: Map<string, ViewNode>, nodeId: string): string[] {
  const target = index.get(nodeId)
  if (!target) return []

  const path: string[] = []
  let current: ViewNode | null = target
  while (current && current.role !== "board") {
    path.unshift(current.id)
    current = current.parent
  }
  return path
}

/** Lightweight column descriptor for backward compatibility with ColumnView */
export interface CompatColumnView {
  nodeId: string
  node: KNode
  isVirtual: boolean
  rules?: SectionRules
  cardIds: string[]
  cardCount: number
}

/** Convert ViewNode tree to CompatColumnView[] for backward compatibility */
export function toColumnViews(tree: ViewNode): CompatColumnView[] {
  return tree.children.map((col) => {
    const isVirtual = col.role === "body-column"
    return {
      nodeId: col.id,
      node: col.node!,
      isVirtual,
      rules: col.rules,
      cardIds: col.children.map((card) => card.id),
      cardCount: col.children.length,
    }
  })
}
