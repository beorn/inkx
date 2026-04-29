/**
 * Unified task / issue resolver
 *
 * Single resolution chain shared by `bd <subcmd> <id>` and `tasks <pathOrId>`.
 * Accepts every id form that `bd list` / `tasks list` may emit.
 *
 * Resolution order:
 *   1. Canonical path-form / sigil-prefixed → `data.id` or `data.aliases`
 *      (handled by resolveShortId from @km/beads)
 *   2. Legacy bd-form short_id           → `data.short_id`
 *   3. Filesystem path / relative path   → repo.resolveNode (smart resolver)
 *
 * Returns the matched KNode (or null). `resolveIssue` is a thin wrapper
 * that converts to the @km/beads Issue shape.
 *
 * Historical note (km-beads.purge-fallback-id-l5 / .retire-short-id-l4):
 * a fourth arm matched bare `km-<4chars>` against the node's ULID tail.
 * That arm only existed because the now-retired ULID-tail synthesis in
 * `nodeToIssue` could print `km-XXXX` for non-beads. Post-purge,
 * `Issue.shortId` is `undefined` for non-beads, `bd list` displays the
 * full ULID, and no user-typed `km-XXXX` ever points at a non-bead. Real
 * `km-<scope>.<slug>` ids resolve through arm #2 (`data.short_id`).
 */

import { nodeToIssue, resolveShortId, type Issue } from "@km/beads"
import type { KNode } from "@km/core"
import type { Repo } from "@km/storage"

/**
 * Resolve a user-supplied id-or-path to a single node.
 *
 * Tries every form `bd list` / `tasks list` may print, in priority order.
 * Returns null when nothing matches.
 */
export function resolveTaskNode(repo: Repo, arg: string): KNode | null {
  if (!arg?.trim()) return null

  // 1-2. Canonical id, legacy short_id, aliases — the @km/beads short-id chain.
  const nodeId = resolveShortId(arg, { repo })
  if (nodeId) {
    const node = repo.getNode(nodeId)
    if (node) return node
  }

  // 3. Filesystem path / relative path — delegate to the smart resolver.
  //    `repo.resolveNode` handles explicit paths (/, ./, ../), relative
  //    paths (contains /), bare names, ID prefix/suffix, and content match.
  const byPath = repo.resolveNode(arg)
  if (byPath) return byPath

  // Relative-path fallback: user may type `beads/foo.md` from any subdir.
  if (!arg.startsWith("/") && !arg.includes("\0")) {
    const cwdRelative = `${process.cwd()}/${arg}`
    const byCwdRelative = repo.resolveNode(cwdRelative)
    if (byCwdRelative) return byCwdRelative
  }

  return null
}

/**
 * Resolve a user-supplied id-or-path to a beads Issue.
 *
 * Thin wrapper around {@link resolveTaskNode} + `nodeToIssue`. Used by
 * every `bd <subcmd> <id>` callsite (show, update, close, drop, claim,
 * comment, mention, …).
 */
export function resolveIssue(repo: Repo, arg: string): Issue | null {
  const node = resolveTaskNode(repo, arg)
  if (!node) return null
  return nodeToIssue(node, { repo })
}
