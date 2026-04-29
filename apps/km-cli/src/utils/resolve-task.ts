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
 *   3. Bare ULID-tail short id (km-XXXX) → match last 4 chars of node.id,
 *      case-insensitive — needed for beads whose display id is purely
 *      derived from the ULID tail (no data.id, no data.short_id; see
 *      packages/km-beads/src/queries.ts:228 for the dual fallback).
 *   4. Filesystem path / relative path   → repo.resolveNode (smart resolver)
 *
 * Returns the matched KNode (or null). `resolveIssue` is a thin wrapper
 * that converts to the @km/beads Issue shape.
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

  // 3. ULID-tail fallback. `km-<4chars>` where the bead has no data.id
  //    and no data.short_id (display id derived purely from node.id tail
  //    in nodeToIssue / queries.ts:228). This is the case the
  //    resolve-issue-arg-bug names — make sure the same ids `bd list`
  //    prints are accepted by `bd update` / `bd show` / `tasks claim`.
  const tail = arg.match(/^km-([a-z0-9]{4})$/i)?.[1]?.toLowerCase()
  if (tail) {
    const rows = repo.rawQuery<{ id: string }>(
      `SELECT id FROM nodes WHERE lower(substr(id, length(id) - 3, 4)) = ? LIMIT 1`,
      [tail],
    )
    const hit = rows[0]
    if (hit) {
      const node = repo.getNode(hit.id)
      if (node) return node
    }
  }

  // 4. Filesystem path / relative path — delegate to the smart resolver.
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
