/**
 * Tiny Levenshtein distance + nearest-match suggestion helper.
 *
 * Used by `km set` / `km task set` / `km task clear` to suggest a
 * canonical field key when the user typed a near-miss (e.g. `prioirty:`
 * → "Did you mean `priority`?"). Pure function, no I/O — callable from
 * any planner without dragging in the silvery import chain.
 *
 * Why hand-roll this: km already pulls a few NLP-shaped deps (chrono-
 * node, mdast). One more for ~30 LOC is poor pay-off; the implementation
 * is the textbook iterative DP with a single rolling row. Performance
 * is non-issue — call site is per-typo, against a list of ~20 canonical
 * field keys.
 */

/**
 * Levenshtein edit distance between two strings (case-insensitive).
 *
 * Standard iterative DP. O(min(a, b)) memory via single rolling row;
 * O(a * b) time. Empty inputs are handled trivially (distance is the
 * length of the other string).
 */
export function levenshtein(a: string, b: string): number {
  const aLow = a.toLowerCase()
  const bLow = b.toLowerCase()
  if (aLow === bLow) return 0
  if (aLow.length === 0) return bLow.length
  if (bLow.length === 0) return aLow.length

  // Single rolling row — `prev[j]` holds D(i-1, j) and `curr[j]` holds
  // D(i, j) during the inner loop.
  const prev: number[] = []
  const curr: number[] = []
  for (let j = 0; j <= bLow.length; j++) prev[j] = j

  for (let i = 1; i <= aLow.length; i++) {
    curr[0] = i
    for (let j = 1; j <= bLow.length; j++) {
      const cost = aLow[i - 1] === bLow[j - 1] ? 0 : 1
      const del = (prev[j] ?? 0) + 1
      const ins = (curr[j - 1] ?? 0) + 1
      const sub = (prev[j - 1] ?? 0) + cost
      curr[j] = Math.min(del, ins, sub)
    }
    for (let j = 0; j <= bLow.length; j++) prev[j] = curr[j] ?? 0
  }
  return prev[bLow.length] ?? 0
}

/**
 * Find the best near-miss suggestion for a typo from a list of candidates.
 *
 * Returns the candidate with the smallest Levenshtein distance to `typo`,
 * provided that distance is `<= maxDistance` (default 2 — catches single-
 * char typos and adjacent-key swaps without false-positive on completely
 * unrelated input). When no candidate is close enough, returns null.
 *
 * Ties: returns the first candidate at the minimum distance (caller
 * decides whether candidate-list ordering carries semantic preference).
 */
export function suggestField(typo: string, candidates: readonly string[], maxDistance = 2): string | null {
  if (!typo) return null
  let best: string | null = null
  let bestDistance = maxDistance + 1
  for (const candidate of candidates) {
    const d = levenshtein(typo, candidate)
    if (d < bestDistance) {
      bestDistance = d
      best = candidate
    }
  }
  return bestDistance <= maxDistance ? best : null
}
