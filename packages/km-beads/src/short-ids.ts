import { ulid } from "ulid"
import { resolveRef, type Repo } from "@km/storage"

import { bdIdToPathForm } from "./migrate.ts"
import { resolveBeadsRoots } from "./paths.ts"

const SEPARATOR = "-"
const AUTO_LENGTH = 4

/**
 * Mint a fresh node `name` for a bd-CLI-created bead — `<prefix>-<4chars>`.
 *
 * "shortId" is no longer a concept in km's data model. The three handles
 * are id (ULID), name (segment), path (composed). When `bd create` runs
 * without an explicit `--id`/`--path`, it auto-generates a `node.name`
 * via this minter — the result is just a `name`, not a separate handle
 * type. See @km/all/drop-shortid-concept.
 *
 * `prefix` MUST come from the destination repo's `.km/config.yaml`
 * (`beads.prefix`) — read via `getBeadsConfig` from `@km/storage`, or via
 * the async `loadKmBdConfig` adapter for app-level callers. Migration paths
 * forward the source `.beads/config.yaml` `issue-prefix` instead.
 *
 * No default — passing the wrong prefix in a non-`km` repo (cloudi, pam,
 * pim vault) silently produced `km-…` names. Required-arg makes the bug
 * visible at the type level.
 */
export function mintBeadName(prefix: string): string {
  const id = ulid()
  const suffix = id.slice(-AUTO_LENGTH).toLowerCase()
  return `${prefix}${SEPARATOR}${suffix}`
}

/**
 * Normalize a user-supplied bd-flavored reference into the canonical
 * bd-form short_id (`<prefix>-<scope>.<slug>`). Accepts:
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
 * The output is bd-form (dotted), suitable for storage in `data.aliases`
 * for legacy lookup. The corresponding path-form (`@km/beads/foo`) is the
 * file's location on disk; both forms resolve to the same node via
 * `resolveRef`.
 *
 * `prefix` is required — see `mintBeadName` for why.
 */
export function normalizeBdRef(custom: string, prefix: string): string {
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

/**
 * Mint a sub-bead `name` by appending `.N` to a parent bead's name.
 * Used when bd auto-generates child names like `km-foo.1`, `km-foo.2`.
 */
export function mintSubBeadName(parentName: string, childNumber: number): string {
  return `${parentName}.${childNumber}`
}

/**
 * Resolve a user-supplied reference to a node id (ULID).
 *
 * @internal Wraps `resolveRef(repo, ref)` from `@km/storage` with a
 * test-fixture compat fallback (step 4 below). Stays until
 * `@km/beads/data-id-stop-writing`'s follow-on fixture migration lands —
 * that bead's close-reason explicitly defers the fixture migration to a
 * separate change. New code should call `resolveRef(repo, ref)` directly;
 * keep this name only for the bd-form / data.id fallback path.
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
export function resolveShortId(input: string, repo: Repo): string | null {
  if (!repo) {
    throw new Error("resolveShortId requires a repo instance")
  }

  const fileBackedBead = resolvePathFormBeadFile(repo, input)
  if (fileBackedBead !== null) return fileBackedBead

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

  // Step 5 — bd-form → path-form fallback for stub-state nodes.
  //
  // When a bd `.md` file exists on disk but its frontmatter hasn't been
  // parsed yet, `data.aliases` is empty and the schema-v9 `node_aliases`
  // trigger has no rows for this stub. `resolveRef`'s alias arm misses,
  // and bd-form input (`km-beads.foo`) never reaches the path-shaped arm
  // because it contains no `/`. Derive the canonical path-form via
  // `bdIdToPathForm` and retry — the stub's `fs_path` index resolves it.
  //
  // Heuristic: only triggered when the input looks like bd-form
  // (`<prefix>-<rest>` with hyphen, no slash, no leading sigil). Avoids
  // accidentally matching arbitrary user input as a bd-form ref.
  if (!input.includes("/") && !input.startsWith("@") && input.includes("-")) {
    // Probe for a known prefix by stripping the part before the first hyphen.
    const dashIdx = input.indexOf("-")
    if (dashIdx > 0) {
      const probedPrefix = input.slice(0, dashIdx)
      // Try every plausible path-form interpretation of the bd-shaped input:
      //   1. dot-form via `bdIdToPathForm` (handles `km-scope.leaf` → `@km/scope/leaf`)
      //   2. dash-form full-mapping (handles `km-scope-leaf` → `@km/scope/leaf`)
      //      where the migrator emitted the dash variant of `km-scope.leaf`).
      //
      // Both are needed because dash-form is the migrator's lossy variant of
      // dot-form (`bdIdToAliases` writes both); the stub-state path-form
      // index has no way to distinguish a "real" `km-scope-leaf` (single
      // segment) from a dot-form translated to dash. Try both, take the
      // first that resolves, fall through to null otherwise.
      const candidates: string[] = []
      const dotPath = bdIdToPathForm(input, probedPrefix)
      if (dotPath) candidates.push(dotPath)
      const sansPrefix = input.startsWith(`${probedPrefix}-`) ? input.slice(probedPrefix.length + 1) : input
      if (sansPrefix && sansPrefix.includes("-")) {
        candidates.push(`@${probedPrefix}/${sansPrefix.split("-").join("/")}`)
      }
      for (const pathForm of candidates) {
        const node = repo.resolveNode(pathForm)
        if (node) return node.id
        // Some vaults store fs_path without the sigil — strip and retry.
        const sansSigil = pathForm.replace(/^@[^/]+\//, "")
        if (sansSigil !== pathForm) {
          const node2 = repo.resolveNode(sansSigil)
          if (node2) return node2.id
        }
      }
    }
  }

  return null
}

/**
 * Bead path-form ids name files, not their sibling child directories.
 *
 * The universal storage resolver intentionally prefers `foo/` over `foo.md`
 * for generic path navigation. Beads use the sibling shape differently:
 *
 *   @km/scope/foo.md  # parent bead body
 *   @km/scope/foo/    # child bead directory
 *
 * So `Bead.resolve("@km/scope/foo")` must resolve the file-backed bead
 * before delegating to the universal folder-first resolver.
 */
function resolvePathFormBeadFile(repo: Repo, input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed.includes("/") || trimmed.endsWith(".md")) return null

  const node = repo.resolveNode(`${trimmed}.md`)
  if (node?.fstype === "mdfile" && isUnderBeadRoot(node.fs_path, resolveBeadsRoots(repo.config.beads))) return node.id

  return null
}

function isUnderBeadRoot(fsPath: string | undefined, roots: string[]): boolean {
  if (!fsPath) return false
  for (const root of roots) {
    if (fsPath === root) return true
    if (fsPath.startsWith(`${root}/`)) return true
  }
  return false
}
