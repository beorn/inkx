/**
 * Short-id resolution with explicit ambiguity surface.
 *
 * The existing `repo.resolveNode` is convenient but loses information when
 * multiple nodes match a query — it silently returns null. That's safe but
 * unhelpful for CLI surfaces like `km task show foo` where the user wants
 * to know "which `foo` did you mean?".
 *
 * `resolveShortId` exposes the candidate list explicitly. Callers render
 * the disambiguation message; the resolver itself stays pure.
 *
 * Resolution layers (in order):
 *   1. Exact `node.id` (ULID) match.
 *   2. Exact `node.name` match (file/folder name).
 *   3. Exact `data.id` / `data.aliases` match (canonical sigil-prefixed
 *      path-form OR bd-form alias). One SQL query, both shapes.
 *   4. Suffix match on `fs_path` (e.g., `foo` → `@km/storage/foo.md`).
 *   5. bd-form translation (`km-storage.foo` → `@km/storage/foo`) — try
 *      every dot↔dash variant, fall through to suffix for stub-state.
 *
 * Layers 1–3 are unambiguous by construction (unique columns / aliases).
 * Layer 4 is where ambiguity actually surfaces — multiple `foo.md` files
 * across scopes. Layer 5 is unambiguous when bd-form parses.
 *
 * Returns a tagged union so callers can branch:
 *   { kind: "found", node }            → unique resolution
 *   { kind: "ambiguous", candidates }  → caller renders the menu
 *   { kind: "none" }                   → caller renders "not found"
 *
 * Stable candidate ordering: alphabetical by `fs_path`, then by `id`.
 * Property tests pin this so disambiguation menus don't reshuffle on
 * every call.
 */

import type { KNode } from "@km/core"
import type { Repo } from "./repo.ts"

/**
 * Inlined copy of `bdIdToPathForm` from `@km/beads` (which we can't import
 * from here — beads → storage, not the reverse). Translates a bd-form id
 * (`<prefix>-<scope>.<slug>`) into the canonical sigil-prefixed path-form
 * (`@<prefix>/<scope>/<slug>`). Returns null for empty inputs.
 *
 * Mirror of `packages/km-beads/src/migrate.ts:bdIdToPathForm`. Keep in
 * sync; both are tiny and deterministic. Tests in
 * `tests/repo/resolve-short-id.test.ts` pin the bd-form arm so silent
 * drift breaks the suite.
 */
function bdIdToPathForm(bdId: string, sourcePrefix: string): string | null {
  const stripped = bdId.startsWith(`${sourcePrefix}-`) ? bdId.slice(sourcePrefix.length + 1) : bdId
  if (!stripped) return null
  const sigilRoot = `@${sourcePrefix}`
  if (!stripped.includes(".")) {
    return `${sigilRoot}/inbox/${stripped}`
  }
  return `${sigilRoot}/${stripped.split(".").join("/")}`
}

export type ShortIdResolution =
  | { kind: "found"; node: KNode }
  | { kind: "ambiguous"; candidates: KNode[] }
  | { kind: "none" }

/**
 * Resolve a user-supplied short id (or path / alias / bd-form) to exactly
 * one node, surfacing ambiguity when multiple candidates match.
 *
 * Pure over the passed-in `Repo` — no caching, no globals. Callers that
 * need caching should compose this with their own memoization.
 */
