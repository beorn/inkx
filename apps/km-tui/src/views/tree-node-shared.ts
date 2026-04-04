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

/** Compute the bullet icon based on icon style, task status, and fold state. */
export function computeBulletIcon(
  displayNode: KNode,
  nodeIsTask: boolean,
  taskStatusIcon: StatusIcon | null,
  hasChildren: boolean,
  isFolded: boolean,
  ownColor: string | undefined,
  iconStyle: string,
): StatusIcon {
  if (nodeIsTask && taskStatusIcon) return taskStatusIcon
  if (iconStyle === "workflowy") {
    const bullet = getCircleBullet(hasChildren, hasChildren && isFolded)
    return ownColor ? { ...bullet, color: ownColor } : bullet
  }
  if (iconStyle === "nerdfont") {
    // Fold marker (▸) takes priority when children are hidden — the user must see
    // that content is folded and can be unfolded. Type bullets only show when
    // the node is unfolded or has no children (no fold state to communicate).
    const bullet =
      hasChildren && isFolded
        ? getFoldMarker(hasChildren, isFolded, ownColor)
        : (getTypeBullet(displayNode, hasChildren) ?? getFoldMarker(hasChildren, isFolded, ownColor))
    return ownColor ? { ...bullet, color: ownColor } : bullet
  }
  // "regular" style — existing fold markers
  return getFoldMarker(hasChildren, isFolded, ownColor)
}

/**
 * Build popover content for a node — used by both card hover and link hover.
 * Lazy-imports DetailView/InlineComponents to avoid circular deps.
 */
export function buildNodePopoverContent(
  node: KNode,
  repo: Repo,
  inlineCtx: InlineRenderContext,
  maxWidth = 55,
): PopoverContent {
  return {
    lines: [],
    render: () => {
      // Heavy work is deferred to render time — only runs when the popover is actually visible
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
      return buildNodePopoverContent(node, repo, ctx)
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
  }, [excludedSigils, sigilColors, resolveSigilColor, repo])
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
