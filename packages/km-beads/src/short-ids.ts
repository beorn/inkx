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
 * Resolve a user-supplied id reference to a full node ID.
 *
 * Accepts three input forms, in priority order:
 *   1. Canonical path-form id    `silvercode/acp/rename`         → match `data.id`
 *   2. Sigil-prefixed path-form  `@km/silvercode/acp/rename`     → strip `@<prefix>/`, match `data.id`
 *   3. Legacy bd-form id         `km-silvercode.acp-rename`      → match `data.short_id` or any entry in `data.aliases`
 *
 * The three are tried in order; first match wins. The legacy paths are
 * compatibility shims for the bd→km bd cutover (see docs/future/beads.md).
 */
export function resolveShortId(input: string, options: ShortIdOptions): string | null {
  if (!options.repo) {
    throw new Error("resolveShortId requires a repo instance")
  }
  const repo = options.repo

  // Strip a leading `@<prefix>/` sigil to get the bare canonical path.
  // We don't know whether `data.id` is stored with or without the sigil
  // (verified 2026-04-29: existing vault stores WITH sigil, e.g. "@km/storage").
  // Try all three forms so callers can pass either shape.
  const stripped = input.replace(/^@[^/]+\//, "")

  // 1. Frontmatter `id:` — exact match against either stored form.
  //    Also matches via LIKE for foreign-prefix sigils (e.g. typed "scope/slug"
  //    against stored "@anyprefix/scope/slug").
  const byCanonical = repo.rawQuery<{ id: string }>(
    `SELECT id FROM nodes
     WHERE json_extract(data, '$.id') = ?
        OR json_extract(data, '$.id') = ?
        OR json_extract(data, '$.id') LIKE ?
     LIMIT 1`,
    [input, stripped, `%/${stripped}`],
  )
  if (byCanonical[0]) return byCanonical[0].id

  // 2. Legacy bd-form short_id — still emitted by km bd create / generateShortId.
  const byShortId = repo.rawQuery<{ id: string }>(
    `SELECT id FROM nodes WHERE json_extract(data, '$.short_id') = ? LIMIT 1`,
    [input],
  )
  if (byShortId[0]) return byShortId[0].id

  // 3. Frontmatter `aliases:` list — bd-form ids registered as historical names.
  const byAlias = repo.rawQuery<{ id: string }>(
    `SELECT id FROM nodes
     WHERE EXISTS (
       SELECT 1 FROM json_each(json_extract(data, '$.aliases')) WHERE value = ?
     )
     LIMIT 1`,
    [input],
  )
  if (byAlias[0]) return byAlias[0].id

  return null
}
