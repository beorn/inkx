/**
 * Omnibox Ranker — Phase 2b
 *
 * Shared ranker + highlighter. Consumes a ParsedQuery (never a raw string)
 * and ranks a candidate KNode list. Also exports `highlightMatches`, used
 * by the row renderer and (later) the local-find in-place highlighter.
 *
 * Contract:
 *   rankResults(parsedQuery, candidates, opts?) -> ScoredResult[]
 *   highlightMatches(text, parsedQuery) -> HighlightSpan[]
 *
 * Ranking rules (per-term, summed):
 *   Tier 1: exact match             → 10000+
 *   Tier 2: prefix match             → 5000+
 *   Tier 3: segment-boundary substr  → 2000+
 *   Tier 4: generic substring        → 1000+
 *   Tier 5: char-order fuzzy         → 0–999
 *
 * Plus per-field weights (title > name > content/path) and stable-sort
 * by id so ties are deterministic.
 *
 * Bead: km-tui.omnibox-ranker. Replaces the per-call fuzzyScore() loop in
 * ItemPicker.filterOptions (km-tui.picker-rank-subpath is already fixed in
 * commit 6de2f918d — that tiered floor is the starting point here).
 *
 * `opts.recencyBoost` receives a node id and returns an additive bonus
 * applied to the final score. Wired by callers to `getRecentsStore().getNodeBoost()`
 * (see km-tui.omnibox-recents, `state/recents-store.ts`).
 *
 * Empty-query behavior: when the query has no terms, `rankResults` returns
 * all candidates that pass sigil/task filters. If `recencyBoost` is supplied,
 * the list is sorted by bonus desc (with 0s ordered alphabetically at the
 * end); otherwise it falls back to the historic title-alphabetical sort.
 */
import type { KNode } from "@km/core"
import type { ParsedQuery, QueryTerm } from "./omnibox-query-parser.ts"
import { isEmptyQuery } from "./omnibox-query-parser.ts"

// =============================================================================
// Types
// =============================================================================

/** One contiguous range of matched characters in a target string. Half-open. */
export interface HighlightSpan {
  start: number
  end: number
}

/** A ranked candidate with its score and (optional) title-level highlights. */
export interface ScoredResult {
  node: KNode
  score: number
  highlights?: HighlightSpan[]
}

/**
 * A lightweight façade over a KNode letting callers supply display-specific
 * fields (the loader-provided title, parentContext, full path) instead of
 * relying on raw node.content. ItemPicker populates this from its PickerOption.
 */
export interface RankCandidate {
  node: KNode
  /** Primary display string for ranking (title wins; also drives highlights). */
  title: string
  /** Optional parent-context text — ranked with a 0.8× multiplier. */
  parentContext?: string | null
  /** Optional full-path string — ranked with a 0.6× multiplier. */
  path?: string | null
}

export interface RankOptions {
  /**
   * Optional recency bonus, added to the final score. TODO: wire to
   * km-tui.omnibox-recents once that bead ships — until then always 0.
   */
  recencyBoost?: (nodeId: string) => number
  /** Include zero-score candidates (useful for showing everything on empty query). */
  includeZeroScores?: boolean
}

// =============================================================================
// Sticky selection (result stability)
// =============================================================================

/**
 * Given a list of results and the previously-selected node id, return the
 * index of that node in the new result list. -1 if it's no longer there.
 *
 * Callers (ItemPicker, UnifiedOmnibox) should prefer this over snapping to
 * index 0 whenever the query changes — fixes the "fast typing + Enter hits
 * the wrong node" issue flagged in the bead's /big notes.
 */
export function stickySelectedIndex(results: ScoredResult[], previousNodeId: string | undefined): number {
  if (!previousNodeId) return -1
  for (let i = 0; i < results.length; i++) {
    if (results[i]!.node.id === previousNodeId) return i
  }
  return -1
}

// =============================================================================
// Primitive scoring — tiered per (term, target)
// =============================================================================

const SEGMENT_SEPARATORS = new Set(["/", ".", " ", "-", "_", "@", "#", "+", ":"])

function isSegmentBoundary(target: string, pos: number): boolean {
  if (pos === 0) return true
  return SEGMENT_SEPARATORS.has(target[pos - 1]!)
}

/** Lockstep char-order fuzzy check — query chars must appear in order in target. */
function fuzzyMatchAt(query: string, target: string): boolean {
  let qi = 0
  for (let i = 0; i < target.length && qi < query.length; i++) {
    if (target[i] === query[qi]) qi++
  }
  return qi === query.length
}

/**
 * Score one term against one target string. Higher = better. 0 = no match.
 *
 * Mirrors the search-utils.fuzzyScore tier floor (fixes picker-rank-subpath)
 * with one addition: `phrase` terms only match via exact substring (tier 1-4),
 * never fuzzy tier 5, because quoted phrases are literal.
 */
