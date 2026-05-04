import { ulid } from "ulid"
import { resolveRef, type Repo } from "@km/storage"

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
 * @deprecated New code should call `resolveRef(repo, ref)` from `@km/storage`
 * directly. This wrapper exists only to preserve the test-fixture compat
 * fallback (step 4 below) until `@km/beads/data-id-stop-writing` migrates
 * fixtures to file-materialization. Once that lands, this function can be
 * deleted entirely.
 *
 * Resolution priority:
 *   1–3. universal: ULID / path-form / alias — delegated to `resolveRef`.
 *   4. compat fallback: `data.id` / `data.short_id` json_extract.
 *      In production, beads always have fs_path set (they're materialized
 *      files on disk), so step 2 always finds them. This fallback exists
 *      for tests that seed beads via raw `repo.addNode({ data: { id: ... } })`
 *      without writing a file — the lookup-by-data.id pattern that the
 *      pre-2026-04-30 resolver used.
 */
export function resolveShortId(input: string, options: ShortIdOptions): string | null {
  if (!options.repo) {
    throw new Error("resolveShortId requires a repo instance")
  }
  const repo = options.repo

  const universal = resolveRef(repo, input)
  if (universal !== null) return universal

  // Step 4 — beads-side test-fixture compat fallback. Removed in
  // @km/beads/data-id-stop-writing.
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
