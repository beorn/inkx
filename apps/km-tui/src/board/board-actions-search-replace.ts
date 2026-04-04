/**
 * Board Action Handlers - Search & Replace Dialog
 *
 * Handles opening/closing the search & replace dialog, navigating between matches,
 * performing replacements (single and all), toggling regex mode, and field focus.
 */

import { type ActionResult, boundary, ok } from "@km/commands"
import { KNode } from "@km/core"
import { clearSelection } from "../keyboard/keyboard-helpers.ts"
import type { ActionCtx } from "../tui-context.ts"
import type { ColumnView } from "../types.ts"
import { runRepoEffect } from "./board-effect-runner.ts"

/** Open the search & replace dialog */
export function handleSearchReplaceOpen(ctx: ActionCtx): ActionResult {
  ctx.setUI({
    searchReplace: {
      searchQuery: "",
      replaceQuery: "",
      useRegex: false,
      matchIndex: 0,
      matchCount: 0,
      matchNodeIds: [],
      focusedField: "search",
    },
    localSearch: null,
  })
  // Close inline editing
  ctx.sel.text.deselect()
  clearSelection(ctx)
  return ok()
}

/** Navigate to the next search/replace match */
export function handleSearchReplaceNext(ctx: ActionCtx): ActionResult {
  const sr = ctx.ui.searchReplace
  if (!sr || sr.matchCount === 0) return boundary("search-replace", "No matches")

  const nextIndex = (sr.matchIndex + 1) % sr.matchCount
  const nodeId = sr.matchNodeIds[nextIndex]
  if (nodeId) {
    ctx.dispatchBoard({ type: "SELECT", nodeId })
  }
  ctx.setUI({
    searchReplace: { ...sr, matchIndex: nextIndex },
  })
  return ok()
}

/** Navigate to the previous search/replace match */
export function handleSearchReplacePrev(ctx: ActionCtx): ActionResult {
  const sr = ctx.ui.searchReplace
  if (!sr || sr.matchCount === 0) return boundary("search-replace", "No matches")

  const prevIndex = (sr.matchIndex - 1 + sr.matchCount) % sr.matchCount
  const nodeId = sr.matchNodeIds[prevIndex]
  if (nodeId) {
    ctx.dispatchBoard({ type: "SELECT", nodeId })
  }
  ctx.setUI({
    searchReplace: { ...sr, matchIndex: prevIndex },
  })
  return ok()
}

/** Replace the current match and advance to next */
export function handleSearchReplaceDoReplace(ctx: ActionCtx): ActionResult {
  const sr = ctx.ui.searchReplace
  if (!sr || sr.matchCount === 0 || !sr.searchQuery) return boundary("search-replace", "No matches to replace")

  const nodeId = sr.matchNodeIds[sr.matchIndex]
  if (!nodeId) return boundary("search-replace", "No current match")

  const replaced = replaceInNode(ctx, nodeId, sr.searchQuery, sr.replaceQuery, sr.useRegex, false)
  if (!replaced) return boundary("search-replace", "Replace failed")

  // Recompute matches after replacement
  const updatedMatches = searchReplaceMatchingNodeIds(ctx.columns, ctx.repo, sr.searchQuery, sr.useRegex)
  const newMatchIndex = Math.min(sr.matchIndex, Math.max(0, updatedMatches.length - 1))

  // Navigate to current match position
  if (updatedMatches.length > 0 && updatedMatches[newMatchIndex]) {
    ctx.dispatchBoard({ type: "SELECT", nodeId: updatedMatches[newMatchIndex] })
  }

  ctx.setUI({
    searchReplace: {
      ...sr,
      matchIndex: newMatchIndex,
      matchCount: updatedMatches.length,
      matchNodeIds: updatedMatches,
    },
  })

  ctx.toastQueue.success("Replaced 1 match")
  return ok()
}

/** Replace all matches */
export function handleSearchReplaceDoReplaceAll(ctx: ActionCtx): ActionResult {
  const sr = ctx.ui.searchReplace
  if (!sr || sr.matchCount === 0 || !sr.searchQuery) return boundary("search-replace", "No matches to replace")

  let replaceCount = 0
  // Replace in all matching nodes
  for (const nodeId of sr.matchNodeIds) {
    const replaced = replaceInNode(ctx, nodeId, sr.searchQuery, sr.replaceQuery, sr.useRegex, true)
    if (replaced) replaceCount++
  }

  // Recompute matches (should be 0 after replace all)
  const updatedMatches = searchReplaceMatchingNodeIds(ctx.columns, ctx.repo, sr.searchQuery, sr.useRegex)

  ctx.setUI({
    searchReplace: {
      ...sr,
      matchIndex: 0,
      matchCount: updatedMatches.length,
      matchNodeIds: updatedMatches,
    },
  })

  ctx.toastQueue.success(`Replaced in ${replaceCount} node${replaceCount !== 1 ? "s" : ""}`)
  return ok()
}

