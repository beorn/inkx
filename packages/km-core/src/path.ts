/**
 * Path derivation — single source of truth for materializing a node's path.
 *
 * Three concepts (per docs/design/model/storage.md:761-787):
 *   - id   = ULID, opaque, internal (nodes.id pkey)
 *   - name = path segment (one slug per node, in nodes.name)
 *   - path = composition of names by parent walk; user-facing form
 *
 * For nodes whose path is their identity (files, folders, repo root),
 * the materialized path is cached today on `node.fs_path` (as full
 * relative path, including `.md` for files). `pathOf` strips the
 * `./` prefix and `.md` extension to produce the user-facing path-form.
 *
 * For nodes that don't have an `fs_path` (paragraphs and other unanchored
 * blocks inside a file), `pathOf` returns null — those nodes don't have
 * an addressable path and are referenced via id (ULID).
 *
 * NOTE: This helper consolidates the inline `fs_path.replace(/^\.\//, "")
 * .replace(/\.md$/, "")` pattern that was duplicated across at least 6
 * sites (smart-resolver, link-resolver, bd.ts, repo.ts, move-with-refs,
 * broken-links). Use `pathOf` instead of inlining the regexes.
 *
 * The longer-term direction is to drop `fs_path` entirely and derive
 * paths via parent walk + name (see bead
 * @km/storage/drop-fs-path-derive-from-name); this helper is the seam
 * that lets that refactor happen by changing one function instead of
 * grepping every caller. P3 for that bead — current implementation
 * works fine.
 */

interface PathableNode {
  fs_path?: string | null
}

/**
 * Return the user-facing path-form of a node, or null if the node has
 * no addressable path.
 *
 * Examples:
 *   pathOf({ fs_path: "@km/beads/foo.md" })  → "@km/beads/foo"
 *   pathOf({ fs_path: "@km/beads" })          → "@km/beads"      (folder)
 *   pathOf({ fs_path: "./@km/beads/foo.md" }) → "@km/beads/foo"  (legacy "./" prefix)
 *   pathOf({ fs_path: "." })                  → ""               (repo root)
 *   pathOf({ fs_path: null })                 → null
 *   pathOf({ fs_path: undefined })            → null
 */
export function pathOf(node: PathableNode): string | null {
  if (!node.fs_path) return null
  if (node.fs_path === ".") return ""
  return node.fs_path.replace(/^\.\//, "").replace(/\.md$/i, "")
}
