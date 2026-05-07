/**
 * Universal test helper for fs-materialized node seeding.
 *
 * Mirrors what real km does on creation — write a file, sync, end up with
 * a node whose `fs_path` is the file's location and whose `fstype` is one
 * of the on-disk tier values (file, mdfile, folder).
 *
 * Use this in tests instead of raw `repo.addNode({ data: { id: ... } })`
 * seeding. Raw addNode-with-data.id depends on the deprecated step-4
 * fallback in the resolver (`data.id` json_extract), which is scheduled
 * for deletion in `@km/beads/data-id-stop-writing`. Fixtures that depend
 * on it will break.
 *
 * In-memory implementation: this helper uses `repo.addNode()` to create
 * the node directly (no real filesystem write) but sets `fs_path`, `name`,
 * and `fstype` to the values a production sync would produce. The
 * indexed `idx_nodes_fs_path` lookup in `resolveRef` step 2 finds the
 * node — same code path as production. For tests that need real file IO
 * (watcher tests, sync tests), use `createTestEnvRepo` + `writeFileSync`
 * directly; this helper isn't needed.
 *
 * Bead: @km/storage/seed-file-node-helper
 */

import type { Repo } from "../repo/repo.ts"

export interface SeedFileNodeOptions {
  /** Frontmatter values to write into `data` (mirrors what the parser would set). */
  frontmatter?: Record<string, unknown>
  /** Body content for the node. */
  body?: string
  /**
   * Filesystem-materialization tier. Default `"mdfile"` — markdown files.
   * Use `"folder"` when seeding a directory ancestor that file nodes nest under.
   * Use `"file"` for non-markdown files.
   */
  fstype?: "mdfile" | "file" | "folder"
  /**
   * Optional explicit aliases. Aliases are stored in `data.aliases` JSON
   * (which the v9 trigger fans out into `node_aliases` for indexed lookup).
   */
  aliases?: string[]
}

export interface SeededFileNode {
  nodeId: string
  /** The fs-materialized path written to `node.fs_path`. */
  fsPath: string
  /** The path-form (without `.md` suffix, used in wikilinks and URIs). */
  pathForm: string
  /** The node's `name` segment (last path segment). */
  name: string
}

/**
 * Seed a filesystem-materialized node at a given path.
 *
 * The `path` argument is the **path-form** — sigil-prefixed
 * (`@km/beads/foo`, `@km/notes/myfile`) or a relative tree path
 * (`scope/leaf`). For `mdfile` and `file` fstypes, the helper appends
 * `.md` (or doesn't, for non-markdown files) when computing `fs_path`.
 *
 * Parent folders are seeded automatically as `fstype: "folder"` if they
 * don't yet exist, mirroring what the production loader does on a real
 * directory tree.
 */
export function seedFileNode(repo: Repo, path: string, options: SeedFileNodeOptions = {}): SeededFileNode {
  const fstype = options.fstype ?? "mdfile"
  const segments = path.split("/").filter((s) => s.length > 0)
  if (segments.length === 0) {
    throw new Error(`seedFileNode: path must have at least one segment (got: ${JSON.stringify(path)})`)
  }

  // Walk the path, creating any missing ancestor folders.
  let parentId: string | null = null
  let parentFsPath = ""
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]
    if (segment === undefined) continue
    const fsPathSoFar = parentFsPath ? `${parentFsPath}/${segment}` : segment
    const existing = repo.resolveNode(fsPathSoFar)
    if (existing?.fstype === "folder") {
      parentId = existing.id
      parentFsPath = fsPathSoFar
      continue
    }
    parentId = repo.addNode(parentId, {
      type: "h",
      item: {},
      fstype: "folder",
      content: segment,
      name: segment,
      fs_path: fsPathSoFar,
    })
    parentFsPath = fsPathSoFar
  }

  // The leaf node — the actual file/folder being seeded.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- segments.length > 0 enforced at line 70
  const leafName = segments[segments.length - 1]!
  const fsPath = computeFsPath(parentFsPath, leafName, fstype)
  const data: Record<string, unknown> = {}
  if (options.frontmatter) Object.assign(data, options.frontmatter)
  if (options.aliases) data.aliases = options.aliases

  const nodeId = repo.addNode(parentId, {
    type: "h",
    item: {},
    fstype,
    content: options.body ?? leafName,
    name: leafName,
    fs_path: fsPath,
    data,
  })

  return {
    nodeId,
    fsPath,
    pathForm: path,
    name: leafName,
  }
}

function computeFsPath(parentFsPath: string, leafName: string, fstype: "mdfile" | "file" | "folder"): string {
  const base = parentFsPath ? `${parentFsPath}/${leafName}` : leafName
  if (fstype === "mdfile") return `${base}.md`
  return base
}