/** Toggle regex mode and recompute matches */
export function handleSearchReplaceToggleRegex(ctx: ActionCtx): ActionResult {
  const sr = ctx.ui.searchReplace
  if (!sr) return ok()

  const newUseRegex = !sr.useRegex
  const matches = sr.searchQuery ? searchReplaceMatchingNodeIds(ctx.columns, ctx.repo, sr.searchQuery, newUseRegex) : []

  // Navigate to first match
  if (matches.length > 0 && matches[0]) {
    ctx.dispatchBoard({ type: "SELECT", nodeId: matches[0] })
  }

  ctx.setUI({
    searchReplace: {
      ...sr,
      useRegex: newUseRegex,
      matchIndex: 0,
      matchCount: matches.length,
      matchNodeIds: matches,
    },
  })
  return ok()
}

/** Toggle between search and replace fields */
export function handleSearchReplaceTabField(ctx: ActionCtx): ActionResult {
  const sr = ctx.ui.searchReplace
  if (!sr) return ok()

  ctx.setUI({
    searchReplace: {
      ...sr,
      focusedField: sr.focusedField === "search" ? "replace" : "search",
    },
  })
  return ok()
}

/**
 * Search visible nodes for matches (used by search/replace dialog).
 * Pure function — usable from both action handlers and React callbacks.
 *
 * Uses KNode.string for correct text extraction (handles oi names, task prefixes).
 * Accepts a repo for node lookup since columns only contain node snapshots
 * and replacements may have mutated the repo since the last render.
 */
export function searchReplaceMatchingNodeIds(
  columns: ColumnView[],
  repo: { getNode: (id: string) => import("@km/core").KNode | null | undefined },
  query: string,
  useRegex: boolean,
): string[] {
  if (!query) return []
  const matches: string[] = []

  let regex: RegExp | null = null
  if (useRegex) {
    try {
      regex = new RegExp(query, "gi")
    } catch {
      // Invalid regex — no matches
      return []
    }
  }

  const lowerQuery = query.toLowerCase()

  for (const col of columns) {
    for (const card of col.cardNodes) {
      // Re-fetch from repo for freshness after replacements
      const node = repo.getNode(card.id)
      if (!node) continue
      const text = KNode.string(node)
      if (useRegex && regex) {
        regex.lastIndex = 0
        if (regex.test(text)) {
          matches.push(card.id)
        }
      } else {
        if (text.toLowerCase().includes(lowerQuery)) {
          matches.push(card.id)
        }
      }
    }
  }
  return matches
}

/** Replace text in a single node. Returns true if replacement was made. */
function replaceInNode(
  ctx: ActionCtx,
  nodeId: string,
  searchQuery: string,
  replaceQuery: string,
  useRegex: boolean,
  replaceAll: boolean,
): boolean {
  const node = ctx.repo.getNode(nodeId)
  if (!node) return false

  const text = KNode.string(node)
  let newText: string

  if (useRegex) {
    try {
      const flags = replaceAll ? "gi" : "i"
      const regex = new RegExp(searchQuery, flags)
      newText = text.replace(regex, replaceQuery)
    } catch {
      return false
    }
  } else {
    if (replaceAll) {
      // Replace all occurrences (case-insensitive)
      const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      newText = text.replace(new RegExp(escaped, "gi"), replaceQuery)
    } else {
      // Replace first occurrence (case-insensitive)
      const idx = text.toLowerCase().indexOf(searchQuery.toLowerCase())
      if (idx === -1) return false
      newText = text.slice(0, idx) + replaceQuery + text.slice(idx + searchQuery.length)
    }
  }

  if (newText === text) return false

  // Apply the change via the repo
  const newContent = KNode.setString(node, newText)
  if (KNode.isOutline(node)) {
    runRepoEffect(ctx, { type: "REPO_UPDATE_NODE", nodeId, updates: { name: newContent } })
  } else {
    runRepoEffect(ctx, { type: "REPO_UPDATE_NODE", nodeId, updates: { content: newContent } })
  }
  return true
}

/**
 * Update search/replace results based on search query change.
 * Called from Board.tsx when the search input changes.
 */
export function updateSearchReplaceMatches(ctx: ActionCtx, searchQuery: string): void {
  const sr = ctx.ui.searchReplace
  if (!sr) return

  const matchNodeIds = searchReplaceMatchingNodeIds(ctx.columns, ctx.repo, searchQuery, sr.useRegex)
  const matchCount = matchNodeIds.length

  // Navigate to first match if available
  if (matchCount > 0 && matchNodeIds[0]) {
    ctx.dispatchBoard({ type: "SELECT", nodeId: matchNodeIds[0] })
  }

  ctx.setUI({
    searchReplace: {
      ...sr,
      searchQuery,
      matchIndex: 0,
      matchCount,
      matchNodeIds,
    },
  })
}
