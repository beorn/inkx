/** Highlights case-insensitive substring matches of a search query inside a string by wrapping matched slices in a warning-colored Text node. */
import React from "react"
import { Text } from "silvery"

/**
 * Split a string around all case-insensitive occurrences of `query` and
 * wrap the match slices in a highlighted Text. When `query` is empty or
 * absent, returns the plain string. Used to visually mark search results
 * inside any rendered string in the row.
 *
 * The underlying ListView search machinery (silvery/SearchProvider) finds
 * matches at the level of a concatenated "virtual stream" of row fields,
 * but doesn't propagate per-field match ranges down to `renderItem`. So
 * each call site re-runs a simple indexOf against its own slice of text —
 * cheap, correct, and avoids coordinating coordinates across silvery.
 *
 * Tracked as a silvery enhancement: pass match ranges to ListItemMeta so
 * consumers don't have to re-search.
 */
export function highlight(text: string, query: string): React.ReactNode {
  if (query === "" || text === "") return text
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const nodes: React.ReactNode[] = []
  let cursor = 0
  let key = 0
  while (cursor < text.length) {
    const found = lowerText.indexOf(lowerQuery, cursor)
    if (found === -1) {
      nodes.push(text.slice(cursor))
      break
    }
    if (found > cursor) nodes.push(text.slice(cursor, found))
    nodes.push(
      <Text key={`hl${key++}`} backgroundColor="$bg-warning" color="$fg-on-warning" bold>
        {text.slice(found, found + query.length)}
      </Text>,
    )
    cursor = found + query.length
  }
  return nodes.length === 1 ? nodes[0] : <>{nodes}</>
}
