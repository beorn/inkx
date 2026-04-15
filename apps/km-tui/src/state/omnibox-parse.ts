/**
 * Omnibox query parser — Phase 2 of km-tui.omnibox-query-syntax.
 *
 * Pure: `parseQuery(raw) → ParsedQuery`. No side effects, no store access.
 *
 * The ranker and node-search layers will consume `ParsedQuery` in a follow-up
 * phase; this module only defines the types and the parser. See
 * `docs/design/omnibox.md` for the surface language and motivation.
 *
 * Mode derivation is shared with `modeOf(buffer)` in `./omnibox.ts` — both
 * functions agree on the leading-sigil → mode mapping so that reducer state
 * and parsed queries never disagree on what mode the user is in.
 */

import { modeOf, type OmniboxMode } from "./omnibox.ts"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single query term. The ranker chooses its match strategy per-kind:
 *  - `smart`   — fuzzy / tiered score (default)
 *  - `phrase`  — literal substring, case-insensitive, from a quoted string
 *  - `exact`   — literal substring, case-sensitive (`'foo` sigil)
 *  - `prefix`  — starts-with (`^foo`)
 *  - `suffix`  — ends-with (`foo$`)
 */
export type QueryTermKind = "smart" | "phrase" | "exact" | "prefix" | "suffix"

export interface QueryTerm {
  kind: QueryTermKind
  value: string
  /** `-foo` or `!foo` — the term must NOT appear in the result. */
  negated: boolean
}

/** Task-status bracket filter. Examples: `[]`, `[x]`, `[ ]`, `[/]`, `[-]`, `[.]` */
export type TaskStatusFilter = "any" | "todo" | "done" | "wip" | "blocked" | "dropped"

/**
 * Property filter as `key::value`. v1 minimum keys: due, priority, status,
 * assignee. The parser does not validate keys — unknown keys become property
 * filters the ranker can ignore or surface as hints.
 */
export interface PropertyFilter {
  /** Left-hand side of `::` — e.g. "due", "priority", "status", "assignee". */
  key: string
  /** `::` → eq, `::<` → lt, `::>` → gt, `::<=` → le, `::>=` → ge. */
  op: "eq" | "lt" | "gt" | "le" | "ge"
  /** Right-hand side of `::` after the operator prefix has been stripped. */
  value: string
}

export interface ParsedQuery {
  /** Raw source buffer, preserved verbatim for fuzzy scorers that want sigils. */
  raw: string
  /** Resolved mode derived from the leading sigil (or `"universal"`). */
  mode: OmniboxMode
  /** Query body with the leading sigil stripped (if any). */
  body: string
  /** smart / phrase / exact / prefix / suffix terms, in source order. */
  terms: QueryTerm[]
  /** Bracket task filter if present, else `null`. */
  taskStatus: TaskStatusFilter | null
  /** Property filters from `key::value` tokens, in source order. */
  properties: PropertyFilter[]
}

// ---------------------------------------------------------------------------
// Bracket task-filter recognition
// ---------------------------------------------------------------------------

/**
 * Map a bracket token (including the brackets) to its task-status filter, or
 * `null` if the token doesn't match the recognized set. The recognized set is
 * exactly: `[]`, `[x]`, `[ ]`, `[/]`, `[-]`, `[.]`.
 */
function matchBracketFilter(token: string): TaskStatusFilter | null {
  switch (token) {
    case "[]":
      return "any"
    case "[x]":
    case "[X]":
      return "done"
    case "[ ]":
      return "todo"
    case "[/]":
      return "wip"
    case "[-]":
      return "dropped"
    case "[.]":
      return "blocked"
    default:
      return null
  }
}

/**
 * Look for a leading bracket filter at position 0 of the raw buffer. Returns
 * the matched filter and the length consumed, or `null` if the buffer does
 * not start with a recognized bracket token. Used to disambiguate the `[`
 * `[x]`-style task filter from any ordinary `[`-prefixed content — if a
 * filter matches at position 0, the filter is consumed and the mode stays
 * "universal". `[` is NOT a sigil (it's the task-filter + wikilink bracket);
 * non-matching `[...` just becomes a plain smart term.
 */
