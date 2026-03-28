/**
 * useColumns Hook — VIEW MODEL DERIVATION
 *
 * Derives ColumnView[] from Repo. This is the main view model construction point:
 * it reads data model (KNode tree via Repo) and produces view model (ColumnView with KNode cards).
 *
 * Structure:
 * 1. useColumns() — React hook with repo subscription
 * 2. deriveColumnsFromRepo() — Pure function: repo → ColumnView[]
 * 3. buildNodeIndex() — O(1) cursor position lookup map
 * 4. deriveCursorIndices() — Derives colIndex/cardIndex from cursorNodeId
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"
import { isOutline, isEmbed } from "@km/core"
import { createLogger } from "loggily"
import { extractBody, extractSlotTargets, findIndexFile, namesAreSimilar } from "@km/tree"
import type { ColumnView } from "../types.ts"
import type { SectionRules } from "@km/markdown"
import { parseHeadingRules } from "@km/markdown"
import { computeMetadataKeys, DETAIL_META_PREFIX } from "../views/detail-pane-items.ts"

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loggily types don't fully resolve via tsc bundler mode
const log = createLogger("km:tui:columns") as any

// =============================================================================
// Helpers — collapsed node filtering
// =============================================================================

/** Nodes with km.collapse:: true (e.g., imported comments/attachments/activity) are
 *  shown only in the detail pane, never as cards in columns.
 *  Also supports legacy detailOnly data flag and well-known Asana metadata sections. */
const COLLAPSED_SECTION_NAMES = new Set(["activity", "comments", "attachments"])

/** Check if any of a node's identifying fields (name, title, content) match a well-known
 *  metadata section name (case-insensitive). Content is stripped of km.* rules first. */
function isWellKnownMetadataSection(node: KNode): boolean {
  const nameLC = node.name?.toLowerCase()
  if (nameLC && COLLAPSED_SECTION_NAMES.has(nameLC)) return true
  const titleLC = node.title?.toLowerCase()
  if (titleLC && COLLAPSED_SECTION_NAMES.has(titleLC)) return true
  // Check content with km.* rules stripped (Asana imports have content like "Attachments km.collapse:: true")
  const contentLC = node.content
    ?.toLowerCase()
    .replace(/\s*km\.\w+::\s*\S*/g, "")
    .trim()
  if (contentLC && COLLAPSED_SECTION_NAMES.has(contentLC)) return true
  return false
}

/** Parse collapse rules from a node, preferring pre-parsed rules, then content (which
 *  may contain unparsed km.collapse:: true from imports), then title as fallback. */
function getCollapseRules(node: KNode): { collapse?: boolean } {
  if (node.rules) return node.rules
  // Prefer content over title: content may contain unparsed "km.collapse:: true"
  // while title is the clean display text (e.g., "Attachments" without the rule).
  return parseHeadingRules(node.content || node.title || "").rules
}

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
  // Check content for well-known section names (Asana imports have the name in content, not node.name)
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
// Cursor Position Derivation
// =============================================================================

export interface CursorIndices {
  colIndex: number
  cardIndex: number
  isAtCardLevel: boolean
}

/**
 * Derive cursor indices from cursorNodeId using nodeIndex for O(1) lookup.
 * When getNode is provided and cursorNodeId is not in the index (e.g., a descendant
 * of a card), walks up the parent chain to find the containing card's position.
 * This eliminates the need to index all descendants upfront (20k+ getChildren queries).
 */
