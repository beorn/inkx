/**
 * rename-cascade — pure helpers for expanding a folder rename into per-node ops.
 *
 * When a folder's fs_path changes, all descendants whose fs_path is nested
 * under it need their fs_path prefix rewritten. Historically this was one
 * bulk `UPDATE nodes SET fs_path = ? || SUBSTR(...) WHERE fs_path LIKE ?`
 * that bypassed the change journal — crash-unsafe because the DB moved
 * ahead of the journal.
 *
 * This module converts that bulk update into a list of per-node
 * `node_updated` ops. Each op carries the descendant's new fs_path
 * (and old_fs_path for audit). The caller emits them through
 * `emitter.commit(...)` so DB + journal stay paired per row.
 *
 * Per-row atomicity is the strong guarantee; cascade completeness is
 * best-effort. If the process crashes mid-loop, the DB and journal stay
 * consistent with each other — only the remaining descendants lag, and
 * a reconciliation pass (or a retry of the same rename) catches them up.
 */

import type { Database } from "bun:sqlite"

export interface CascadeDescendant {
  id: string
  oldFsPath: string
  newFsPath: string
}

/**
 * Query rows whose fs_path is nested under `oldFsPath` (i.e. `fs_path LIKE
 * oldFsPath + '/%'`), and compute each row's new fs_path by swapping the
 * prefix. Returns the list of per-node updates the caller should journal.
 *
 * Excludes the root folder itself — that's rewritten by the caller in a
 * separate `node_updated` op with full fields (name, title, etc.).
 *
 * Path comparison is exact-prefix + '/' so "foo/bar" cascades don't accidentally
 * rewrite "foo/barbaz".
 */
export function computeRenameCascade(db: Database, oldFsPath: string, newFsPath: string): CascadeDescendant[] {
  const oldPrefix = oldFsPath + "/"
  const newPrefix = newFsPath + "/"
  const rows = db.query("SELECT id, fs_path FROM nodes WHERE fs_path LIKE ?").all(oldPrefix + "%") as {
    id: string
    fs_path: string
  }[]

  const out: CascadeDescendant[] = []
  for (const row of rows) {
    // Guard: LIKE's wildcard could theoretically match if the prefix is odd
    // (e.g. oldFsPath ends with a `%`). Enforce literal prefix match here.
    if (!row.fs_path.startsWith(oldPrefix)) continue
    const suffix = row.fs_path.slice(oldPrefix.length)
    out.push({
      id: row.id,
      oldFsPath: row.fs_path,
      newFsPath: newPrefix + suffix,
    })
  }
  return out
}
