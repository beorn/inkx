/**
 * Full-Text Search Queries
 *
 * FTS5-based full-text search with snippet highlighting.
 */

import type { Database } from "bun:sqlite"
import { createlogger } from "@beorn/logger"
import type { KNode } from "@km/core"
import { rowToNode } from "./utils.ts"

const log = createlogger("km:storage:db:queries")

// =============================================================================
// Full-Text Search
// =============================================================================

/**
 * Convert a search query to FTS5 syntax
 * - Quoted phrases become FTS5 phrase queries
 * - Unquoted terms use prefix matching with *
 */
export function toFts5Query(query: string): string {
  const parts: string[] = []

  // Extract quoted phrases and replace with placeholders
  const phrases: string[] = []
  const remaining = query.replace(/"([^"]+)"/g, (_, phrase) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Regex capture group is string
    phrases.push(phrase)
    return `__PHRASE_${phrases.length - 1}__`
  })

  // Split remaining into tokens
  const tokens = remaining.split(/\s+/).filter((t) => t.length > 0)

  for (const token of tokens) {
    // Check if this is a phrase placeholder
    const phraseMatch = token.match(/^__PHRASE_(\d+)__$/)
    if (phraseMatch?.[1] !== undefined) {
      const idx = parseInt(phraseMatch[1], 10)
      const phrase = phrases[idx]
      if (phrase !== undefined) {
        // FTS5 phrase syntax: "word1 word2 word3"
        parts.push(`"${phrase}"`)
      }
    } else if (token.startsWith("-")) {
      // Negation: NOT term
      parts.push(`NOT ${token.slice(1)}*`)
    } else {
      // Regular term with prefix matching
      parts.push(`${token}*`)
    }
  }

  return parts.join(" ")
}

/**
 * Full-text search
 */
export function search(db: Database, query: string, limit = 50): KNode[] {
  const ftsQuery = toFts5Query(query)

  log.debug?.(`search: ${query} → fts5: ${ftsQuery}`)

  const rows = db
    .query(
      `
    SELECT n.* FROM nodes n
    JOIN nodes_fts f ON n.id = f.id
    WHERE nodes_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `,
    )
    .all(ftsQuery, limit) as Record<string, unknown>[]

  log.debug?.(`search: found ${rows.length} results`)
  return rows.map(rowToNode)
}

/**
 * Search result with snippet highlighting
 */
export interface SearchResult {
  node: KNode
  snippet: string
}

/**
 * Full-text search with snippet highlighting
 *
 * Returns nodes with a snippet showing matching context.
 * Uses FTS5 snippet() function for efficient highlighting.
 *
 * @param db - Database instance
 * @param query - Search query (supports "quoted phrases" and individual terms)
 * @param limit - Maximum results to return
 * @param snippetOptions - Options for snippet generation
 * @returns Array of search results with highlighted snippets
 */
export function searchWithSnippet(
  db: Database,
  query: string,
  limit = 50,
  snippetOptions: {
    startMark?: string
    endMark?: string
    ellipsis?: string
    maxTokens?: number
  } = {},
): SearchResult[] {
  const ftsQuery = toFts5Query(query)

  const {
    startMark = "<<",
    endMark = ">>",
    ellipsis = "...",
    maxTokens = 32,
  } = snippetOptions

  // Use snippet() function for highlighting
  // snippet(fts_table, column_idx, start_mark, end_mark, ellipsis, max_tokens)
  // column_idx 1 = content column
  const rows = db
    .query(
      `
    SELECT n.*, snippet(nodes_fts, 1, ?, ?, ?, ?) as snippet
    FROM nodes n
    JOIN nodes_fts f ON n.id = f.id
    WHERE nodes_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `,
    )
    .all(startMark, endMark, ellipsis, maxTokens, ftsQuery, limit) as Array<
    Record<string, unknown> & { snippet: string }
  >

  return rows.map((row) => ({
    node: rowToNode(row),
    snippet: row.snippet ?? "",
  }))
}