export function deriveCursorIndices(
  columns: ColumnView[],
  cursorNodeId: string | null,
  nodeIndex: Map<string, { colIndex: number; cardIndex: number }>,
  getNode?: (id: string) => { parent_id: string | null } | null,
  /** Hint from cursor store — for embeds where parent_id chain leads to wrong card */
  cursorCardNodeId?: string | null,
): CursorIndices {
  if (!cursorNodeId || columns.length === 0) {
    return { colIndex: -1, cardIndex: -1, isAtCardLevel: false }
  }

  // Direct lookup
  let entry = nodeIndex.get(cursorNodeId)

  // On miss: try cursorCardNodeId hint first (embed-aware), then parent walk
  if (!entry && cursorCardNodeId) {
    entry = nodeIndex.get(cursorCardNodeId)
  }
  if (!entry && getNode) {
    let current = getNode(cursorNodeId)
    while (current?.parent_id) {
      entry = nodeIndex.get(current.parent_id)
      if (entry) break
      current = getNode(current.parent_id)
    }
  }

  if (entry) {
    return {
      colIndex: entry.colIndex,
      cardIndex: entry.cardIndex,
      isAtCardLevel: entry.cardIndex !== -1,
    }
  }

  // Cursor node not found in visible columns
  const perfLog = createLogger("km:perf")
  perfLog.debug?.(`cursor node ${cursorNodeId?.slice(-8)} not found in nodeIndex (${nodeIndex.size} entries)`)
  return { colIndex: -1, cardIndex: -1, isAtCardLevel: false }
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Derive columns from Repo for rendering.
 *
 * Uses useSyncExternalStore to subscribe to repo mutations — columns
 * automatically recompute when any mutation (updateNode, moveNode, etc.)
 * occurs, without requiring manual dispatch at each call site.
 *
 * In test env: synchronous derivation (act() needs sync updates).
 * In production: incremental loading via generator — yields one column at a time,
 * time-sliced across frames (8ms budget per tick). Per-column memoization cache
 * makes non-zoom mutations fast (most columns hit cache), so the incremental path
 * is effectively synchronous for mutations. Only zoom (cold cache) actually yields
 * across multiple ticks for progressive rendering.
 *
 * @param repo - Repo instance
 * @param rootId - Current zoom root (null for repo root)
 * @param foldDepths - Map of node ID → depth budget (0 = folded, no entry = inherit)
 * @returns ColumnView[] for rendering
 */
export function useColumns(
  repo: Repo,
  rootId: string | null,
  foldDepths: Map<string, number>,
  viewMode?: string,
): ColumnView[] {
  // Subscribe to repo mutations — triggers re-render on any mutation
  const repoVersion = useSyncExternalStore(repo.subscribe, repo.getSnapshot)

  // Coalesce rapid version bumps — multiple mutations within one frame
  // (e.g., background link resolution firing touch() multiple times)
  // only trigger one derivation. Disabled in test env where act() needs sync updates.
  // @ts-expect-error - React internal flag set by silvery test renderer
  const isTest = globalThis.IS_REACT_ACT_ENVIRONMENT as boolean
  const [debouncedVersion, setDebouncedVersion] = useState(repoVersion)
  useEffect(() => {
    if (isTest) {
      setDebouncedVersion(repoVersion)
      return
    }
    const id = setTimeout(() => setDebouncedVersion(repoVersion), 0)
    return () => clearTimeout(id)
  }, [repoVersion, isTest])

  // In test mode, use repoVersion directly for synchronous updates
  const effectiveVersion = isTest ? repoVersion : debouncedVersion

  // Batch-preload children cache before column derivation + Card mount.
  // Without this, each Card component individually queries SQLite for children
  // (overflow calc, TreeNode display) — 200+ cold-cache queries per column on 333k-node vaults.
  // A single CTE query at depth 3 warms: root→columns→cards→card-children, so Card overflow
  // calc and TreeNode render all hit cache. ~6000 nodes for a typical board.
  // The action context (board-app.ts) already does this for keypresses; this covers initial render + zoom.
  const derive = viewMode === "detail" ? deriveDetailColumns : deriveColumnsFromRepo
  const [columns, setColumns] = useState<ColumnView[]>(() => {
    repo.preloadSubtree(rootId, 3)
    return derive(repo, rootId, foldDepths)
  })

  // Track deps to detect changes. foldDepths is NOT tracked — fold expansion
  // happens at the rendering layer (TreeNode/Jotai atoms), not in column derivation.
  // kNodeToColumnView ignores foldDepths (param is _foldDepths).
  const depsRef = useRef({ rootId, version: effectiveVersion })
  const foldDepthsRef = useRef(foldDepths)
  foldDepthsRef.current = foldDepths

  // Synchronous column derivation on rootId change.
  // When rootId changes (e.g., detail pane following cursor), columns must update
  // in the SAME render — deferring to useEffect causes a frame where the title
  // (from rootId) shows the new node but content shows stale columns.
  // React handles setState-during-render by immediately re-rendering with the
  // new state without committing the intermediate frame.
  if (depsRef.current.rootId !== rootId) {
    repo.preloadSubtree(rootId, 3)
    const newColumns = derive(repo, rootId, foldDepthsRef.current)
    depsRef.current = { rootId, version: effectiveVersion }
    setColumns(newColumns)
  }

  // Version-driven re-derivation (repo mutations) uses useEffect for coalescing.
  // Multiple rapid version bumps settle to a single derivation via debouncedVersion.
  useEffect(() => {
    const prev = depsRef.current
    if (prev.version === effectiveVersion) return
    depsRef.current = { rootId, version: effectiveVersion }

    if (isTest) {
      setColumns(derive(repo, rootId, foldDepthsRef.current))
      return
    }

    // Coalesced derivation — runs after rapid version bumps settle.
    // Per-column memoization makes non-zoom derivation fast (cache hits).
    setColumns(derive(repo, rootId, foldDepthsRef.current))
  }, [effectiveVersion, rootId, isTest, repo])

  return columns
}

/**
 * Build a nodeId → {colIndex, cardIndex} map for O(1) cursor position lookup.
 * Includes column header nodes (cardIndex = -1) and card nodes.
 * When getChildren is provided, also maps card descendants for cursor resolution
 * (e.g., after indent, the indented node resolves to its parent card's position).
 */
export function buildNodeIndex(
  columns: ColumnView[],
  getChildren?: (parentId: string) => { id: string }[],
  foldDepths?: Map<string, number>,
  rootId?: string | null,
): Map<string, { colIndex: number; cardIndex: number }> {
  const index = new Map<string, { colIndex: number; cardIndex: number }>()
  // Root fold depth controls how deep within each card to index for navigation
  const rootDepth = foldDepths?.get(rootId ?? "") ?? 1
  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const col = columns[colIdx]
    if (!col) continue
    // Column header node
    index.set(col.node.id, { colIndex: colIdx, cardIndex: -1 })
    // Card nodes + descendants
    for (let cardIdx = 0; cardIdx < col.cardNodes.length; cardIdx++) {
      const card = col.cardNodes[cardIdx]
      if (!card) continue
      index.set(card.id, { colIndex: colIdx, cardIndex: cardIdx })
      if (getChildren) {
        // Per-card override or root depth
        const cardDepth = foldDepths?.get(card.id) ?? rootDepth
        mapDescendants(card.id, colIdx, cardIdx, index, getChildren, foldDepths, cardDepth)
      }
    }
  }
  return index
}

