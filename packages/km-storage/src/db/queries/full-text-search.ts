/**
 * Full-Text Search Queries
 *
 * FTS5-based full-text search with snippet highlighting.
 */

import type { Database } from "bun:sqlite"
import { createLogger } from "loggily"
import type { KNode } from "@km/core"
import { rowToNode } from "./utils.ts"

const log = createLogger("km:storage:db:queries")

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
      const term = token.slice(1)
      const escaped = escapeFts5Token(term)
      if (escaped) parts.push(`NOT ${escaped}`)
    } else {
      // Regular term with prefix matching
      const escaped = escapeFts5Token(token)
      if (escaped) parts.push(escaped)
    }
  }

  return parts.join(" ")
}

/**
 * Escape a token for safe use in FTS5 queries.
 *
 * FTS5 has many special characters (-, `, ^, :, (, ), etc.) that cause
 * query parse errors when used raw. Strategy:
 * - Strip punctuation that isn't part of a valid token, keeping sigils
 * - If the token contains a sigil, quote it (FTS5 query syntax requires
 *   that tokens starting with non-alphanumeric chars be quoted)
 * - Append prefix-match `*` for prefix search
 * - Returns null for tokens that are entirely noise
 *
 * Sigils `@ # + ~` are preserved because the FTS5 tokenizer (unicode61 with
 * tokenchars='@#+~') keeps them as part of the token. See schema.ts. Without
 * this, an omnibox query for "@next" would be rewritten to "next*" and lose
 * the sigil anchor. `[` is NOT a sigil — it's the task-filter / wikilink
 * delimiter and gets stripped with other punctuation.
 *
 * Quoting: FTS5 rejects bare tokens like `@next*` with a syntax error
 * ("syntax error near @"). Wrapping in double quotes — `"@next"*` — passes
 * the query as a phrase literal that the tokenizer still treats as one term.
 * This works for plain tokens too (`"hello"*`), so we quote unconditionally
 * when sigils are present and leave plain tokens bare for slightly nicer
 * query plans.
 */
function escapeFts5Token(token: string): string | null {
  // Keep word chars and sigils (@#+~) — strip everything else, including
  // `[` / `]` which are wikilink + task-filter delimiters, not identity sigils.
  const cleaned = token.replace(/[^\p{L}\p{N}_@#+~]/gu, "")
  if (cleaned.length === 0) return null
  // Tokens containing a sigil must be quoted in FTS5 query syntax, otherwise
  // the parser chokes on `@` / `#` / `+` / `~` as operators.
  const needsQuoting = /[@#+~]/.test(cleaned)
  if (needsQuoting) return `"${cleaned}"*`
  return `${cleaned}*`
}

/**
 * Full-text search with identity-biased ranking.
 *
 * Uses FTS5's `bm25(table, ...weights)` auxiliary function with per-column
 * weights to produce the identity-first ordering the omnibox needs:
 *
 *   id      × 1.0   — rarely typed, but an exact match is meaningful
 *   name    × 3.0   — filename / alias; strongest identity signal
 *   title   × 2.0   — H1 / section heading; medium weight (km convention
 *                    puts `@person` / `#topic` in section titles as tag
 *                    annotations, which we rank below name)
 *   content × 1.0   — body text; baseline
 *
 * The `bm25()` function returns the NEGATED BM25 score (lower = better)
 * so `ORDER BY bm25(...) ASC` sorts best-match first. Depth is a secondary
 * tie-breaker: we add `slashes_in_fs_path * 0.1` as a small positive
 * penalty so shallower nodes beat deeper nodes with identical relevance
 * (the vault-root `@next.md` beats a nested `personal/2026/@next.md`).
 *
 * Why not a JS post-pass for identity bias? Because `bm25(table, weights)`
 * is the exact mechanism FTS5 provides for this — precomputed in the
 * index, applied in C, consistent with the literature. Any JS scorer is
 * reimplementing BM25 with worse characteristics. See docs/design/omnibox.md
 * § "Why BM25 column weights" for the full design rationale.
 */
export function search(db: Database, query: string, limit = 50): KNode[] {
  const ftsQuery = toFts5Query(query)

  // Empty FTS query (e.g., user typed only special characters) — return no results
  if (!ftsQuery) return []

  log.debug?.(`search: ${query} → fts5: ${ftsQuery}`)

  try {
    const rows = db
      .query(
        `
    SELECT n.* FROM nodes n
    JOIN nodes_fts f ON n.id = f.id
    WHERE nodes_fts MATCH ?
    ORDER BY
      bm25(nodes_fts, 1.0, 3.0, 2.0, 1.0)
      + (LENGTH(COALESCE(n.fs_path, '')) - LENGTH(REPLACE(COALESCE(n.fs_path, ''), '/', ''))) * 0.1
    LIMIT ?
  `,
      )
      .all(ftsQuery, limit) as Record<string, unknown>[]

    log.debug?.(`search: found ${rows.length} results`)
    return rows.map(rowToNode)
  } catch (err) {
    // FTS5 can reject queries that slip past our escaping — return empty rather than crash
    log.debug?.(`search: FTS5 error for "${ftsQuery}": ${String(err)}`)
    return []
  }
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

  // Empty FTS query (e.g., user typed only special characters) — return no results
  if (!ftsQuery) return []

  const { startMark = "<<", endMark = ">>", ellipsis = "...", maxTokens = 32 } = snippetOptions

  try {
    // Use snippet() function for highlighting.
    // snippet(fts_table, column_idx, start_mark, end_mark, ellipsis, max_tokens)
    // Column order matches nodes_fts DDL: 0=id, 1=name, 2=title, 3=content.
    // We snippet the content column (3) — that's where prose lives.
    // Same identity-biased ranking as `search()` — see the weights + depth
    // penalty comment there. The snippet column is rendered separately.
    const rows = db
      .query(
        `
    SELECT n.*, snippet(nodes_fts, 3, ?, ?, ?, ?) as snippet
    FROM nodes n
    JOIN nodes_fts f ON n.id = f.id
    WHERE nodes_fts MATCH ?
    ORDER BY
      bm25(nodes_fts, 1.0, 3.0, 2.0, 1.0)
      + (LENGTH(COALESCE(n.fs_path, '')) - LENGTH(REPLACE(COALESCE(n.fs_path, ''), '/', ''))) * 0.1
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
  } catch (err) {
    log.debug?.(`searchWithSnippet: FTS5 error for "${ftsQuery}": ${String(err)}`)
    return []
  }
}
