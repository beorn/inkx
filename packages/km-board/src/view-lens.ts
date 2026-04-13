/**
 * ViewLens — TreeLens-based view over the repo.
 *
 * Provides the structural transformations that the view tree needs (body extraction,
 * symlink resolution, role computation, fold/hidden filtering, collapse, detail-only
 * exclusion, dedup, index file expansion) as a lazy query interface rather than
 * an eagerly built object tree.
 *
 * Zero upfront allocation — each method computes on demand and caches results.
 * Same KNode identity flows through; enrichments (role, isBody, resolvedEmbed) are
 * lens methods, not node properties.
 */

import { KNode, extractSlotTargets, findIndexFile, namesAreSimilar, parseHeadingRules } from "@km/core"
import type { NodeRules } from "@km/core"
import { extractBody } from "@km/tree"
import type { TreeLens, ViewRole } from "./tree-lens.ts"
import {
  isCollapsedChild,
  isDetailOnly,
  deduplicateByFsPath,
  getCollapseRules,
  createVirtualBodyNode,
} from "./view-lens-helpers.ts"

// =============================================================================
// Types
// =============================================================================

/** Minimal repo interface needed by the view lens. */
export interface ViewLensRepo {
  getNode(id: string): KNode | null
  getChildren(parentId: string | null): KNode[]
  getNodesBatch(ids: string[]): Map<string, KNode>
}

