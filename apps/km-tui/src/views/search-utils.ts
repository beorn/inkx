/**
 * Shared Search Utilities
 *
 * Fuzzy matching, scoring, and text extraction used by
 * SearchDialog and ItemPicker.
 */
import type { KNode } from "@km/core"
import { extractRefs } from "../text/text-pipeline.ts"

/**
 * Simple fuzzy match - check if query chars appear in order in target
 */
export function fuzzyMatch(query: string, target: string): boolean {
  const lowerQuery = query.toLowerCase()
  const lowerTarget = target.toLowerCase()

  let queryIndex = 0
  for (let i = 0; i < lowerTarget.length && queryIndex < lowerQuery.length; i++) {
    if (lowerTarget[i] === lowerQuery[queryIndex]) {
      queryIndex++
    }
  }
  return queryIndex === lowerQuery.length
}

/** Segment separators used for "segment-boundary match" detection. */
const SEGMENT_SEPARATORS = new Set(["/", ".", " ", "-", "_", "@", "#", "+", ":"])

function isSegmentBoundary(target: string, pos: number): boolean {
  if (pos === 0) return true
  return SEGMENT_SEPARATORS.has(target[pos - 1]!)
}

/**
 * Score a fuzzy match (higher = better). Tiered scoring:
 *
 *   Tier 1: exact match              → 10000+
 *   Tier 2: prefix match              → 5000+
 *   Tier 3: segment-boundary substring→ 2000+
 *   Tier 4: generic substring         → 1000+
 *   Tier 5: char-order fuzzy          → 0–999
 *
 * Within each tier, shorter targets and earlier-positioned matches rank
 * higher. Non-matches return 0. Fixes km-tui.picker-rank-subpath:
 * exact/prefix matches on `@delei` now outrank deep subpath matches like
 * `@office/Finance/Accounts/Delei/SPD`.
 */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 1 // empty query ranks everything equally
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  // Tier 1: exact match. Identical strings get max score with a tiny
  // length dampener so single-char queries still beat long exact equals.
  if (t === q) return 10000 - t.length

  // Tier 2: prefix. Shorter targets rank higher (so `@delei` beats
  // `@delei.org`, `@delei` beats `@delei-commercial`, etc.).
  if (t.startsWith(q)) return 5000 - (t.length - q.length)

  // Locate the earliest substring match, then decide its tier by whether
  // it lands on a segment boundary.
  const substringPos = t.indexOf(q)
  if (substringPos !== -1) {
    const trailing = t.length - (substringPos + q.length)
    if (isSegmentBoundary(t, substringPos)) {
      // Tier 3: segment-start substring match (`project/work/foo` with
      // query `work` lands on the start of the `work` segment).
      // Penalize trailing length (deep subpath = big trailing = lower rank).
      return 2000 - substringPos * 2 - trailing
    }
    // Tier 4: generic substring (query appears mid-segment).
    return 1000 - substringPos * 2 - trailing
  }

  // Tier 5: char-order fuzzy — chars appear in order but not contiguous.
  // Returns 0 if no match at all.
  if (!fuzzyMatch(query, target)) return 0

  let score = 0
  let queryIndex = 0
  let consecutive = 0
  for (let i = 0; i < t.length && queryIndex < q.length; i++) {
    if (t[i] === q[queryIndex]) {
      consecutive++
      score += consecutive * 2
      if (isSegmentBoundary(t, i)) score += 5
      queryIndex++
    } else {
      consecutive = 0
    }
  }

  // Cap below Tier 4 so fuzzy never beats a literal substring match.
  return Math.min(score, 999) - t.length * 0.1
}

/**
 * Get parent display name for context
 */
export function getParentName(
  node: KNode,
  getNode: (id: string) => KNode | null,
  getDisplayName: (node: KNode) => string,
): string | null {
  if (!node.parent_id) return null
  const parent = getNode(node.parent_id)
  if (!parent) return null
  return getDisplayName(parent)
}

/**
 * Extract tags from content (words starting with #).
 * Delegates to the canonical Unicode-aware extractRefs() from text pipeline.
 */
export function extractTags(content: string | undefined): string[] {
  if (!content) return []
  return extractRefs(content).tags
}
