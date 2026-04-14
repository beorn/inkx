/**
 * Shared utilities for TreeNode components (TreeNodeImpl and FoldedChildRow).
 *
 * Extracted from TreeNode.tsx to reduce per-module size and enable reuse
 * without circular imports.
 */

import React, { useMemo } from "react"
import { Box, H1, Small, Text } from "@silvery/ag-react"
import { KNode } from "@km/core"
import type { Repo } from "../repo-context.tsx"
import { getNodeDisplayName, nodeBadgeLabel } from "../state.ts"
import type { PopoverContent } from "./Popover.tsx"
import { deriveExcludedSigils } from "../state/ui-context.tsx"
import { NodeStoreContext, useNodeStore, type NodeStore } from "../state/reactive.ts"
import {
  getTypeBullet,
  getCircleBullet,
  getFoldMarker,
  getStatusIcon,
  computeSearchDecorationsFromSource,
  type InlineRenderContext,
  type TextDecoration,
  type StatusIcon,
} from "../text/index.ts"

/** Compute the bullet icon based on icon style, task status, fold state, and
 *  sticky-fold state. Sticky nodes render the fold marker with inverse video
 *  so the user sees that fold-all/unfold-all will skip the node — see
 *  km-tui.sticky-fold. */
export function computeBulletIcon(
  displayNode: KNode,
  nodeIsTask: boolean,
  taskStatusIcon: StatusIcon | null,
  hasChildren: boolean,
  isFolded: boolean,
  ownColor: string | undefined,
  iconStyle: string,
  sticky: "folded" | "unfolded" | null = null,
): StatusIcon {
  if (nodeIsTask && taskStatusIcon) {
    // Task with a sticky pin: overlay inverse background so the checkbox
    // still shows the status but visually announces the pin. Matches the
    // fold-marker treatment below.
    if (sticky !== null) {
      return { ...taskStatusIcon, color: "$selection", backgroundColor: "$fg" }
    }
    return taskStatusIcon
  }
  if (iconStyle === "workflowy") {
    const bullet = getCircleBullet(hasChildren, hasChildren && isFolded)
    const base = ownColor ? { ...bullet, color: ownColor } : bullet
    if (sticky !== null) return { ...base, color: "$selection", backgroundColor: "$fg" }
    return base
  }
  if (iconStyle === "nerdfont") {
    // Fold marker (▸) takes priority when children are hidden — the user must see
    // that content is folded and can be unfolded. Type bullets only show when
    // the node is unfolded or has no children (no fold state to communicate).
    const bullet =
      hasChildren && isFolded
        ? getFoldMarker(hasChildren, isFolded, ownColor, sticky)
        : (getTypeBullet(displayNode, hasChildren) ?? getFoldMarker(hasChildren, isFolded, ownColor, sticky))
    const base = ownColor ? { ...bullet, color: ownColor } : bullet
    // When the nerdfont branch returned a type bullet (not the fold marker), we still
    // want sticky to show — overlay inverse regardless.
    if (sticky !== null) return { ...base, color: "$selection", backgroundColor: "$fg" }
    return base
  }
  // "regular" style — existing fold markers (getFoldMarker handles sticky internally)
  return getFoldMarker(hasChildren, isFolded, ownColor, sticky)
}

/** Inner body of the popover — function component so React defers the
 *  lazy require of DetailView until render time. Keeping this as a component
 *  (not inline JSX in `render()`) means buildNodePopoverContent's caller can
 *  inspect the returned ReactElement (e.g. in tests) without triggering the
 *  require — and the runtime PopoverOverlay only pays the cost when the
 *  popover is actually mounted. */
