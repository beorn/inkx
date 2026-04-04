/**
 * Board Action Handlers - Local Find (Inline Search Bar)
 *
 * Handles opening/closing the find bar, navigating between matches,
 * and updating match results when the query changes.
 */

import { type ActionResult, boundary, ok } from "@km/commands"
import { clearSelection } from "../keyboard/keyboard-helpers.ts"
import type { OpCtx } from "../tui-context.ts"
import type { ColumnView } from "../types.ts"

/** Collect visible node IDs from columns in visual order */
export function collectVisibleNodeIds(columns: ColumnView[]): string[] {
  const ids: string[] = []
  for (const col of columns) {
    for (const card of col.cardNodes) {
      ids.push(card.id)
    }
  }
  return ids
}

/**
 * Search visible nodes for a query string (case-insensitive substring).
 * Pure function — usable from both action handlers and React callbacks.
 */
export function findMatchingNodeIds(columns: ColumnView[], query: string): string[] {
  if (!query) return []
  const lowerQuery = query.toLowerCase()
  const matches: string[] = []

  for (const col of columns) {
    for (const card of col.cardNodes) {
      const text = (card.content ?? card.name ?? "").toLowerCase()
      if (text.includes(lowerQuery)) {
        matches.push(card.id)
      }
    }
  }
  return matches
}

/** Open the local find bar */
export function handleLocalFindOpen(ctx: OpCtx): ActionResult {
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
export function handleLocalFindNext(ctx: OpCtx): ActionResult {
  const ls = ctx.ui.localSearch
  if (!ls || ls.matchCount === 0) return boundary("find", "No matches")

  const nextIndex = (ls.matchIndex + 1) % ls.matchCount
  const nodeId = ls.matchNodeIds[nextIndex]
  if (nodeId) {
    ctx.dispatchBoard({ type: "SELECT", nodeId })
  }
  ctx.setUI({
    localSearch: { ...ls, matchIndex: nextIndex },
  })
  return ok()
}

/** Navigate to the previous match */
export function handleLocalFindPrev(ctx: OpCtx): ActionResult {
  const ls = ctx.ui.localSearch
  if (!ls || ls.matchCount === 0) return boundary("find", "No matches")

  const prevIndex = (ls.matchIndex - 1 + ls.matchCount) % ls.matchCount
  const nodeId = ls.matchNodeIds[prevIndex]
  if (nodeId) {
    ctx.dispatchBoard({ type: "SELECT", nodeId })
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
  const matchNodeIds = findMatchingNodeIds(ctx.columns, query)
  const matchCount = matchNodeIds.length

  // Navigate to first match if available
  const matchIndex = 0
  if (matchCount > 0 && matchNodeIds[0]) {
    ctx.dispatchBoard({ type: "SELECT", nodeId: matchNodeIds[0] })
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