function scoreTermAgainst(term: QueryTerm, target: string): number {
  if (!target) return 0
  const q = term.value.toLowerCase()
  if (!q) return 0
  const t = target.toLowerCase()

  // Tier 1: exact match.
  if (t === q) return 10000 - t.length

  // Tier 2: prefix.
  if (t.startsWith(q)) return 5000 - (t.length - q.length)

  // Tiers 3 & 4: substring (segment-boundary vs mid-segment).
  const pos = t.indexOf(q)
  if (pos !== -1) {
    const trailing = t.length - (pos + q.length)
    if (isSegmentBoundary(t, pos)) return 2000 - pos * 2 - trailing
    return 1000 - pos * 2 - trailing
  }

  // Phrase terms are LITERAL — no fuzzy fallback.
  if (term.kind === "phrase") return 0

  // Tier 5: char-order fuzzy.
  if (!fuzzyMatchAt(q, t)) return 0
  let score = 0
  let qi = 0
  let consecutive = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      consecutive++
      score += consecutive * 2
      if (isSegmentBoundary(t, i)) score += 5
      qi++
    } else {
      consecutive = 0
    }
  }
  return Math.min(score, 999) - t.length * 0.1
}

/**
 * Score a term against a candidate. Returns the weighted max across the
 * candidate's fields (title > parentContext > path). Negated terms invert:
 * the function returns -Infinity if the candidate matches the negated term
 * (so the caller excludes it), 0 otherwise.
 */
function scoreTermForCandidate(term: QueryTerm, cand: RankCandidate): number {
  const titleScore = scoreTermAgainst(term, cand.title)
  const parentScore = cand.parentContext ? scoreTermAgainst(term, cand.parentContext) * 0.8 : 0
  const pathScore = cand.path ? scoreTermAgainst(term, cand.path) * 0.6 : 0
  const best = Math.max(titleScore, parentScore, pathScore)

  if (term.negated) {
    // A negated term that matches ANY field kills the candidate.
    return best > 0 ? Number.NEGATIVE_INFINITY : 0
  }
  return best
}

/**
 * Score a parsed query against a tuple of text fields (primary / secondary /
 * tertiary), applying the same tier-based scoring and negation rules as
 * `rankResults` — but without the KNode coupling. Useful for candidates
 * that are not KNodes (commands, registry entries, etc.).
 *
 * Returns 0 on "no match" (skip), NEGATIVE_INFINITY if a negated term hits
 * (caller should exclude).
 */
export function scoreTextFields(
  parsedQuery: ParsedQuery,
  fields: { primary: string; secondary?: string; tertiary?: string },
): number {
  if (parsedQuery.terms.length === 0) return 0
  let total = 0
  for (const term of parsedQuery.terms) {
    const pScore = scoreTermAgainst(term, fields.primary)
    const sScore = fields.secondary ? scoreTermAgainst(term, fields.secondary) * 0.8 : 0
    const tScore = fields.tertiary ? scoreTermAgainst(term, fields.tertiary) * 0.6 : 0
    const best = Math.max(pScore, sScore, tScore)
    if (term.negated) {
      if (best > 0) return Number.NEGATIVE_INFINITY
      continue
    }
    if (best <= 0) return 0
    total += best
  }
  return total
}

// =============================================================================
// Sigil + task filter
// =============================================================================

function taskStatusMatches(node: KNode, filter: NonNullable<ParsedQuery["taskFilter"]>): boolean {
  const status = node.item?.task?.status
  if (filter === "any") return status !== undefined
  return status === filter
}

/**
 * Node title/content for scoring. Prefers `name`, then `content` — matches
 * the convention used across picker-loaders and omnibox-row-adapters.
 */
function nodeDisplayText(node: KNode): string {
  return node.name ?? node.content ?? ""
}

// =============================================================================
// Type weights (per-bead "5 type weights")
// =============================================================================

const TYPE_WEIGHT: Record<string, number> = {
  h: 1.0, // headings / outline items — primary navigation target
  p: 0.9, // paragraph blocks
  code: 0.8,
  quote: 0.8,
  table: 0.7,
}