function mapDescendants(
  parentId: string,
  colIndex: number,
  cardIndex: number,
  index: Map<string, { colIndex: number; cardIndex: number }>,
  getChildren: (parentId: string) => { id: string }[],
  foldDepths: Map<string, number> | undefined,
  remainingDepth: number,
): void {
  if (remainingDepth <= 0) return
  for (const child of getChildren(parentId)) {
    if (!index.has(child.id)) {
      index.set(child.id, { colIndex, cardIndex })
      const childDepth = foldDepths?.get(child.id) ?? remainingDepth - 1
      mapDescendants(child.id, colIndex, cardIndex, index, getChildren, foldDepths, childDepth)
    }
  }
}

/**
 * Pure function to derive columns from Repo.
 * Can be used outside of React for testing and in the store for synchronous layout.
 *
 * Uses extractBody to split root children into leading body content and
 * structural (outline) columns -- matching buildBoardState's logic so that
 * zoomed-in views render identically to the board root.
 */
export function deriveColumnsFromRepo(
  repo: Repo,
  rootId: string | null,
  foldDepths: Map<string, number>,
): ColumnView[] {
  using span = log.span("derive-columns")
  // Split root children into leading body content and structural columns.
  // Only outline nodes become columns; list items/embeds/block nodes before the first outline
  // are leading body content (displayed as a virtual "Description" column).
  const allChildren = repo.getChildren(rootId)
  const { body: bodyNodes, items: columnNodes } = extractBody(allChildren)

  // Extract WIP limits from column frontmatter
  const wipLimits = extractWipLimits(columnNodes)

  const columns: ColumnView[] = []

  // Add virtual body column for meaningful leading content
  // (paragraphs, tasks, embeds that appear before the first section/file/folder)
  const filteredBody = bodyNodes.filter(
    (n) => !isCollapsedChild(n) && n.content && n.content.replace(/<[^>]+>/g, "").trim().length > 0,
  )

  if (filteredBody.length > 0) {
    const virtualCardIds = new Set<string>()
    for (const n of filteredBody) {
      if (!isEmbed(n)) virtualCardIds.add(n.id)
    }
    columns.push({
      node: createVirtualBodyNode(rootId),
      cardNodes: filteredBody,
      virtualCardIds,
      isVirtual: true,
    })
  }

  // Deduplicate column nodes by fs_path (import bugs can create duplicate file entries).
  // Keep the node with more children; if tied, keep the first one.
  const deduped = deduplicateByFsPath(columnNodes, (id) => repo.getChildren(id).length)

  // Folder-index merge: when zoomed into a folder, detect its index file
  // and expand its sections as columns (with embed slots resolving to folder children).
  const rootNode = rootId ? repo.getNode(rootId) : null
  const indexFile = rootNode?.fstype === "folder" ? findIndexFile(rootNode, deduped) : null

  if (indexFile) {
    expandIndexFileColumns(repo, indexFile, deduped, columns, wipLimits, foldDepths)
  } else {
    // Convert structural children to columns (with per-column memoization)
    // Skip detail-only sections (e.g., Attachments, Comments, Activity) — they're detail-pane only.
    // Columns with km.collapse:: true are included (rendered as narrow collapsed columns).
    for (const node of deduped) {
      if (isDetailOnly(node)) continue
      columns.push(kNodeToColumnViewCached(repo, node, wipLimits, foldDepths))
    }
  }

  span.spanData.columns = columns.length
  return columns
}

