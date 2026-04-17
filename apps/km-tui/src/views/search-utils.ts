/**
 * Shared Search Utilities
 *
 * Helpers consumed by SearchDialog and picker-loaders. Ranking/scoring
 * lives in `state/omnibox-ranker.ts` — consumers needing tier-based match
 * should use `scoreTextFields` or `rankResults` from there, not fork
 * their own scorer here.
 */
import type { KNode } from "@km/core"
import { extractRefs } from "../text/text-pipeline.ts"

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
