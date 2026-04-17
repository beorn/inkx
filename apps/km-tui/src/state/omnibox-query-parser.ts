/**
 * Omnibox Query Parser — Phase 2a
 *
 * Parses omnibox query strings into a ParsedQuery value. This is the single
 * source of truth for query interpretation; the ranker and highlighter both
 * consume ParsedQuery (never the raw string).
 *
 * v1 operators (this file):
 *   - `foo`           — smart match (bare term)
 *   - `"foo bar"`     — exact phrase (Google)
 *   - `-foo` / `!foo` — exclude term
 *   - `@foo` / `#foo` / `+foo` / `[foo` — sigils (set sigil scope, term is body)
 *   - `[]` / `[ ]` / `[x]` / `[/]` / `[-]` / `[.]` — bracket task filters
 *   - space           — AND
 *
 * Deferred to v1.1 (intentionally unimplemented; see TODOs below):
 *   - `^foo`          — starts-with (fzf)
 *   - `foo$`          — ends-with (fzf)
 *   - `'foo`          — exact substring (fzf)
 *   - property filters (`due::today`, `priority::p0`, …)
 *
 * Bead: km-tui.omnibox-query-syntax (parser) and km-tui.omnibox-ranker (ranker).
 */

// =============================================================================
// Types
// =============================================================================

/**
 * A single parsed term from the query. The ranker walks these in order and
 * the highlighter uses them to build spans.
 *
 * `kind`:
 *   - "smart"   — default fuzzy/substring/prefix match against the target
 *   - "phrase"  — exact phrase match (from `"..."`)
 *   - "exact"   — reserved for v1.1 fzf `'foo` — treated as smart in v1
 *   - "prefix"  — reserved for v1.1 fzf `^foo` — treated as smart in v1
 *   - "suffix"  — reserved for v1.1 fzf `foo$` — treated as smart in v1
 */
export interface QueryTerm {
  kind: "smart" | "phrase" | "exact" | "prefix" | "suffix"
  value: string
  negated: boolean
}

/** One of the four sigil families that restrict the candidate pool. */
export type QuerySigil = "@" | "#" | "+" | "["

/** Bracket task filter — what task statuses survive. */
export type TaskFilter = "any" | "todo" | "done" | "wip" | "blocked" | "dropped"

/**
 * A parsed omnibox query. Consumed directly by the ranker and highlighter —
 * they never re-parse the raw string.
 */
export interface ParsedQuery {
  /** Ordered list of terms — AND-combined, respecting `negated`. */
  terms: QueryTerm[]
  /** Optional sigil scope. When present, candidate filtering is restricted. */
  sigil?: QuerySigil
  /** Optional task filter from the bracket family. */
  taskFilter?: TaskFilter
  /** Original raw query string, preserved for debugging + chips UI. */
  raw: string
}

// =============================================================================
// Parser
// =============================================================================

const BRACKET_TASK_FILTERS: Record<string, TaskFilter> = {
  "[]": "any",
  "[ ]": "todo",
  "[x]": "done",
  "[X]": "done",
  "[/]": "wip",
  "[!]": "blocked",
  "[-]": "dropped",
  "[.]": "blocked", // '.' accepted as legacy alias for blocked per bead spec
}

/**
 * Parse an omnibox query string.
 *
 * Precedence (documented for the parsing-ambiguity concern in the bead notes):
 *   1. Leading bracket-task tokens are consumed first (`[]`, `[ ]`, `[x]`, …).
 *      If the bracket is followed by non-space chars (e.g. `[foo`), it is a
 *      SIGIL not a task filter.
 *   2. Leading sigil `@#+[` (single char followed by text) sets sigil scope;
 *      the body after the sigil becomes a smart term.
 *   3. After sigil/bracket consumption, the remainder is tokenized on spaces
 *      (respecting `"..."` quoting).
 *   4. Each token with a leading `-` or `!` becomes `negated`.
 *   5. Quoted tokens become phrase terms.
 *
 * Escape: `"#foo"` forces `#foo` to be a literal phrase term, not a sigil.
 */
export function parseQuery(raw: string): ParsedQuery {
  const query: ParsedQuery = { terms: [], raw }
  let rest = raw.trim()
  if (!rest) return query

  // --- Step 1: leading bracket task filter (must be followed by end/space) ---
  // Scan for leading bracket token matched exactly.
  for (const token of Object.keys(BRACKET_TASK_FILTERS)) {
    if (rest === token || rest.startsWith(token + " ")) {
      query.taskFilter = BRACKET_TASK_FILTERS[token]!
      rest = rest.slice(token.length).trimStart()
      break
    }
  }

  // --- Step 2: leading sigil (@ # + [) — only if not already a bracket filter ---
  if (!query.taskFilter && rest.length > 0) {
    const first = rest[0]!
    if (first === "@" || first === "#" || first === "+" || first === "[") {
      // `[` is a sigil ONLY if followed by a non-bracket-closing char and no task filter matched.
      if (first !== "[" || (rest[1] !== "]" && rest[1] !== " " && rest[1] !== undefined)) {
        query.sigil = first
        rest = rest.slice(1)
      }
    }
  }

  // --- Step 3: tokenize rest, respecting quotes ---
  const tokens = tokenize(rest)
  for (const tok of tokens) {
    const term = toTerm(tok)
    if (term) query.terms.push(term)
  }

  return query
}

/**
 * Tokenize on spaces, but keep `"..."` as one token (without the quotes).
 * Preserves a leading `-`/`!` on the outer token.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < input.length) {
    while (i < input.length && input[i] === " ") i++
    if (i >= input.length) break

    // Start of a token. A leading negation sign travels with the token.
    const tokStart = i
    let inQuotes = false
    while (i < input.length) {
      const c = input[i]!
      if (c === '"') {
        inQuotes = !inQuotes
        i++
        continue
      }
      if (!inQuotes && c === " ") break
      i++
    }
    tokens.push(input.slice(tokStart, i))
  }
  return tokens
}

/**
 * Convert a raw token ("foo", "-foo", "\"foo bar\"", "!foo") into a QueryTerm.
 * Returns null for empty / malformed tokens (bare `-` or `""`).
 *
 * TODO(v1.1): add handling for `^foo` (prefix), `foo$` (suffix), `'foo` (exact
 * substring), and property filters `due::today` / `priority::p0` / `key::value`.
 */
function toTerm(tok: string): QueryTerm | null {
  if (!tok) return null

  let negated = false
  let body = tok
  if (body.startsWith("-") || body.startsWith("!")) {
    negated = true
    body = body.slice(1)
  }
  if (!body) return null

  // Quoted phrase — strip the quotes. Tolerate a stray unterminated trailing
  // quote by removing it; leading quote requires a matching trailing quote to
  // count as a phrase.
  if (body.startsWith('"') && body.endsWith('"') && body.length >= 2) {
    const inner = body.slice(1, -1)
    if (!inner) return null
    return { kind: "phrase", value: inner, negated }
  }

  // TODO(v1.1): ^prefix, suffix$, 'exact, key::value are parsed as smart today.
  return { kind: "smart", value: body, negated }
}

// =============================================================================
// Helpers for consumers
// =============================================================================

/** True if the parsed query has no constraints (no terms, sigil, or taskFilter). */
export function isEmptyQuery(q: ParsedQuery): boolean {
  return q.terms.length === 0 && q.sigil === undefined && q.taskFilter === undefined
}

/** Positive (non-negated) terms only — useful for the highlighter. */
export function positiveTerms(q: ParsedQuery): QueryTerm[] {
  return q.terms.filter((t) => !t.negated)
}
