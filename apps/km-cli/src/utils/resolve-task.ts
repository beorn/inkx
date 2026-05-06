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
 * that converts to the @km/beads Bead shape.
 *
 * Historical note (km-beads.purge-fallback-id-l5 / .retire-short-id-l4):
 * a fourth arm matched bare `km-<4chars>` against the node's ULID tail.
 * That arm only existed because the now-retired ULID-tail synthesis in
 * `nodeToBead` could print `km-XXXX` for non-beads. Post-purge,
 * `Bead.shortId` is `undefined` for non-beads, `bd list` displays the
 * full ULID, and no user-typed `km-XXXX` ever points at a non-bead. Real
 * `km-<scope>.<slug>` ids resolve through arm #2 (`data.short_id`).
 */

import { Bead, type Bead as BeadType } from "@km/beads"
import { Task } from "@km/storage"
import type { KNode } from "@km/core"
import type { Repo } from "@km/storage"

/**
 * Resolve a user-supplied id-or-path to a single node.
 *
 * Delegates to `Task.findByPathOrId` from `@km/storage`, with the `Bead.resolve`
 * short-id resolver wired in so canonical path-form / legacy bd-form / aliases
 * all resolve. Tries every form `bd list` / `tasks list` may print, in priority
 * order. Returns null when nothing matches.
 */
export function resolveTaskNode(repo: Repo, arg: string): KNode | null {
  return Task.findByPathOrId(repo, arg, (ref) => Bead.resolve(repo, ref))
}

/**
 * Resolve a user-supplied id-or-path to a Bead.
 *
 * Thin wrapper around {@link resolveTaskNode} + `Bead.from`. Used by every
 * `bd <subcmd> <id>` callsite (show, update, close, drop, claim, comment,
 * mention, …).
 *
 * Returns null when the input doesn't resolve OR when it resolves to a
 * non-bead node (no `data.id` and no `data.short_id`).
 */
export function resolveIssue(repo: Repo, arg: string): BeadType | null {
  const node = resolveTaskNode(repo, arg)
  if (node) {
    const bead = Bead.from(node, { repo })
    if (bead) return bead
  }

  // Once a bead has sub-beads, its file and sibling folder share a stem:
  // `@km/scope/parent.md` and `@km/scope/parent/`. Path-form lookup may
  // resolve the folder first, but bd commands operate on the bead file.
  if (arg.includes("/") && !arg.endsWith(".md")) {
    const fileNode = resolveTaskNode(repo, `${arg}.md`)
    if (fileNode) return Bead.from(fileNode, { repo })
  }

  return null
}
