/**
 * Board Action Handlers - Local Find (Inline Search Bar)
 *
 * Handles opening/closing the find bar, navigating between matches,
 * and updating match results when the query changes.
 */

import { type OpResult, boundary, ok } from "@km/commands"
import type { ID } from "@silvery/selection"
import { getNodeDisplayName } from "@km/tree"
import type { KNode } from "@km/core"
import { activeEditTargetRef } from "@silvery/ag-react"
import { clearSelection } from "./board-selection-helpers.ts"
import type { OpCtx } from "../tui-context.ts"

/**
 * Search visible nodes for a query string (case-insensitive substring).
 * Pure function — usable from both action handlers and React callbacks.
 *
 * Walks the full visible projection (tree.walkOrder) so cards, sub-items,
 * and anything else the user can see is searchable. Matches against the
 * canonical user-visible display name (getNodeDisplayName) so what you see
 * is what you can search for.
 */
export function findMatchingNodeIds(tree: import("@km/board").ViewTreeProjection, query: string): string[] {
  if (!query) return []
  const lowerQuery = query.toLowerCase()
  const matches: string[] = []

  if (!tree.rootId) return matches

  const getChildren = (id: string): KNode[] => {
    const childIds = tree.children(id)
    const children: KNode[] = []
    for (const cid of childIds) {
      const child = tree.node(cid)
      if (child) children.push(child)
    }
    return children
  }

  for (const id of tree.walkOrder) {
    const node = tree.node(id)
    if (!node) continue
    const display = getNodeDisplayName(node, getChildren)
    if (display.toLowerCase().includes(lowerQuery)) matches.push(id)
  }
  return matches
}

/** Open the local find bar */
export function handleLocalFindOpen(ctx: OpCtx): OpResult {
  ctx.setUI({
    localSearch: {
      query: "",
      isInputActive: true,
      matchIndex: 0,
      matchCount: 0,
      matchNodeIds: [],
    },
  })
  // Close inline editing
  ctx.sel.text.deselect()
  clearSelection(ctx)
  return ok()
}

/** Navigate to the next match */
export function handleLocalFindNext(ctx: OpCtx): OpResult {
  const ls = ctx.ui.localSearch
  if (!ls || ls.matchCount === 0) return boundary("find", "No matches")

  const nextIndex = (ls.matchIndex + 1) % ls.matchCount
  const nodeId = ls.matchNodeIds[nextIndex]
  if (nodeId) {
    ctx.sel.node.select([nodeId as ID])
  }
  ctx.setUI({
    localSearch: { ...ls, matchIndex: nextIndex },
  })
  return ok()
}

/** Navigate to the previous match */
export function handleLocalFindPrev(ctx: OpCtx): OpResult {
  const ls = ctx.ui.localSearch
  if (!ls || ls.matchCount === 0) return boundary("find", "No matches")

  const prevIndex = (ls.matchIndex - 1 + ls.matchCount) % ls.matchCount
  const nodeId = ls.matchNodeIds[prevIndex]
  if (nodeId) {
    ctx.sel.node.select([nodeId as ID])
  }
  ctx.setUI({
    localSearch: { ...ls, matchIndex: prevIndex },
  })
  return ok()
}

/**
 * Update local search results based on query change.
 * Called from Board.tsx when the FindBar input changes.
 */
export function updateLocalSearchMatches(ctx: OpCtx, query: string): void {
  const matchNodeIds = findMatchingNodeIds(ctx.tree, query)
  const matchCount = matchNodeIds.length

  // Navigate to first match if available
  const matchIndex = 0
  if (matchCount > 0 && matchNodeIds[0]) {
    ctx.sel.node.select([matchNodeIds[0] as ID])
  }

  ctx.setUI({
    localSearch: {
      query,
      isInputActive: true,
      matchIndex,
      matchCount,
      matchNodeIds,
    },
  })
}

/**
 * Confirm the local find — exit input mode but keep cursor on current match.
 *
 * This must flush any pending debounced query change before committing. When
 * the user types a query and presses Enter before the 150ms debounce fires,
 * ui.localSearch still holds the stale (empty or old) query and 0 matches.
 * We fix this by reading the live query from the active edit target and
 * recomputing matches synchronously. See km-tui.search-debounce-race.
 */
export function handleLocalFindConfirm(ctx: OpCtx): OpResult {
  const ls = ctx.ui.localSearch
  if (!ls) return ok()

  // Flush pending debounce: prefer the live value from the edit target
  // (captures keystrokes the debounce hasn't propagated yet), fall back to
  // the committed query in UI state.
  const liveQuery = activeEditTargetRef.current?.getContent() ?? ls.query
  const matchNodeIds = findMatchingNodeIds(ctx.tree, liveQuery)
  const matchCount = matchNodeIds.length

  // Navigate to first match if the flush surfaced new matches.
  if (matchCount > 0 && matchNodeIds[0]) {
    ctx.sel.node.select([matchNodeIds[0] as ID])
  }

  ctx.setUI({
    localSearch: {
      query: liveQuery,
      isInputActive: false,
      matchIndex: 0,
      matchCount,
      matchNodeIds,
    },
  })
  return ok()
}