function PopoverNodeBody({
  node,
  repo,
  inlineCtx,
}: {
  node: KNode
  repo: Repo
  inlineCtx: InlineRenderContext
}): React.ReactElement {
  const nodeChildren = repo.getChildren(node.id)
  const nodeTitle = node.content ?? node.name ?? "(untitled)"
  const badge = nodeBadgeLabel(node)
  const nodeIsTask = KNode.isTask(node)
  const statusIcon = nodeIsTask ? getStatusIcon(node.item?.task?.status ?? "todo") : null
  const isDoneOrDropped = node.item?.task?.status === "done" || node.item?.task?.status === "dropped"
  const { DocContent } = require("../views/DetailView.tsx") as typeof import("../views/DetailView.tsx")
  const { CheckboxIcon } = require("../views/CheckboxIcon.tsx") as typeof import("../views/CheckboxIcon.tsx")
  const { InlineText, InlineRenderProvider } =
    require("../text/InlineComponents.tsx") as typeof import("../text/InlineComponents.tsx")
  return React.createElement(
    InlineRenderProvider,
    { value: inlineCtx },
    React.createElement(
      Box,
      null,
      React.createElement(
        Box,
        { flexGrow: 1, flexShrink: 1 },
        React.createElement(
          H1,
          { wrap: "wrap" },
          // Interactive task checkbox before title (clickable to toggle status)
          statusIcon &&
            React.createElement(
              React.Fragment,
              null,
              React.createElement(CheckboxIcon, {
                nodeId: node.id,
                icon: statusIcon,
                textColor: undefined,
                shouldDim: false,
                isSelected: false,
                isNodeSelected: false,
                isDoneOrDropped,
              }),
              React.createElement(Text, null, " "),
            ),
          React.createElement(InlineText, { text: nodeTitle }),
        ),
      ),
      React.createElement(
        Box,
        { flexShrink: 0, paddingLeft: 1 },
        React.createElement(Small, { wrap: "truncate" }, badge),
      ),
    ),
    nodeChildren.length > 0 &&
      React.createElement(DocContent, { nodes: nodeChildren, depth: 1, repo, maxExpandDepth: 2 }),
  )
}

/**
 * Build popover content for a node — used by both card hover and link hover.
 *
 * The popover overlay (PopoverProvider in BoardApp) lives outside the pane's
 * NodeStoreProvider, so the lazy render output must carry its own provider
 * or DocContent → DocNode → useTreeNode → useNodeStore() will throw
 * "useNodeStore: not inside NodeStoreProvider". When `nodeStore` is supplied
 * (callers grab it via useNodeStore() at popover-show time) the render is
 * wrapped in NodeStoreContext.Provider; otherwise the bare body is returned.
 * See km-tui.popover-nodestore.
 */
export function buildNodePopoverContent(
  node: KNode,
  repo: Repo,
  inlineCtx: InlineRenderContext,
  maxWidth = 55,
  nodeStore?: NodeStore,
): PopoverContent {
  return {
    lines: [],
    render: () => {
      const body = React.createElement(PopoverNodeBody, { node, repo, inlineCtx })
      if (!nodeStore) return body
      return React.createElement(NodeStoreContext.Provider, { value: nodeStore }, body)
    },
    maxWidth,
  }
}

