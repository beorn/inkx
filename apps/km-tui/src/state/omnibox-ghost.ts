/**
 * Omnibox ghost completion — pure derivation of the inline ghost suffix
 * shown after the cursor when one result clearly out-ranks the others.
 *
 * Bead: km-tui.omnibox-interactions (Phase 7).
 *
 * The rule is intentionally simple: the ghost is the prefix-match suffix
 * of the FIRST (top-ranked) candidate. The ranker is the single source
 * of truth for "which candidate does the user most likely want?" — the
 * ghost just echoes the rest of that candidate's name back as a hint.
 *
 * Acceptance:
 *   - buffer=':ne' + top=':new-project' → ghost 'w-project'
 *   - buffer=':zz' (no match)            → null (no ghost)
 *   - Tab/Space/Right-Arrow accepts the ghost (UI binds these to a
 *     `setBuffer(buffer + ghost)` action when ghost != null).
 */

/**
 * Minimal candidate shape consumed by `ghostFor`. We avoid importing
 * `OmniboxRowData` here so the module stays in `state/` (no React
 * dependency) and the helper is reusable from any caller that has
 * `id` / `title` for the top result.
 */
export interface GhostCandidate {
  /** Display text used to compute the ghost suffix when buffer has no sigil. */
  title: string
  /** ID; used as the suffix source when the buffer carries a sigil. */
  id: string
  /** Domain — `command` IDs are kebab-case slugs we can complete; `node` IDs are opaque. */
  kind: "command" | "node"
}

/**
 * Recognized leading sigils. We strip these before matching the buffer
 * against the candidate's id/title — so `':ne'` matches `'new-project'`.
 * Mirrors the SIGIL_MODES set in `omnibox.ts` but inlined here to avoid
 * a circular import.
 */
const SIGIL_CHARS = new Set([":", "@", "#", "+", "[", "/"])

/**
 * Compute the ghost suffix for the current buffer + ranked candidate list.
 *
 * Returns the *missing* tail that, appended to the buffer, would equal the
 * top candidate's full text. Returns `null` when:
 *   - buffer is empty / whitespace-only (nothing to complete)
 *   - candidates is empty
 *   - the top candidate doesn't prefix-match the buffer
 *   - the buffer already equals the top candidate (nothing to add)
 *
 * Matching is case-insensitive on the buffer side but the returned ghost
 * preserves the candidate's original casing — so the user sees the
 * canonical form.
 */
export function ghostFor(buffer: string, candidates: readonly GhostCandidate[]): string | null {
  if (buffer.trim().length === 0) return null
  if (candidates.length === 0) return null

  const top = candidates[0]
  if (!top) return null

  const sigil = SIGIL_CHARS.has(buffer[0] ?? "") ? (buffer[0] ?? "") : ""
  const bufferBody = sigil ? buffer.slice(1) : buffer
  if (bufferBody.length === 0) return null

  // Prefer the id for kebab-case completion; fall back to title for nodes
  // whose ids are opaque hashes.
  const candidateText = top.kind === "command" ? top.id : (top.title ?? top.id)
  const bufferLower = bufferBody.toLowerCase()
  const candidateLower = candidateText.toLowerCase()

  if (!candidateLower.startsWith(bufferLower)) return null
  if (candidateLower.length === bufferLower.length) return null

  return candidateText.slice(bufferBody.length)
}
