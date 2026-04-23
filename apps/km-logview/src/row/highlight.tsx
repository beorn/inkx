/** Highlights character-range matches of a search query inside a string by wrapping matched slices in a warning-colored Text node. */
import React from "react"
import { Text, computeMatchRanges } from "silvery"
import type { MatchRange } from "silvery"

/**
 * Split `text` around the given match ranges and wrap each match in a
 * highlighted Text. Ranges are 0-based `[start, end)` character offsets —
 * same convention as `String.prototype.slice`. Ranges must be in ascending
 * `start` order.
 *
 * When `ranges` is empty, returns the plain string unchanged.
 *
 * Highlight ranges are sourced from silvery's canonical search-match
 * algorithm: `ListView` passes `ListItemMeta.matchRanges` into `renderItem`
 * (computed from the active query + `search.getText(item)`), and
 * multi-segment consumers call `computeMatchRanges(segment, query)`
 * directly on each segment (see `highlightQuery` below).
 */
export function highlight(text: string, ranges: readonly MatchRange[]): React.ReactNode {
  if (ranges.length === 0 || text === "") return text
  const nodes: React.ReactNode[] = []
  let cursor = 0
  let key = 0
  for (const { start, end } of ranges) {
    // Skip malformed / out-of-order ranges gracefully so a bad range can't
    // truncate later text.
    if (end <= cursor || start >= text.length) continue
    const clampedStart = Math.max(cursor, start)
    const clampedEnd = Math.min(text.length, end)
    if (clampedStart > cursor) nodes.push(text.slice(cursor, clampedStart))
    nodes.push(
      <Text key={`hl${key++}`} backgroundColor="$bg-warning" color="$fg-on-warning" bold>
        {text.slice(clampedStart, clampedEnd)}
      </Text>,
    )
    cursor = clampedEnd
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes.length === 1 ? nodes[0] : <>{nodes}</>
}

/**
 * Convenience wrapper for per-segment highlighting: compute the match
 * ranges for `text` against `query` using silvery's canonical algorithm,
 * then render the highlighted output. Empty `query` returns the plain
 * string (fast path, no allocation).
 *
 * Used by LogRow's multi-segment layout where whole-item match ranges
 * from `ListItemMeta.matchRanges` can't be projected onto individual
 * pills / body lines — each Text node computes its own ranges against
 * the shared query.
 */
export function highlightQuery(text: string, query: string): React.ReactNode {
  if (query === "" || text === "") return text
  return highlight(text, computeMatchRanges(text, query))
}