/** Hook: build InlineRenderContext with wikilink/blockref resolution and sigil exclusion. */
export function useTreeInlineContext(
  repo: Repo,
  rootBoardId: string | null | undefined,
  extraExcludedSigils: string[] | undefined,
  sigilColors: Map<string, string> | undefined,
  resolveSigilColor: ((sigil: string) => string | undefined) | undefined,
  excludedSigilsOverride?: string[],
): InlineRenderContext {
  // Capture the pane's nodeStore at hook time. The wikilink hover popover
  // (buildLinkPopover) renders DocContent through the global PopoverOverlay
  // which sits outside this pane's NodeStoreProvider — without threading
  // the store the lazy popover render throws "useNodeStore: not inside
  // NodeStoreProvider". See km-tui.popover-nodestore.
  const nodeStore = useNodeStore()

  // Excluded sigils: use override if provided, otherwise derive from rootBoardId
  const excludedSigils = useMemo(() => {
    if (excludedSigilsOverride && excludedSigilsOverride.length > 0) return excludedSigilsOverride
    const rootSigils = deriveExcludedSigils(repo, rootBoardId ?? null)
    if (!extraExcludedSigils?.length) return rootSigils
    return [...rootSigils, ...extraExcludedSigils]
  }, [excludedSigilsOverride, repo, rootBoardId, extraExcludedSigils])

  return useMemo(() => {
    const excludeSet = excludedSigils.length > 0 ? new Set(excludedSigils) : undefined
    const wikiLinkCache = new Map<string, string | null>()
    // Cache stores both display name and node ID for each target
    const wikiLinkIdCache = new Map<string, string | null>()
    const resolveWikiLink = (target: string): string | null => {
      if (!target?.trim()) return null
      const cached = wikiLinkCache.get(target)
      if (cached !== undefined) return cached
      const resolved = repo.resolveByName?.(target) ?? repo.getNode(target)
      let result: string | null = null
      if (resolved) {
        result = getNodeDisplayName(repo, resolved)
        wikiLinkIdCache.set(target, resolved.id)
      } else if (target.startsWith("^")) {
        const byId = repo.getNode(target.slice(1))
        if (byId) {
          result = getNodeDisplayName(repo, byId)
          wikiLinkIdCache.set(target, byId.id)
        }
      }
      wikiLinkCache.set(target, result)
      return result
    }
    const resolveWikiLinkId = (target: string): string | null => {
      if (!target?.trim()) return null
      // Ensure the target has been resolved (populates idCache)
      const idCached = wikiLinkIdCache.get(target)
      if (idCached !== undefined) return idCached
      // Resolve fresh
      const resolved = repo.resolveByName?.(target) ?? repo.getNode(target)
      if (resolved) {
        wikiLinkIdCache.set(target, resolved.id)
        return resolved.id
      }
      if (target.startsWith("^")) {
        const byId = repo.getNode(target.slice(1))
        if (byId) {
          wikiLinkIdCache.set(target, byId.id)
          return byId.id
        }
      }
      wikiLinkIdCache.set(target, null)
      return null
    }
    const resolveBlockRef = (id: string): string | null => {
      if (!id?.trim()) return null
      const cacheKey = `^${id}`
      const cached = wikiLinkCache.get(cacheKey)
      if (cached !== undefined) return cached
      const resolved = repo.getNode(id)
      const result = resolved ? getNodeDisplayName(repo, resolved) : null
      wikiLinkCache.set(cacheKey, result)
      return result
    }
    // Rich popover for internal links — lazily imports DocContent to avoid circular deps.
    // Only called at runtime when user hovers a link, not at import time.
    const buildLinkPopover = (target: string): PopoverContent | null => {
      const node = repo.resolveByName?.(target) ?? repo.getNode(target)
      if (!node) return null
      const ctx = { resolveWikiLink, resolveWikiLinkId, resolveBlockRef, buildLinkPopover, hideFields: true }
      // Pass the captured nodeStore so the lazy popover render can resolve
      // useTreeNode without an ambient provider — the popover overlay mounts
      // outside this pane's NodeStoreProvider. See km-tui.popover-nodestore.
      return buildNodePopoverContent(node, repo, ctx, undefined, nodeStore)
    }

    return {
      excludeSigils: excludeSet,
      sigilColors,
      resolveSigilColor,
      resolveWikiLink,
      resolveWikiLinkId,
      resolveBlockRef,
      buildLinkPopover,
      hideFields: true,
    }
  }, [excludedSigils, sigilColors, resolveSigilColor, repo, nodeStore])
}

/** Hook: compute search decorations for a content string. */
export function useSearchDecorations(
  content: string,
  searchHighlight: boolean,
  searchQuery: string | null | undefined,
  isCurrentMatch: boolean,
): TextDecoration[] | undefined {
  return useMemo(
    () =>
      searchHighlight && searchQuery
        ? computeSearchDecorationsFromSource(content, searchQuery, isCurrentMatch)
        : undefined,
    [searchHighlight, content, searchQuery, isCurrentMatch],
  )
}
