/**
 * Post-move sibling-tree relocation for `bd move/rename`.
 *
 * `repo.moveNodeWithRefs` handles the single `.md` file (rewrites
 * wikilinks, transclusions, dep-edges, alias props, parent_id, blocked-by).
 * It does NOT touch the sibling directory pattern that beads use for
 * children: when `@km/scope/parent.md` has a sibling `@km/scope/parent/`
 * directory holding child beads, the directory is invisible to the move
 * primitive (children may still be in stub state with no parsed content).
 *
 * This module owns the sibling-tree relocation:
 *   1. Rewrite each child file's bd-form alias / parent_id / prose mentions
 *      via direct disk text substitution. Going through the parsed
 *      writeback path would force-parse stubs whose new IDs don't match
 *      the disk, then `mergeExternalDrift` would mis-detect the disk
 *      paragraphs as "new" and fold them into the file alongside the
 *      rewritten ones (duplicate-paragraph artifact).
 *   2. `renameSync` the directory on disk.
 *   3. Update the DB's fs_path index for the folder-style node and every
 *      descendant via raw SQL — `repo.updateNode` would emit `node_updated`
 *      events that fire `fs-writer.save()` which mistakenly serializes
 *      stub state back to disk over the just-rewritten content.
 *
 * Bead identity is preserved across the move: only `fs_path` changes; the
 * ULID `id` stays so backlinks resolve.
 */

import { dirname, join } from "path"
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "fs"

/**
 * Repo subset needed for the sibling-tree relocation. We only need raw
 * SQL access — `database.prepare(...).run(...)` — so the surface stays
 * narrow. Full `Repo` works (it exposes `database`); the narrowed type
 * keeps the module decoupled from the rest of `@km/storage`.
 */
export interface MoveBeadRepo {
  database: {
    prepare(sql: string): {
      run(...params: unknown[]): unknown
    }
  }
}

export interface RelocateSiblingTreeOptions {
  repoRoot: string
  /** Old fs_path of the moved `.md` file (e.g. `@km/scope/old.md`). */
  oldFsPath: string | null
  /** New fs_path of the moved `.md` file (from `MoveResult.newFsPath`). */
  newFsPath: string | null
}

export interface RelocateSiblingTreeResult {
  /** True when the sibling directory existed and was relocated. */
  relocated: boolean
  /** Warning message if the directory rename failed (filesystem error). */
  warning: string | null
}

/**
 * Relocate the sibling directory + descendant DB rows for a moved bead.
 *
 * Returns `{ relocated: false, warning: null }` when there's nothing to
 * do (no sibling directory, or the move had no fs_path change). The
 * caller should always invoke this after `moveNodeWithRefs`; it's a
 * no-op when irrelevant.
 */
export function relocateBeadSiblingTree(
  repo: MoveBeadRepo,
  options: RelocateSiblingTreeOptions,
): RelocateSiblingTreeResult {
  const oldDirRel = options.oldFsPath?.endsWith(".md") ? options.oldFsPath.slice(0, -3) : options.oldFsPath
  const newDirRel = options.newFsPath?.endsWith(".md") ? options.newFsPath.slice(0, -3) : null

  if (!oldDirRel || !newDirRel || oldDirRel === newDirRel) {
    return { relocated: false, warning: null }
  }

  const oldDirAbs = join(options.repoRoot, oldDirRel)
  const newDirAbs = join(options.repoRoot, newDirRel)
  const oldRefs = collectRefVariants(oldDirRel)

  // 1. Rewrite child file content on disk BEFORE renaming so we touch
  //    the existing (still-at-old-location) files. Simple text
  //    substitution — no parsing, no writeback, no merge.
  if (existsSync(oldDirAbs)) {
    walkMdFiles(oldDirAbs, (absPath) => rewriteRefs(absPath, oldRefs, newDirRel))
  }

  // 2. Rename the on-disk directory. Skip when target already exists
  //    (idempotent recovery from a partial run).
  let warning: string | null = null
  if (existsSync(oldDirAbs) && !existsSync(newDirAbs)) {
    mkdirSync(dirname(newDirAbs), { recursive: true })
    try {
      renameSync(oldDirAbs, newDirAbs)
    } catch (err) {
      warning = `failed to rename child directory ${oldDirRel} → ${newDirRel}: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  // 3. Update DB fs_path for every descendant via raw SQL. `repo.updateNode`
  //    would emit events that re-serialize stub-state nodes over the
  //    just-rewritten disk content.
  // Folder-style node at the bare path-form id (no .md extension).
  repo.database
    .prepare(`UPDATE nodes SET fs_path = ?, name = ? WHERE id = ?`)
    .run(newDirRel, newDirRel.split("/").pop() ?? oldDirRel, oldDirRel)
  // Descendant rows: rewrite each fs_path that starts with the old
  // directory prefix. Single UPDATE with SQL substring composition.
  repo.database
    .prepare(
      `UPDATE nodes
         SET fs_path = ? || SUBSTR(fs_path, ?)
         WHERE fs_path LIKE ?`,
    )
    .run(newDirRel, oldDirRel.length + 1, `${oldDirRel}/%`)

  return { relocated: true, warning }
}

/**
 * Build the set of strings to rewrite in child files: the old canonical
 * path-form, plus its bd-form variants. Mirrors `bdIdToAliases`'s dot +
 * dash output so prose mentions of either form get redirected.
 */
function collectRefVariants(oldDirRel: string): string[] {
  const out = new Set<string>()
  out.add(oldDirRel)
  if (oldDirRel.startsWith("@")) {
    const m = oldDirRel.match(/^@([a-z0-9]+)\/(.+)$/i)
    if (m) {
      const [, p, rest] = m
      if (p && rest) {
        out.add(`${p}-${rest.replace(/\//g, ".")}`)
        out.add(`${p}-${rest.replace(/\//g, "-")}`)
      }
    }
  }
  return [...out]
}

function walkMdFiles(absDir: string, visit: (absPath: string) => void): void {
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const child = join(absDir, entry.name)
    if (entry.isDirectory()) walkMdFiles(child, visit)
    else if (entry.isFile() && entry.name.endsWith(".md")) visit(child)
  }
}

function rewriteRefs(absPath: string, oldRefs: readonly string[], newRef: string): void {
  try {
    let text = readFileSync(absPath, "utf-8")
    let changed = false
    for (const oldRef of oldRefs) {
      if (oldRef === newRef) continue
      if (text.includes(oldRef)) {
        text = text.split(oldRef).join(newRef)
        changed = true
      }
    }
    if (changed) writeFileSync(absPath, text, "utf-8")
  } catch {
    // Best-effort: a single unreadable file shouldn't abort the whole
    // sibling-tree relocation. The DB row update still runs.
  }
}