export interface ViewLensOptions {
  rootId: string | null
  foldDepths: Map<string, number>
  hiddenNodeIds?: Set<string>
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a TreeLens that provides a view over the repo's node tree.
 *
 * Applies the canonical view transformations:
 * - Root selection: only nodes under rootId are visible
 * - Body extraction: non-outline children before first heading → body column
 * - Fold filtering: collapsed columns have no children
 * - Hidden filtering: nodes in hiddenNodeIds are excluded
 * - Symlink resolution: nodes with embed_of get target's children
 * - Role assignment: depth-based (board/column/card/subitem/body-column)
 * - Index file expansion: folders with index files expand
 * - Detail-only exclusion: detailOnly / well-known metadata sections hidden
 * - Deduplication by fs_path
 * - Section rules from frontmatter
 *
 * **Layering**: this returns a {@link TreeLens} (data layer). React components
 * should NOT consume the returned lens directly — use `createViewTree`
 * (in `view-tree-projection.ts`) which wraps it with per-node signal bags
 * for incremental rendering. Use this factory only from non-React code:
 * reducers, selectors, navigation helpers, store, pane-signals reactive graph.
 *
 * Known stub: the `foldDepths` option is part of `ViewLensOptions` but is
 * NOT currently read by this function. Per-node fold lives at the React
 * layer in `NodeStore` (apps/km-tui/src/state/reactive.ts) for
 * incremental rendering performance reasons. See
 * `bd show km-tui.view-mode-feature-parity` for the planned cleanup.
 */
export function createViewLens(repo: ViewLensRepo, options: ViewLensOptions): TreeLens {
  const { rootId, hiddenNodeIds } = options

  // =========================================================================
  // Caches
  // =========================================================================

  const childrenCache = new Map<string, readonly string[]>()
  const parentCache = new Map<string, string | null>()
  const roleCache = new Map<string, ViewRole>()
  const nodeCache = new Map<string, KNode>() // includes virtual body nodes
  const bodyIdSets = new Map<string, Set<string>>() // parentId → set of body card IDs
  const symlinkCache = new Map<string, KNode | undefined>()
  const rulesCache = new Map<string, NodeRules | undefined>()
  let _walkOrder: readonly string[] | null = null

  // =========================================================================
  // Root-level structure computation (lazy, cached)
  // =========================================================================

  let _rootChildIds: readonly string[] | null = null

  /**
   * Compute the root's children (columns + optional body column).
   * This is the heart of the lens — the top-level structural derivation.
   */
  function getRootChildIds(): readonly string[] {
    if (_rootChildIds !== null) return _rootChildIds

    const allChildren = repo.getChildren(rootId)
    const { body: bodyNodes, items: columnNodes } = extractBody(allChildren)

    const resultIds: string[] = []

    // --- Body column ---
    const filteredBody = bodyNodes.filter(
      (n) =>
        !isCollapsedChild(n) &&
        !hiddenNodeIds?.has(n.id) &&
        n.content != null &&
        n.content.replace(/<[^>]+>/g, "").trim().length > 0,
    )

    const bodyColId = `__body__${rootId ?? "root"}`
    if (filteredBody.length > 0) {
      const bodyNode = createVirtualBodyNode(rootId)
      nodeCache.set(bodyColId, bodyNode)
      roleCache.set(bodyColId, "body-column")
      parentCache.set(bodyColId, rootId ?? "__root__")

      // Store body card IDs
      const bodyIdSet = new Set(filteredBody.filter((n) => !KNode.isEmbed(n)).map((n) => n.id))
      bodyIdSets.set(bodyColId, bodyIdSet)

      // Children of body column are the filtered body nodes
      const bodyChildIds: string[] = []
      for (const bNode of filteredBody) {
        registerNode(bNode)
        roleCache.set(bNode.id, "card")
        parentCache.set(bNode.id, bodyColId)
        bodyChildIds.push(bNode.id)
        resolveEmbed(bNode)
      }
      childrenCache.set(bodyColId, bodyChildIds)
      resultIds.push(bodyColId)
    }

    // --- Structural columns ---
    const deduped = deduplicateByFsPath(columnNodes, (id) => repo.getChildren(id).length)

    // Folder-index expansion
    const rootNode = rootId ? repo.getNode(rootId) : null
    const indexFile = rootNode?.fstype === "folder" ? findIndexFile(rootNode, deduped) : null

    if (indexFile) {
      expandIndexFile(indexFile, deduped, resultIds)
    } else {
      for (const node of deduped) {
        if (isDetailOnly(node)) continue
        if (hiddenNodeIds?.has(node.id)) continue
        registerColumnNode(node)
        resultIds.push(node.id)
      }
    }

    _rootChildIds = resultIds
    return resultIds
  }

  // =========================================================================
  // Node registration
  // =========================================================================

  function registerNode(node: KNode): void {
    nodeCache.set(node.id, node)
  }

  function resolveEmbed(node: KNode): void {
    if (node.embed_of) {
      const target = repo.getNode(node.embed_of) ?? undefined
      symlinkCache.set(node.id, target)
    }
  }

  function registerColumnNode(node: KNode): void {
    registerNode(node)
    roleCache.set(node.id, "column")
    parentCache.set(node.id, rootId ?? "__root__")

    const r: NodeRules = node.rules ?? parseHeadingRules(node.content || node.title || "").rules
    rulesCache.set(node.id, Object.keys(r).length > 0 ? r : undefined)
  }

  // =========================================================================
  // Column children computation (lazy)
  // =========================================================================

  function computeColumnChildren(colId: string): readonly string[] {
    const cached = childrenCache.get(colId)
    if (cached !== undefined) return cached

    const colNode = nodeCache.get(colId) ?? repo.getNode(colId)
    if (!colNode) {
      childrenCache.set(colId, [])
      return []
    }

    // If collapsed (but not detail-only), children are empty
    if (getCollapseRules(colNode).collapse === true) {
      childrenCache.set(colId, [])
      return []
    }

    const allCardNodes = repo.getChildren(colId)
    const folderIndex = colNode.fstype === "folder" ? findIndexFile(colNode, allCardNodes) : null
    const filteredCardNodes = folderIndex ? allCardNodes.filter((c) => c.id !== folderIndex.id) : allCardNodes
    const { body: bodyCards, items: structuralCards } = extractBody(filteredCardNodes)

    const bodyIdSet = new Set<string>()
    const rawCards: KNode[] = []

    for (const child of bodyCards) {
      if (isCollapsedChild(child)) continue
      if (hiddenNodeIds?.has(child.id)) continue
      rawCards.push(child)
      if (!KNode.isEmbed(child)) bodyIdSet.add(child.id)
    }
    for (const child of structuralCards) {
      if (isCollapsedChild(child)) continue
      if (hiddenNodeIds?.has(child.id)) continue
      rawCards.push(child)
    }

    bodyIdSets.set(colId, bodyIdSet)

    const cardIds: string[] = []
    for (const card of rawCards) {
      registerNode(card)
      roleCache.set(card.id, "card")
      parentCache.set(card.id, colId)
      resolveEmbed(card)
      cardIds.push(card.id)
    }

    childrenCache.set(colId, cardIds)
    return cardIds
  }

  // =========================================================================
  // Card/subitem children computation (lazy)
  // =========================================================================

  function computeCardOrSubitemChildren(nodeId: string): readonly string[] {
    const cached = childrenCache.get(nodeId)
    if (cached !== undefined) return cached

    const node = nodeCache.get(nodeId) ?? repo.getNode(nodeId)
    if (!node) {
      childrenCache.set(nodeId, [])
      return []
    }

    // Children come from resolved symlink target or the node itself
    const symlink = symlinkCache.get(nodeId)
    const sourceId = symlink?.id ?? nodeId
    const rawChildren = repo.getChildren(sourceId)

    const childIds: string[] = []
    for (const child of rawChildren) {
      if (hiddenNodeIds?.has(child.id)) continue
      registerNode(child)
      roleCache.set(child.id, "subitem")
      parentCache.set(child.id, nodeId)
      resolveEmbed(child)
      childIds.push(child.id)
    }

    childrenCache.set(nodeId, childIds)
    return childIds
  }

  // =========================================================================
  // Index file expansion — folder with an index.md expands slot children first
  // =========================================================================

  function expandIndexFile(indexFile: KNode, deduped: KNode[], resultIds: string[]): void {
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
      !hiddenNodeIds?.has(n.id) &&
      n.content != null &&
      n.content.replace(/<[^>]+>/g, "").trim().length > 0

    const filteredIndexBody = indexBody.filter(isBodyContent)
    const fallbackBody: KNode[] = []

    const bodyInsertIdx = resultIds.length
    const referencedIds = new Set<string>()

    const resolveSlot = (target: string): boolean => {
      const child = deduped.find((n) => n !== indexFile && namesAreSimilar(n.name ?? "", target))
      if (child && !hiddenNodeIds?.has(child.id)) {
        registerColumnNode(child)
        resultIds.push(child.id)
        referencedIds.add(child.id)
        return true
      }
      return false
    }

    for (const child of indexChildren) {
      if (hiddenNodeIds?.has(child.id)) continue
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
        if (!isDetailOnly(child) && !hiddenNodeIds?.has(child.id)) {
          registerColumnNode(child)
          resultIds.push(child.id)
        }
      } else if (!indexBody.includes(child) && isBodyContent(child)) {
        fallbackBody.push(child)
      }
    }

    // Body column from index body + fallback
    const allBodyNodes = [...filteredIndexBody, ...fallbackBody]
    if (allBodyNodes.length > 0) {
      const bodyColId = `__body__${indexFile.parent_id ?? "root"}`
      const bodyNode = createVirtualBodyNode(indexFile.parent_id)
      nodeCache.set(bodyColId, bodyNode)
      roleCache.set(bodyColId, "body-column")
      parentCache.set(bodyColId, rootId ?? "__root__")

      const bodyIdSet = new Set(allBodyNodes.filter((n) => !KNode.isEmbed(n)).map((n) => n.id))
      bodyIdSets.set(bodyColId, bodyIdSet)

      const bodyChildIds: string[] = []
      for (const bNode of allBodyNodes) {
        registerNode(bNode)
        roleCache.set(bNode.id, "card")
        parentCache.set(bNode.id, bodyColId)
        bodyChildIds.push(bNode.id)
        resolveEmbed(bNode)
      }
      childrenCache.set(bodyColId, bodyChildIds)
      resultIds.splice(bodyInsertIdx, 0, bodyColId)
    }

    // Unreferenced folder children
    for (const node of deduped) {
      if (node === indexFile || referencedIds.has(node.id)) continue
      if (isDetailOnly(node)) continue
      if (hiddenNodeIds?.has(node.id)) continue
      registerColumnNode(node)
      resultIds.push(node.id)
    }
  }

