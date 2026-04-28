/**
 * Search Decoration Utilities
 *
 * Computes TextDecoration ranges for search query matches in visible text.
 * Used by TreeNode (local find) and dialog components (Omnibox, SearchDialog).
 */

import type { TextDecoration } from "./inline-ast-types.ts"
import { parseToPlainText } from "./inline-parser.ts"
/** Style for the currently focused search match */
const CURRENT_MATCH_STYLE = { backgroundColor: "$fg-warning", color: "$warning-fg" } as const

/** Style for non-focused search matches */
const OTHER_MATCH_STYLE = { backgroundColor: "$fg-accent", color: "$accent-fg" } as const

/**
 * Compute text decorations for all occurrences of a search query in visible text.
 *
 * @param visibleText - The visible (plain) text to search in
 * @param query - The search query string
 * @param isCurrent - Whether this is the currently focused match (brighter highlight)
 * @returns Array of TextDecoration ranges, or empty array if no matches
 */
export function computeSearchDecorations(visibleText: string, query: string, isCurrent: boolean): TextDecoration[] {
  if (!query) return []
  const decorations: TextDecoration[] = []
  const lowerText = visibleText.toLowerCase()
  const lowerQuery = query.toLowerCase()
  if (!lowerQuery) return []
  const style = isCurrent ? CURRENT_MATCH_STYLE : OTHER_MATCH_STYLE
  let pos = 0
  while (pos < lowerText.length) {
    const idx = lowerText.indexOf(lowerQuery, pos)
    if (idx === -1) break
    decorations.push({ start: idx, end: idx + query.length, style })
    pos = idx + query.length
  }
  return decorations
}

/**
 * Compute search decorations from source text (parses to visible text first).
 * Convenience wrapper for components that have the raw markdown source.
 *
 * @param sourceText - Raw markdown text (will be parsed to plain text for searching)
 * @param query - The search query string
 * @param isCurrent - Whether this is the currently focused match
 */
export function computeSearchDecorationsFromSource(
  sourceText: string,
  query: string,
  isCurrent: boolean,
): TextDecoration[] {
  if (!query) return []
  const visibleText = parseToPlainText(sourceText)
  return computeSearchDecorations(visibleText, query, isCurrent)
}
