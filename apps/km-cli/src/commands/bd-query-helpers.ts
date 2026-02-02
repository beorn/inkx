/**
 * Beads Query Helpers
 *
 * Helper functions for resolving issue references from CLI arguments.
 */

import { getIssue, nodeToIssue, type Issue } from "@km/beads"
import type { Repo } from "@km/storage"

/**
 * Resolve an issue argument - accepts bead short ID (km-xxxx) OR path-or-node reference
 */
export function resolveIssueArg(repo: Repo, arg: string): Issue | null {
  // 1. Try as bead short ID first (km-xxxx pattern)
  const byShortId = getIssue(arg, { repo })
  if (byShortId) return byShortId

  // 2. Try as path-or-node reference
  const node = repo.resolveNode(arg, "task")
  if (node) {
    return nodeToIssue(node, { repo })
  }

  return null
}