  // =========================================================================
  // TreeLens: children()
  // =========================================================================

  function children(id: string): readonly string[] {
    const effectiveRootId = rootId ?? "__root__"

    // Root's children
    if (id === effectiveRootId) {
      return getRootChildIds()
    }

    // Check if already cached
    const cached = childrenCache.get(id)
    if (cached !== undefined) return cached

    // Ensure root structure is computed (populates roleCache for columns)
    getRootChildIds()

    let nodeRole = roleCache.get(id)

    // If role unknown, trigger parent chain computation to discover it
    if (nodeRole === undefined) {
      parent(id) // This walks up repo parent_id chain, triggering children() at each level
      nodeRole = roleCache.get(id)
    }

    // Column or body-column children
    if (nodeRole === "column") {
      return computeColumnChildren(id)
    }
    if (nodeRole === "body-column") {
      return childrenCache.get(id) ?? []
    }

    // Card or subitem children
    if (nodeRole === "card" || nodeRole === "subitem") {
      return computeCardOrSubitemChildren(id)
    }

    return []
  }

  // =========================================================================
  // TreeLens: get()
  // =========================================================================

  function get(id: string): KNode | undefined {
    const effectiveRootId = rootId ?? "__root__"
    if (id === effectiveRootId) {
      if (rootId) return repo.getNode(rootId) ?? undefined
      return undefined // no node for virtual root
    }

    // Ensure root structure + parent chain computed
    getRootChildIds()

    const cached = nodeCache.get(id)
    if (cached) return cached

    // May be a card/subitem not yet computed — trigger parent chain
    parent(id)
    const afterParent = nodeCache.get(id)
    if (afterParent) return afterParent

    return undefined
  }