/**
 * Derive columns for the detail view mode.
 *
 * Returns a single virtual column containing:
 * 1. Virtual metadata property nodes (with __meta__ IDs) — navigable property rows
 * 2. Actual tree children — shown as card-like rows below the properties
 *
 * This gives standard j/k navigation through metadata rows first, then children.
 */
export function deriveDetailColumns(repo: Repo, rootId: string | null, _foldDepths: Map<string, number>): ColumnView[] {
  const rootNode = rootId ? repo.getNode(rootId) : null

  // Compute metadata rows for the root node
  const metaKeys = rootNode ? computeMetadataKeys(rootNode) : []
  const metaNodes = metaKeys.map((key) => createVirtualMetaNode(rootId, key))

  const allChildren = repo.getChildren(rootId)

  // If no metadata rows and no children, still show an empty column
  if (metaNodes.length === 0 && allChildren.length === 0) return []

  // All items (meta + children) are virtual for the column
  const virtualCardIds = new Set<string>()
  for (const n of metaNodes) virtualCardIds.add(n.id)
  for (const n of allChildren) virtualCardIds.add(n.id)

  const cardNodes = [...metaNodes, ...allChildren]

  return [
    {
      node: createVirtualBodyNode(rootId),
      cardNodes,
      virtualCardIds,
      isVirtual: true,
    },
  ]
}

/**
 * Create a virtual node representing a metadata property row in the detail pane.
 * Uses the DETAIL_META_PREFIX convention: "__meta__Status", "__meta__Due", etc.
 */