export function resolveShortId(repo: Repo, query: string): ShortIdResolution {
  const trimmed = query?.trim()
  if (!trimmed) return { kind: "none" }

  // Layer 1: exact ULID / id match.
  const byExactId = repo.getNode(trimmed)
  if (byExactId) return { kind: "found", node: byExactId }

  // Layer 1b: path-shaped input — delegate to the smart resolver and
  // exit. Suffix matching and bd-form translation are slug-shaped layers
  // that don't apply once the user typed a path (with `/`).
  if (trimmed.includes("/")) {
    const byPath = repo.resolveNode(trimmed)
    if (byPath) return { kind: "found", node: byPath }
    // For sigil-prefixed inputs, also try the sigil-stripped form so
    // vaults that store fs_path without the sigil still resolve.
    if (trimmed.startsWith("@")) {
      const sansSigil = trimmed.replace(/^@[^/]+\//, "")
      if (sansSigil && sansSigil !== trimmed) {
        const byStripped = repo.resolveNode(sansSigil)
        if (byStripped) return { kind: "found", node: byStripped }
      }
    }
    return { kind: "none" }
  }

  // Layer 2: exact name match (folder or file name without extension).
  const byName = repo.resolveByName(trimmed)
  if (byName) return { kind: "found", node: byName }

  // Layer 3: data.id / data.aliases exact match.
  // The schema-v9 `node_aliases` rollup populates one row per alias.
  // A single SQL hits both `data.id` and any `data.aliases[*]` entry.
  const aliasIds = repo.rawQuery<{ id: string }>(
    `SELECT id FROM nodes
     WHERE json_extract(data, '$.id') = ?
        OR EXISTS (
          SELECT 1 FROM json_each(IFNULL(json_extract(data, '$.aliases'), '[]'))
          WHERE json_each.value = ?
        )
     LIMIT 25`,
    [trimmed, trimmed],
  )
  if (aliasIds.length === 1 && aliasIds[0]) {
    const node = repo.getNode(aliasIds[0].id)
    if (node) return { kind: "found", node }
  }
  if (aliasIds.length > 1) {
    return ambiguous(
      repo,
      aliasIds.map((r) => r.id),
    )
  }

  // Layer 4: suffix match on fs_path / name.
  // The slug shape user types: `foo` → match `%/foo.md` or `%/foo`.
  // Skip if the query already contains a slash (resolveNode handles paths).
  if (!trimmed.includes("/")) {
    const suffixIds = suffixMatch(repo, trimmed)
    if (suffixIds.length === 1 && suffixIds[0]) {
      const node = repo.getNode(suffixIds[0])
      if (node) return { kind: "found", node }
    }
    if (suffixIds.length > 1) {
      return ambiguous(repo, suffixIds)
    }
  }

  // Layer 5: bd-form translation.
  // `km-storage.foo` / `km-storage-foo` → `@km/storage/foo`.
  // Only attempted for inputs that look like bd-form: contains `-`,
  // no slash, no leading sigil.
  if (!trimmed.includes("/") && !trimmed.startsWith("@") && trimmed.includes("-")) {
    const dashIdx = trimmed.indexOf("-")
    const probedPrefix = trimmed.slice(0, dashIdx)
    const candidates: string[] = []
    const dotPath = bdIdToPathForm(trimmed, probedPrefix)
    if (dotPath) candidates.push(dotPath)
    const sansPrefix = trimmed.startsWith(`${probedPrefix}-`) ? trimmed.slice(probedPrefix.length + 1) : trimmed
    if (sansPrefix && sansPrefix.includes("-")) {
      candidates.push(`@${probedPrefix}/${sansPrefix.split("-").join("/")}`)
    }
    for (const pathForm of candidates) {
      // Try the full path-form, then the sigil-stripped variant for vaults
      // that store fs_path without the leading sigil.
      for (const variant of [pathForm, pathForm.replace(/^@[^/]+\//, "")]) {
        const node = repo.resolveNode(variant)
        if (node) return { kind: "found", node }
      }
    }
  }

  return { kind: "none" }
}

/**
 * Suffix-match the query against `fs_path` and `name`. Returns ids in
 * stable order (sorted by `fs_path` then `id`).
 */
function suffixMatch(repo: Repo, query: string): string[] {
  // LIKE escape: `_` and `%` are wildcards in SQLite. Inputs from
  // user-typed slugs rarely contain them, but escape defensively so a
  // future caller doesn't introduce a fast-path to "everything".
  const escaped = query.replace(/[\\%_]/g, "\\$&")
  const rows = repo.rawQuery<{ id: string; fs_path: string | null }>(
    `SELECT id, fs_path FROM nodes
     WHERE fs_path LIKE ? ESCAPE '\\'
        OR fs_path LIKE ? ESCAPE '\\'
        OR name = ?
     ORDER BY fs_path, id
     LIMIT 25`,
    [`%/${escaped}.md`, `%/${escaped}`, query],
  )
  return rows.map((r) => r.id)
}

/**
 * Hydrate a list of node ids into KNode candidates, dropping nulls and
 * preserving stable sort order.
 */
function ambiguous(repo: Repo, ids: string[]): ShortIdResolution {
  const nodes: KNode[] = []
  for (const id of ids) {
    const node = repo.getNode(id)
    if (node) nodes.push(node)
  }
  if (nodes.length === 0) return { kind: "none" }
  if (nodes.length === 1 && nodes[0]) return { kind: "found", node: nodes[0] }
  // Stable sort: by fs_path (alphabetical), then by id (ULID).
  nodes.sort((a, b) => {
    const ap = a.fs_path ?? ""
    const bp = b.fs_path ?? ""
    if (ap !== bp) return ap < bp ? -1 : 1
    return a.id < b.id ? -1 : 1
  })
  return { kind: "ambiguous", candidates: nodes }
}

/**
 * Render a CLI-friendly error message for an ambiguous resolution.
 * Centralized here so every command produces the same surface.
 */
export function formatAmbiguityError(query: string, candidates: KNode[]): string {
  const lines = [`"${query}" is ambiguous. Did you mean:`]
  for (const c of candidates) {
    const label = c.fs_path ?? c.name ?? c.id
    lines.push(`  ${label}`)
  }
  return lines.join("\n")
}
