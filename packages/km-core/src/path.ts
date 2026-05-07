/**
 * FS-path derivation — single source of truth for materializing a node's
 * fs-cache-derived path-form.
 *
 * Three concepts (per docs/design/model/storage.md "Names, Paths, and IDs"):
 *   - id   = ULID, opaque, internal (nodes.id pkey)
 *   - name = path segment (one slug per node, in nodes.name)
 *   - path = composition of names by parent walk; user-facing form
 *
 * Plus a 2×2 vocabulary that crosses these with the materialization plane:
 *
 *                  Tree (logical)              FS (materialized)
 *   segment        tree-name = node.name       fs-name = basename on disk
 *   composed       tree-path = KTree.path()    fs-path = node.fs_path cache
 *
 * `fsPathOf(node)` lives in the **fs-path cell**: it reads `node.fs_path`
 * and strips fs-isms (`./` prefix, `.md` extension) to yield the
 * user-facing path-form. The cache-free tree walker is `KTree.path()` in
 * `@km/tree` — different cell, intentionally separate primitive.
 *
 * For nodes whose path is their identity (files, folders, repo root),
 * the materialized path is cached today on `node.fs_path` (as full
 * relative path, including `.md` for files). `fsPathOf` strips the
 * `./` prefix and `.md` extension to produce the user-facing path-form.
 *
 * For nodes that don't have an `fs_path` (paragraphs and other unanchored
 * blocks inside a file), `fsPathOf` returns null — those nodes don't have
 * an addressable path and are referenced via id (ULID).
 *
 * NOTE: This helper consolidates the inline `fs_path.replace(/^\.\//, "")
 * .replace(/\.md$/, "")` pattern that was duplicated across at least 6
 * sites (smart-resolver, link-resolver, bd.ts, repo.ts, move-with-refs,
 * broken-links). Use `fsPathOf` instead of inlining the regexes.
 *
 * See `@km/all/path-name-orthogonal-vocabulary` for the rename history
 * (`pathOf` → `fsPathOf`) and the deferred decision NOT to introduce a
 * `treePathOf` helper (`KTree.path()` already covers that cell).
 */

interface PathableNode {
  fs_path?: string | null
}

/**
 * Return the user-facing path-form of a node derived from its fs-path
 * cache, or null if the node has no addressable fs-path.
 *
 * Reads `node.fs_path` and strips the `./` prefix and `.md` extension.
 * This is the **fs-cache reader**, not a tree walker — for the cache-free
 * parent-walk version, use `KTree.path(tree, id)` from `@km/tree`.
 *
 * Examples:
 *   fsPathOf({ fs_path: "@km/beads/foo.md" })  → "@km/beads/foo"
 *   fsPathOf({ fs_path: "@km/beads" })          → "@km/beads"      (folder)
 *   fsPathOf({ fs_path: "./@km/beads/foo.md" }) → "@km/beads/foo"  (legacy "./" prefix)
 *   fsPathOf({ fs_path: "." })                  → ""               (repo root)
 *   fsPathOf({ fs_path: null })                 → null
 *   fsPathOf({ fs_path: undefined })            → null
 */
export function fsPathOf(node: PathableNode): string | null {
  if (!node.fs_path) return null
  if (node.fs_path === ".") return ""
  return node.fs_path.replace(/^\.\//, "").replace(/\.md$/i, "")
}