function createVirtualMetaNode(parentId: string | null, key: string): KNode {
  const now = Date.now()
  return {
    id: `${DETAIL_META_PREFIX}${key}`,
    type: "p",
    parent_id: parentId,
    parent_idx: 0,
    content: key,
    data: {},
    created_at: now,
    updated_at: now,
    version: "",
  }
}

/**
 * Generator version of deriveColumnsFromRepo — yields one column at a time.
 * Used by useColumns for time-sliced incremental loading in production.
 * Per-column memoization cache makes non-zoom mutations fast (most columns hit cache),
 * so the generator typically exhausts in one tick for mutations. Only zoom (cold cache)
 * actually yields across multiple ticks for progressive rendering.
 */
export function* deriveColumnsIncremental(
  repo: Repo,
  rootId: string | null,
  foldDepths: Map<string, number>,
): Generator<ColumnView, void, unknown> {
  using span = log.span("derive-columns-incremental")
  const allChildren = repo.getChildren(rootId)
  const { body: bodyNodes, items: columnNodes } = extractBody(allChildren)
  const wipLimits = extractWipLimits(columnNodes)

  // Body column first (usually fast)
  const filteredBody = bodyNodes.filter(
    (n) => !isCollapsedChild(n) && n.content && n.content.replace(/<[^>]+>/g, "").trim().length > 0,
  )
  if (filteredBody.length > 0) {
    const virtualCardIds = new Set<string>()
    for (const n of filteredBody) {
      if (!isEmbed(n)) virtualCardIds.add(n.id)
    }
    yield {
      node: createVirtualBodyNode(rootId),
      cardNodes: filteredBody,
      virtualCardIds,
      isVirtual: true,
    }
  }

  const deduped = deduplicateByFsPath(columnNodes, (id) => repo.getChildren(id).length)

  // Folder-index merge (same logic as deriveColumnsFromRepo)
  const rootNode = rootId ? repo.getNode(rootId) : null
  const indexFile = rootNode?.fstype === "folder" ? findIndexFile(rootNode, deduped) : null

  let columnCount = 0
  if (indexFile) {
    const expanded: ColumnView[] = []
    expandIndexFileColumns(repo, indexFile, deduped, expanded, wipLimits, foldDepths)
    for (const col of expanded) {
      yield col
      columnCount++
    }
  } else {
    for (const node of deduped) {
      if (isDetailOnly(node)) continue
      yield kNodeToColumnViewCached(repo, node, wipLimits, foldDepths)
      columnCount++
    }
  }
  span.spanData.columns = (filteredBody.length > 0 ? 1 : 0) + columnCount
}

// =============================================================================
// Folder-index file expansion
// =============================================================================

/**
 * Expand an index file's children as columns for a folder.
 *
 * Index file children control the folder's column layout:
 * - `![[./child]]` embed slots (paragraph OR heading) resolve to the referenced folder child
 * - `## Inline Section` becomes a column directly
 * - Non-slot body content (prose paragraphs) shown in a virtual body column
 * - Unlisted folder children are appended after listed ones
 * - The index file itself is excluded from the column list
 *
 * Note: The writer emits `![[./child]]` as plain lines that parse as paragraph nodes
 * (type: "p"), not heading/mdsection nodes. We use extractSlotTargets on ALL children
 * to handle both paragraph and heading slot references.
 */