  // =========================================================================
  // TreeLens: parent()
  // =========================================================================

  function parent(id: string): string | null {
    const effectiveRootId = rootId ?? "__root__"
    if (id === effectiveRootId) return null

    // Ensure root structure is computed
    getRootChildIds()

    const cached = parentCache.get(id)
    if (cached !== undefined) return cached

    // Node not yet in parentCache — it may be a card/subitem whose parent's
    // children() hasn't been called yet. Walk up the repo's parent_id chain
    // to find the nearest ancestor that IS in this lens, then trigger its
    // children computation to populate caches.
    const repoNode = repo.getNode(id)
    if (!repoNode) return null

    // Collect ancestor chain from repo until we find a node in our lens
    const chain: string[] = [id]
    let cur = repoNode.parent_id
    while (cur !== null) {
      if (roleCache.has(cur)) {
        // Found an ancestor in the lens — trigger its children computation
        // which will populate parentCache for nodes down the chain
        children(cur)
        // Now walk back down the chain, triggering children at each level
        for (let i = chain.length - 2; i >= 0; i--) {
          children(chain[i]!)
        }
        return parentCache.get(id) ?? null
      }
      chain.push(cur)
      const curNode = repo.getNode(cur)
      if (!curNode) break
      cur = curNode.parent_id
    }

    return null
  }

  // =========================================================================
  // TreeLens: walkOrder (lazy DFS via children())
  // =========================================================================

  function computeWalkOrder(): readonly string[] {
    if (_walkOrder !== null) return _walkOrder

    const ids: string[] = []
    const effectiveRootId = rootId ?? "__root__"
    const rootChildren = children(effectiveRootId)

    // Iterative DFS
    const stack: string[] = []
    for (let i = rootChildren.length - 1; i >= 0; i--) {
      stack.push(rootChildren[i]!)
    }

    while (stack.length > 0) {
      const nodeId = stack.pop()!
      ids.push(nodeId)

      const childIds = children(nodeId)
      for (let i = childIds.length - 1; i >= 0; i--) {
        stack.push(childIds[i]!)
      }
    }

    _walkOrder = ids
    return ids
  }

  // =========================================================================
  // TreeLens: nextInWalk / prevInWalk (O(1) tree traversal)
  // =========================================================================