function leadingBracketFilter(raw: string): { filter: TaskStatusFilter; length: number } | null {
  if (raw.length === 0 || raw[0] !== "[") return null
  // Try 2-char (`[]`) and 3-char (`[x]`, `[ ]`, `[/]`, `[-]`, `[.]`) candidates.
  for (const len of [3, 2] as const) {
    if (raw.length < len) continue
    const candidate = raw.slice(0, len)
    const filter = matchBracketFilter(candidate)
    if (filter != null) return { filter, length: len }
  }
  return null
}

// ---------------------------------------------------------------------------
// Tokenizer — splits a body string into whitespace-delimited tokens, with
// quoted phrases kept as a single token (quotes retained for downstream
// classification).
// ---------------------------------------------------------------------------

function tokenize(body: string): string[] {
  const tokens: string[] = []
  let i = 0
  const n = body.length
  while (i < n) {
    const ch = body[i]!
    if (ch === " " || ch === "\t") {
      i++
      continue
    }
    if (ch === '"') {
      // Consume a quoted phrase up to the next `"` or end of string.
      let j = i + 1
      while (j < n && body[j] !== '"') j++
      // Include the closing quote if present.
      const end = j < n ? j + 1 : j
      tokens.push(body.slice(i, end))
      i = end
      continue
    }
    // Plain token — consume until the next whitespace.
    let j = i
    while (j < n && body[j] !== " " && body[j] !== "\t") j++
    tokens.push(body.slice(i, j))
    i = j
  }
  return tokens
}

// ---------------------------------------------------------------------------
// Token classification
// ---------------------------------------------------------------------------

/**
 * Parse a `key::value` property-filter token into a `PropertyFilter`, or
 * return `null` if the token doesn't match the grammar. The `::` separator
 * must be present and `key` must be non-empty; operator prefixes (`<`, `>`,
 * `<=`, `>=`) are stripped from the value side.
 */
function parsePropertyFilter(token: string): PropertyFilter | null {
  const sepIndex = token.indexOf("::")
  if (sepIndex <= 0) return null
  const key = token.slice(0, sepIndex)
  const rhs = token.slice(sepIndex + 2)
  // Longest-prefix first so `<=` wins over `<`.
  if (rhs.startsWith("<=")) return { key, op: "le", value: rhs.slice(2) }
  if (rhs.startsWith(">=")) return { key, op: "ge", value: rhs.slice(2) }
  if (rhs.startsWith("<")) return { key, op: "lt", value: rhs.slice(1) }
  if (rhs.startsWith(">")) return { key, op: "gt", value: rhs.slice(1) }
  return { key, op: "eq", value: rhs }
}

/**
 * Classify a single (non-whitespace) token. Possible outcomes, in priority
 * order:
 *   1. Bracket task filter (`[x]`, etc.)      → `{ task: ... }`
 *   2. Property filter (`key::value`)          → `{ property: ... }`
 *   3. Negated term (`-foo`, `!foo`)           → `{ term: ... }`
 *   4. Quoted phrase (`"hello world"`)         → `{ term: phrase }`
 *   5. Exact (`'foo`)                          → `{ term: exact }`
 *   6. Prefix (`^foo`)                         → `{ term: prefix }`
 *   7. Suffix (`foo$`)                         → `{ term: suffix }`
 *   8. Plain smart term                        → `{ term: smart }`
 *
 * Tokens with `value === ""` after modifier-stripping are dropped by the
 * caller.
 */
type Classified =
  | { kind: "task"; filter: TaskStatusFilter }
  | { kind: "property"; filter: PropertyFilter }
  | { kind: "term"; term: QueryTerm }
  | { kind: "empty" }

