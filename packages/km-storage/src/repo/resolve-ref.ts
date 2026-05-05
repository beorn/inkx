import type { Repo } from "./repo.ts"

/**
 * Resolve a user-supplied reference string to a node id (ULID).
 *
 * This is the universal resolver entry point. It accepts (in priority order):
 *
 *   1. ULID (`01H5XJ...`)              — direct primary key match
 *   2. path-form (contains `/`)         — indexed `fs_path` lookup via
 *                                          `repo.resolveNode`. Handles both
 *                                          sigil-prefixed (`@km/beads/foo`) and
 *                                          relative (`silvercode/acp/rename`)
 *                                          forms; strips foreign sigils on retry.
 *   3. alias                            — exact match against `data.aliases`
 *                                          JSON (legacy bd-form ids like
 *                                          `km-silvercode.acp-rename`).
 *
 * Returns `null` when no node matches.
 *
 * The deprecated `data.id` / `data.short_id` json_extract fallback is **not**
 * included here. That's a beads-side test-fixture compat shim that lives in
 * `@km/beads/short-ids.ts` and will be removed once test fixtures migrate to
 * file-materialization (`@km/beads/data-id-stop-writing`).
 *
 * Resolution semantics for steps 1–3 are universal — they apply to any KNode
 * (paragraph, folder, file, mdsection, bead, future task, …); bead-ness is
 * incidental.
 */
export function resolveRef(repo: Repo, ref: string): string | null {
  // 1. ULID direct match — cheap pkey lookup.
  if (repo.getNode(ref)) return ref

  // 2. path-form — delegate to repo.resolveNode for path-shaped input
  //    (contains "/" or starts with sigil "@<prefix>/").
  if (ref.includes("/")) {
    const node = repo.resolveNode(ref)
    if (node) return node.id
    // Strip a leading `@<prefix>/` sigil and retry — handles cross-vault
    // references where the stored fs_path may be without the sigil.
    const stripped = ref.replace(/^@[^/]+\//, "")
    if (stripped !== ref) {
      const node2 = repo.resolveNode(stripped)
      if (node2) return node2.id
    }
  }

  // 3. alias — indexed lookup against node_aliases (schema v9).
  //    These are user-supplied alternate names — typically bd-flavored ids
  //    (e.g. `km-silvercode.acp-rename`) emitted by `normalizeBdRef` and
  //    migration; preserved as historical names. Aliases are universal —
  //    any node can carry them. The `node_aliases` table is kept in sync
  //    with `data.aliases` JSON via SQLite triggers; reads here go through
  //    `idx_node_aliases_alias` for O(log N) reverse lookup.
  const byAlias = repo.rawQuery<{ node_id: string }>(`SELECT node_id FROM node_aliases WHERE alias = ? LIMIT 1`, [ref])
  if (byAlias[0]) return byAlias[0].node_id

  return null
}