  function nextInWalk(id: string): string | null {
    // DFS next: first child, or next sibling, or ancestor's next sibling
    const childIds = children(id)
    if (childIds.length > 0) return childIds[0]!

    let current = id
    const effectiveRootId = rootId ?? "__root__"

    while (current !== effectiveRootId) {
      const parentId = parent(current)
      if (parentId === null) return null

      const siblings = children(parentId)
      const idx = siblings.indexOf(current)
      if (idx >= 0 && idx < siblings.length - 1) return siblings[idx + 1]!

      current = parentId
    }

    return null
  }

  function prevInWalk(id: string): string | null {
    const effectiveRootId = rootId ?? "__root__"

    const parentId = parent(id)
    if (parentId === null) return null

    const siblings = children(parentId)
    const idx = siblings.indexOf(id)

    if (idx > 0) {
      // Previous sibling's deepest last descendant
      let prevId = siblings[idx - 1]!
      let prevChildren = children(prevId)
      while (prevChildren.length > 0) {
        prevId = prevChildren[prevChildren.length - 1]!
        prevChildren = children(prevId)
      }
      return prevId
    }

    // No previous sibling — parent (unless parent is root)
    if (parentId === effectiveRootId) return null
    return parentId
  }

  // =========================================================================
  // TreeLens: role()
  // =========================================================================

  function role(id: string): ViewRole | undefined {
    const effectiveRootId = rootId ?? "__root__"
    if (id === effectiveRootId) return "board"

    // Ensure root structure is computed
    getRootChildIds()

    const cached = roleCache.get(id)
    if (cached !== undefined) return cached

    // Node not in roleCache — trigger parent chain computation
    parent(id) // This will trigger children() up the chain
    return roleCache.get(id)
  }

  // =========================================================================
  // TreeLens: isBody()
  // =========================================================================

  function isBody(id: string): boolean {
    // Ensure parent chain is computed
    const parentId = parent(id)
    if (!parentId) return false

    const bodySet = bodyIdSets.get(parentId)
    return bodySet?.has(id) ?? false
  }

  // =========================================================================
  // TreeLens: resolvedEmbed()
  // =========================================================================

  function resolvedEmbed(id: string): KNode | undefined {
    // Ensure parent chain is computed so symlink is resolved
    parent(id)

    return symlinkCache.get(id)
  }

  // =========================================================================
  // TreeLens: rules()
  // =========================================================================

  function rules(id: string): NodeRules | undefined {
    // Ensure root structure computed (rules are set during column registration)
    getRootChildIds()

    return rulesCache.get(id)
  }

  // =========================================================================
  // Construct and return
  // =========================================================================

  return {
    rootId,

    get,
    children,
    parent,
    nextInWalk,
    prevInWalk,

    get walkOrder(): readonly string[] {
      return computeWalkOrder()
    },

    role,
    isBody,
    resolvedEmbed,
    rules,
  }
}

/**
 * Classify a cursor node's containing card + column by walking up the lens parents.
 */
export function classifyCursorFromLens(
  lens: TreeLens,
  nodeId: string | null,
): { cursorCardNodeId: string | null; cursorColumnNodeId: string | null; cursorDepth: "board" | "column" | "card" } {
  if (!nodeId) {
    return { cursorCardNodeId: null, cursorColumnNodeId: null, cursorDepth: "board" }
  }

  // Walk up from cursor, recording the first card and column we pass through
  let cursorCardNodeId: string | null = null
  let cursorColumnNodeId: string | null = null
  let current: string | null = nodeId
  while (current) {
    const role = lens.role(current)
    if (role === "card" && !cursorCardNodeId) cursorCardNodeId = current
    if ((role === "column" || role === "body-column") && !cursorColumnNodeId) {
      cursorColumnNodeId = current
      break // Column is the topmost ancestor we care about
    }
    current = lens.parent(current)
  }

  const cursorDepth: "board" | "column" | "card" = cursorCardNodeId ? "card" : cursorColumnNodeId ? "column" : "board"

  return { cursorCardNodeId, cursorColumnNodeId, cursorDepth }
}