function typeWeight(node: KNode): number {
  return TYPE_WEIGHT[node.type] ?? 0.9
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Rank candidates against a parsed query. Returns results sorted by score
 * descending, with sticky id-based tiebreak for result-stability.
 *
 * Accepts either full `RankCandidate` objects or bare `KNode`s (which are
 * promoted to RankCandidate{ title: nodeDisplayText(node) }).
 */
export function rankResults(
  parsedQuery: ParsedQuery,
  candidates: readonly KNode[] | readonly RankCandidate[],
  opts: RankOptions = {},
): ScoredResult[] {
  const normalized: RankCandidate[] = candidates.map((c) => ("node" in c ? c : { node: c, title: nodeDisplayText(c) }))

  // Empty query: return all passing filters. If `recencyBoost` is provided,
  // surface MRU first (recents-bonus desc, alphabetic fallback for untouched
  // items); otherwise stable title-alphabetical.
  if (isEmptyQuery(parsedQuery)) {
    const rows = normalized
      .filter((c) => passesSigilFilter(c.node, parsedQuery) && passesTaskFilter(c.node, parsedQuery))
      .map((c) => ({
        node: c.node,
        score: opts.recencyBoost ? opts.recencyBoost(c.node.id) : 0,
        highlights: [] as HighlightSpan[],
      }))
    rows.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      const ta = nodeDisplayText(a.node).toLowerCase()
      const tb = nodeDisplayText(b.node).toLowerCase()
      return ta < tb ? -1 : ta > tb ? 1 : a.node.id < b.node.id ? -1 : 1
    })
    return rows
  }

  const scored: ScoredResult[] = []
  for (const cand of normalized) {
    if (!passesSigilFilter(cand.node, parsedQuery)) continue
    if (!passesTaskFilter(cand.node, parsedQuery)) continue

    // Sum per-term scores. AND semantics: any positive term scoring 0 kills
    // the candidate; any negated term that matches kills it via -Infinity.
    // Fall-through cases (terms.length === 0 or all-negated-with-no-hits)
    // get total === 0 and stay in the result set — correct for sigil-only
    // and exclude-only queries.
    let total = 0
    let killed = false
    for (const term of parsedQuery.terms) {
      const s = scoreTermForCandidate(term, cand)
      if (s === Number.NEGATIVE_INFINITY) {
        killed = true
        break
      }
      if (!term.negated && s <= 0) {
        killed = true
        break
      }
      total += s
    }
    if (killed) continue

    total *= typeWeight(cand.node)
    if (opts.recencyBoost) total += opts.recencyBoost(cand.node.id)

    scored.push({
      node: cand.node,
      score: total,
      highlights: highlightMatches(cand.title, parsedQuery),
    })
  }

  // Stable sort: score desc, then id asc for deterministic ties.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0
  })

  return scored
}

function passesSigilFilter(node: KNode, q: ParsedQuery): boolean {
  if (!q.sigil) return true
  // `[` = regular nodes only (exclude tasks). The parser already consumes
  // bracket task-filters (`[]`, `[x]`, etc.) into `q.taskFilter`, so sigil
  // `[` only reaches here for bare `[` or `[foo`-shaped queries.
  if (q.sigil === "[") return node.item?.task == null
  // Other sigils (@#+) prefix-match the node's display text.
  const txt = nodeDisplayText(node)
  if (!txt) return true
  return txt.startsWith(q.sigil)
}

function passesTaskFilter(node: KNode, q: ParsedQuery): boolean {
  if (!q.taskFilter) return true
  return taskStatusMatches(node, q.taskFilter)
}

// =============================================================================
// Highlight spans
// =============================================================================

/**
 * Return highlight spans for every positive term in the query against `text`.
 * Spans are on the ORIGINAL (case-preserving) text; overlapping spans from
 * different terms are merged.
 *
 * Typed spans only — no ANSI, no HTML. Renderers turn these into whatever
 * visual style they want.
 */
export function highlightMatches(text: string, parsedQuery: ParsedQuery): HighlightSpan[] {
  if (!text) return []
  const spans: HighlightSpan[] = []
  const lower = text.toLowerCase()

  for (const term of parsedQuery.terms) {
    if (term.negated) continue
    const q = term.value.toLowerCase()
    if (!q) continue

    if (term.kind === "phrase") {
      // Literal substring highlight for phrases.
      let pos = 0
      while (pos <= lower.length - q.length) {
        const found = lower.indexOf(q, pos)
        if (found === -1) break
        spans.push({ start: found, end: found + q.length })
        pos = found + q.length
      }
      continue
    }

    // Smart terms: prefer a contiguous substring match; fall back to
    // fzf-style per-char spans if the substring isn't found.
    const subPos = lower.indexOf(q)
    if (subPos !== -1) {
      spans.push({ start: subPos, end: subPos + q.length })
      continue
    }
    if (!fuzzyMatchAt(q, lower)) continue
    let qi = 0
    let spanStart = -1
    let lastEnd = -1
    for (let i = 0; i < lower.length && qi < q.length; i++) {
      if (lower[i] === q[qi]) {
        if (spanStart === -1) spanStart = i
        lastEnd = i + 1
        qi++
      } else if (spanStart !== -1) {
        spans.push({ start: spanStart, end: lastEnd })
        spanStart = -1
      }
    }
    if (spanStart !== -1) spans.push({ start: spanStart, end: lastEnd })
  }

  return mergeSpans(spans)
}

/** Merge overlapping / adjacent spans. Input may be unsorted. */
function mergeSpans(spans: HighlightSpan[]): HighlightSpan[] {
  if (spans.length <= 1) return spans
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const out: HighlightSpan[] = []
  let cur = { ...sorted[0]! }
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i]!
    if (s.start <= cur.end) {
      if (s.end > cur.end) cur.end = s.end
    } else {
      out.push(cur)
      cur = { ...s }
    }
  }
  out.push(cur)
  return out
}