function expandIndexFileColumns(
  repo: Repo,
  indexFile: KNode,
  deduped: KNode[],
  columns: ColumnView[],
  wipLimits: Map<string, number>,
  foldDepths: Map<string, number>,
): void {
  const indexChildren = repo.getChildren(indexFile.id)
  const { body: indexBody, items: _indexSections } = extractBody(indexChildren)

  // Identify which children are pure slot references (paragraph or heading)
  // by checking ALL children against extractSlotTargets. Build a set of
  // child IDs that are slots so we can exclude them from body content.
  // Only mark a child as a slot if ALL its targets resolve to actual folder children —
  // unresolved paragraph slots must remain visible as body content (not silently disappear).
  const slotChildIds = new Set<string>()
  for (const child of indexChildren) {
    const targets = extractSlotTargets([child])
    if (targets.length > 0) {
      const allResolved = targets.every((target) =>
        deduped.some((fc) => fc !== indexFile && namesAreSimilar(fc.name ?? "", target)),
      )
      if (allResolved) {
        slotChildIds.add(child.id)
      }
    }
  }

  // Filter helper: node has visible content and is not collapsed/resolved-slot
  const isBodyContent = (n: KNode) =>
    !slotChildIds.has(n.id) &&
    !isCollapsedChild(n) &&
    n.content != null &&
    n.content.replace(/<[^>]+>/g, "").trim().length > 0

  // Collect body nodes from two sources:
  // 1. filteredIndexBody: non-slot body from extractBody (before first outline item)
  // 2. fallbackBody: unresolved non-outline slots that appear AFTER the first outline
  //    section — extractBody puts these in `items`, but they should be body content.
  const filteredIndexBody = indexBody.filter(isBodyContent)
  const fallbackBody: KNode[] = []

  // Track where structural columns start so we can insert body column before them
  const bodyInsertIdx = columns.length

  // Track which folder children are referenced by embed slots
  const referencedIds = new Set<string>()

  // Helper: resolve a slot target to a folder child and add as column
  const resolveSlot = (target: string): boolean => {
    const child = deduped.find((n) => n !== indexFile && namesAreSimilar(n.name ?? "", target))
    if (child) {
      columns.push(kNodeToColumnViewCached(repo, child, wipLimits, foldDepths))
      referencedIds.add(child.id)
      return true
    }
    return false
  }

  // Process ALL index children in order, resolving slots from both body and structural children
  for (const child of indexChildren) {
    const targets = extractSlotTargets([child])
    if (targets.length > 0) {
      // Check if ALL targets resolve before consuming any (resolveSlot has side effects)
      const allResolved = targets.every((target) =>
        deduped.some((fc) => fc !== indexFile && namesAreSimilar(fc.name ?? "", target)),
      )
      if (allResolved) {
        // All targets resolve — consume them as columns
        for (const target of targets) {
          resolveSlot(target)
        }
        continue
      }
      // Unresolved slot: classify by node type, not extractBody position.
      // Outline (heading) slots fall through to become inline sections.
      // Non-outline (paragraph) slots → body fallback content (unless already in indexBody).
      if (!isOutline(child.type, child.item)) {
        if (!indexBody.includes(child) && isBodyContent(child)) fallbackBody.push(child)
        continue
      }
    }
    // Outline children (sections or unresolved heading slots) become inline columns
    if (isOutline(child.type, child.item)) {
      if (!isDetailOnly(child)) {
        columns.push(kNodeToColumnViewCached(repo, child, wipLimits, foldDepths))
      }
    }
    // Non-slot, non-outline children in `items` are non-structural content
    // (e.g., plain paragraphs between sections) — add to fallback body.
    // Children in indexBody were already handled by filteredIndexBody above.
    else if (!indexBody.includes(child) && isBodyContent(child)) {
      fallbackBody.push(child)
    }
  }

  // Create virtual body column from pre-section body + post-section fallback body
  const allBodyNodes = [...filteredIndexBody, ...fallbackBody]
  if (allBodyNodes.length > 0) {
    const virtualCardIds = new Set<string>()
    for (const n of allBodyNodes) {
      if (!isEmbed(n)) virtualCardIds.add(n.id)
    }
    columns.splice(bodyInsertIdx, 0, {
      node: createVirtualBodyNode(indexFile.parent_id),
      cardNodes: allBodyNodes,
      virtualCardIds,
      isVirtual: true,
    })
  }

  // Append unreferenced folder children (not the index file, not already placed)
  for (const node of deduped) {
    if (node === indexFile || referencedIds.has(node.id)) continue
    if (isDetailOnly(node)) continue
    columns.push(kNodeToColumnViewCached(repo, node, wipLimits, foldDepths))
  }
}