function classifyToken(token: string): Classified {
  if (token.length === 0) return { kind: "empty" }

  // (1) Task filter — `[x]`, `[]`, etc.
  const bracket = matchBracketFilter(token)
  if (bracket != null) return { kind: "task", filter: bracket }

  // (2) Property filter — `key::value`. Check before negation so that
  //     `!key::value` could in theory negate a property, but v1 only supports
  //     plain property filters so we only match unmodified tokens here.
  const prop = parsePropertyFilter(token)
  if (prop != null) return { kind: "property", filter: prop }

  // (3) Negation prefix — `-foo` / `!foo`. The negated body is re-classified
  //     as a smart term (v1 does not compose negation with other modifiers).
  if ((token[0] === "-" || token[0] === "!") && token.length > 1) {
    const body = token.slice(1)
    if (body.length === 0) return { kind: "empty" }
    return { kind: "term", term: { kind: "smart", value: body, negated: true } }
  }

  // (4) Quoted phrase — `"hello world"`. Strip the quotes; tolerate a missing
  //     closing quote (user is mid-typing).
  if (token[0] === '"') {
    const end = token.endsWith('"') && token.length >= 2 ? token.length - 1 : token.length
    const value = token.slice(1, end)
    if (value.length === 0) return { kind: "empty" }
    return { kind: "term", term: { kind: "phrase", value, negated: false } }
  }

  // (5) Exact — `'foo`.
  if (token[0] === "'" && token.length > 1) {
    return { kind: "term", term: { kind: "exact", value: token.slice(1), negated: false } }
  }

  // (6) Prefix — `^foo`.
  if (token[0] === "^" && token.length > 1) {
    return { kind: "term", term: { kind: "prefix", value: token.slice(1), negated: false } }
  }

  // (7) Suffix — `foo$`. Length >1 and trailing `$` must not be the only char.
  if (token.length > 1 && token[token.length - 1] === "$") {
    return { kind: "term", term: { kind: "suffix", value: token.slice(0, -1), negated: false } }
  }

  // (8) Plain smart term.
  return { kind: "term", term: { kind: "smart", value: token, negated: false } }
}

// ---------------------------------------------------------------------------
// Top-level parser
// ---------------------------------------------------------------------------

/**
 * Pure parser: turn a raw omnibox buffer string into a structured
 * `ParsedQuery`. The raw buffer is preserved verbatim in `ParsedQuery.raw`;
 * all other fields are derived.
 *
 * Algorithm:
 *   1. Detect a leading bracket task filter (`[x]`, `[]`, etc.) at position
 *      0. If present, the filter is recorded, the filter chars are consumed,
 *      and the mode stays "universal" (the `[` is NOT treated as a sigil).
 *   2. Otherwise, derive `mode` via `modeOf()` and strip the leading sigil
 *      from `body` if it is a known sigil.
 *   3. `local_find` (leading `/`) is a pass-through: mode is set but the `/`
 *      is NOT stripped from `body` — the parser leaves that for the ranker.
 *   4. Tokenize the remaining body and classify each token as a task filter,
 *      property filter, or query term.
 */
export function parseQuery(raw: string): ParsedQuery {
  // (1) Empty → universal, nothing else.
  if (raw.length === 0) {
    return { raw, mode: "universal", body: "", terms: [], taskStatus: null, properties: [] }
  }

  // (2) Leading bracket-filter recognition. `[` is not a sigil; if this
  //     matches, the filter is consumed and mode stays universal.
  let mode: OmniboxMode
  let body: string
  let taskStatus: TaskStatusFilter | null = null

  const leading = leadingBracketFilter(raw)
  if (leading != null) {
    mode = "universal"
    taskStatus = leading.filter
    body = raw.slice(leading.length)
  } else {
    mode = modeOf(raw)
    // Strip the leading sigil for all modes EXCEPT `local_find` and
    // `universal`. `local_find` keeps the `/` (parser contract). `universal`
    // means there was no sigil.
    if (mode === "universal" || mode === "local_find") {
      body = raw
    } else {
      body = raw.slice(1)
    }
  }

  // (3) Tokenize and classify.
  const tokens = tokenize(body)
  const terms: QueryTerm[] = []
  const properties: PropertyFilter[] = []
  for (const token of tokens) {
    const classified = classifyToken(token)
    switch (classified.kind) {
      case "task":
        // First bracket filter wins. Subsequent brackets are ignored — the
        // ranker can surface a hint if it cares about overspecified queries.
        if (taskStatus == null) taskStatus = classified.filter
        break
      case "property":
        properties.push(classified.filter)
        break
      case "term":
        terms.push(classified.term)
        break
      case "empty":
        break
    }
  }

  return { raw, mode, body, terms, taskStatus, properties }
}
