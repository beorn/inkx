import { ulid } from "ulid"
import type { Repo } from "@km/storage"

const SEPARATOR = "-"
const AUTO_LENGTH = 4

/** Options for short ID functions */
export interface ShortIdOptions {
  /** Repo to use for queries. Required for functions that access storage. */
  repo?: Repo
}

/**
 * Generate a fresh short id of the form `<prefix>-<4chars>`.
 *
 * `prefix` MUST come from the destination repo's `.km/config.yaml`
 * (`beads.prefix`) — read via `getBeadsConfig` from `@km/storage`, or via
 * the async `loadKmBdConfig` adapter for app-level callers. Migration paths
 * forward the source `.beads/config.yaml` `issue-prefix` instead.
 *
 * No default — passing the wrong prefix in a non-`km` repo (cloudi, pam,
 * pim vault) silently produced `km-…` ids. Required-arg makes the bug
 * visible at the type level.
 */
export function generateShortId(prefix: string): string {
  const id = ulid()
  const suffix = id.slice(-AUTO_LENGTH).toLowerCase()
  return `${prefix}${SEPARATOR}${suffix}`
}

/**
 * Normalize a user-supplied id into the canonical bd-form short_id
 * (`<prefix>-<scope>.<slug>`). Accepts:
 *
 *   km-beads.foo            (bd-form, already prefixed — idempotent)
 *   beads.foo               (bd-form scope, no prefix — prepend)
 *   beads/foo               (path-form — slashes → dots, then prepend)
 *   @km/beads/foo           (canonical sigil-prefixed path-form — strip sigil, slashes → dots)
 *   @km/silvercode/acp/rename → km-silvercode.acp.rename
 *
 * Idempotent: passing an already-bd-form id returns it unchanged. This
 * fixes the double-prefix bug (km-beads.create-double-prefix) where
 * `--id km-beads.foo` was producing `km-km-beads.foo`.
 *
 * `prefix` is required — see `generateShortId` for why.
 */
export function generateCustomId(custom: string, prefix: string): string {
  let s = custom.trim()
  // Strip a leading `@<prefix>/` sigil — canonical cross-vault reference.
  if (s.startsWith(`@${prefix}/`)) {
    s = s.slice(prefix.length + 2)
  } else if (s.startsWith("@")) {
    // Foreign sigil (`@otherprefix/foo/bar`) — drop the `@<…>/` prefix and keep the path.
    const slashIdx = s.indexOf("/")
    if (slashIdx > 0) s = s.slice(slashIdx + 1)
  }
  // Path-form (slashes) → bd-form (dots).
  if (s.includes("/")) {
    s = s.split("/").join(".")
  }
  // Idempotent: already bd-form with this prefix → pass through.
  if (s.startsWith(`${prefix}${SEPARATOR}`)) {
    return s
  }
  return `${prefix}${SEPARATOR}${s}`
}

export function generateSubId(parentShortId: string, childNumber: number): string {
  return `${parentShortId}.${childNumber}`
}

/**
 * Resolve a user-supplied reference to a node id (ULID).
 *
 * Three terms are distinct (per docs/design/model/storage.md:761-787):
 *   - id   = ULID, opaque, internal. The pkey of nodes.
 *   - name = path segment (one slug per node).
 *   - path = composition of names by parent walk; the user-facing form.
 *
 * Resolution priority:
 *   1. id (direct ULID)               → exact nodes.id match
 *   2. path (full or relative)         → repo.resolveNode (uses indexed fs_path)
 *      handles: `@km/beads/foo`, `@km/silvercode/acp/rename`, `silvercode/acp/rename`
 *   3. legacy bd-form short_id/alias  → json_each scan over data.aliases
 *      handles: `km-silvercode.acp-rename`, `km-silvercode-acp-rename`
 *
 * Step 2 used to do three sequential json_extract scans against `data.id` /
 * `data.short_id` — that work is now done by repo.resolveNode against
 * fs_path with index `idx_nodes_fs_path` (smart-resolver.ts:278-305). Since
 * `data.id` value equals `fs_path` minus `.md`, the json_extract scans were
 * redundant duplicates of the indexed lookup.
 *
 * Step 3 (aliases) stays as the legacy bd-form fallback — those forms don't
 * appear in fs_path, so resolveNode won't find them.
 */
export function resolveShortId(input: string, options: ShortIdOptions): string | null {
  if (!options.repo) {
    throw new Error("resolveShortId requires a repo instance")
  }
  const repo = options.repo

  // 1. id (direct ULID) — exact nodes.id match. Cheap pkey lookup.
  if (repo.getNode(input)) return input

  // 2. path — delegate to repo.resolveNode for path-shaped input
  //    (contains "/" or starts with sigil "@<prefix>/").
  if (input.includes("/")) {
    const node = repo.resolveNode(input)
    if (node) return node.id
    // Strip a leading `@<prefix>/` sigil and retry — handles cross-vault
    // references where the stored fs_path may be without the sigil.
    const stripped = input.replace(/^@[^/]+\//, "")
    if (stripped !== input) {
      const node2 = repo.resolveNode(stripped)
      if (node2) return node2.id
    }
  }

  // 3. legacy bd-form — scan data.aliases for ids that don't appear as paths.
  //    These are bd-flavored ids (e.g. `km-silvercode.acp-rename`) emitted
  //    by `generateShortId` and migration; preserved as historical names.
  const byAlias = repo.rawQuery<{ id: string }>(
    `SELECT id FROM nodes
     WHERE EXISTS (
       SELECT 1 FROM json_each(json_extract(data, '$.aliases')) WHERE value = ?
     )
     LIMIT 1`,
    [input],
  )
  if (byAlias[0]) return byAlias[0].id

  // 4. compat fallback: data.id / data.short_id json_extract.
  //    In production, beads always have fs_path set (they're materialized
  //    files on disk), so step 2 always finds them. This fallback exists
  //    for tests that seed beads via raw `repo.addNode({ data: { id: ... } })`
  //    without writing a file — the lookup-by-data.id pattern that the
  //    pre-2026-04-30 resolver used. Will be removed once test fixtures
  //    migrate to file-materialization (tracked in
  //    @km/beads/data-id-stop-writing follow-up).
  const stripped = input.replace(/^@[^/]+\//, "")
  const byCanonical = repo.rawQuery<{ id: string }>(
    `SELECT id FROM nodes
     WHERE json_extract(data, '$.id') = ?
        OR json_extract(data, '$.id') = ?
        OR json_extract(data, '$.short_id') = ?
     LIMIT 1`,
    [input, stripped, input],
  )
  if (byCanonical[0]) return byCanonical[0].id

  return null
}