// =============================================================================
// Per-column memoization
// =============================================================================

/**
 * Cache for kNodeToColumnView results to avoid re-deriving unchanged columns.
 * Key: column node ID. The cache is invalidated per-column when:
 * - The column's children array reference changes (childrenCache was busted)
 * - The foldDepths map reference changes (fold state changed)
 * - WIP limits change
 *
 * This avoids the O(columns * cards) cost on every repoVersion bump when
 * only one column's children actually changed.
 */
interface ColumnViewCacheEntry {
  childrenRef: KNode[] // Reference identity check — childrenCache returns same array if not busted
  wipLimitsRef: Map<string, number>
  view: ColumnView
}

const columnViewCache = new Map<string, ColumnViewCacheEntry>()

function kNodeToColumnViewCached(
  repo: Repo,
  node: KNode,
  wipLimits: Map<string, number>,
  foldDepths: Map<string, number>,
): ColumnView {
  const childrenRef = repo.getChildren(node.id)
  const cached = columnViewCache.get(node.id)

  // Cache key: childrenRef + wipLimits only.
  // foldDepths is NOT used by kNodeToColumnView (param is _foldDepths) —
  // fold expansion happens at the rendering layer (TreeNode), not here.
  if (cached && cached.childrenRef === childrenRef && cached.wipLimitsRef === wipLimits) {
    return cached.view
  }

  const view = kNodeToColumnView(repo, node, wipLimits, foldDepths)
  columnViewCache.set(node.id, { childrenRef, wipLimitsRef: wipLimits, view })
  return view
}

// =============================================================================
// Helpers
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
      // Replace the previous entry with this one (more children)
      const idx = result.indexOf(existing.node)
      if (idx >= 0) result[idx] = node
      seen.set(path, { node, childCount })
    }
    // Otherwise skip (existing has more or equal children)
  }

  return result
}

/**
 * Extract WIP limits from column nodes' frontmatter.
 */
function extractWipLimits(nodes: KNode[]): Map<string, number> {
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

/**
 * Convert a KNode to ColumnView.
 */
function kNodeToColumnView(
  repo: Repo,
  node: KNode,
  wipLimits: Map<string, number>,
  _foldDepths: Map<string, number>,
): ColumnView {
  // Use node.rules if available, otherwise parse from content (which may contain
  // unparsed rules like "km.collapse:: true"), falling back to title.
  const rules: SectionRules = node.rules ?? parseHeadingRules(node.content || node.title || "").rules

  // Look up WIP limit
  const normalizedName = (node.name || node.title || "").toLowerCase().replace(/\s+/g, "_")
  const wipLimit = rules.limit ?? wipLimits.get(normalizedName)

  // Split children into body (paragraphs) and structural (outline) cards
  // When the column is a folder with an index file, exclude the index file from cards
  const allCardNodes = repo.getChildren(node.id)
  const folderIndex = node.fstype === "folder" ? findIndexFile(node, allCardNodes) : null
  const filteredCardNodes = folderIndex ? allCardNodes.filter((c) => c.id !== folderIndex.id) : allCardNodes
  const { body: bodyNodes, items: structuralNodes } = extractBody(filteredCardNodes)

  const cardNodes: KNode[] = []
  const virtualCardIds = new Set<string>()

  for (const child of bodyNodes) {
    if (isCollapsedChild(child)) continue
    cardNodes.push(child)
    if (!isEmbed(child)) virtualCardIds.add(child.id)
  }
  for (const child of structuralNodes) {
    if (isCollapsedChild(child)) continue
    cardNodes.push(child)
  }

  return { node, cardNodes, virtualCardIds, wipLimit, rules }
}

/**
 * Create a virtual node for the body column.
 * This node represents leading non-section content grouped for display.
 */
function createVirtualBodyNode(parentId: string | null): KNode {
  const now = Date.now()
  return {
    id: `__body__${parentId ?? "root"}`,
    type: "h",
    item: true,
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
