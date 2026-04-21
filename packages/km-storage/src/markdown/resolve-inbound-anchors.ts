/**
 * Resolve Inbound Anchors — two-pass coordinator
 *
 * PASS 2 of the collapse-parse anchor pipeline. After discovery +
 * reconciliation have run (so all files exist as nodes and all outbound
 * link rows — both `links` and `collapsed_file_links` — are written), this
 * module runs the inbound resolution:
 *
 *   1. Scan the outbound-link inventory for hrefs with a #fragment.
 *   2. Group by (target_path, fragment) to build the "target set" with
 *      ref_count per tuple.
 *   3. Resolve target_path to a file node; skip if not collapsed (parsed
 *      files have their own heading nodes, no need for the cache).
 *   4. Run extractAnchors on each collapsed file in the target set.
 *   5. Intersect extracted anchors with referenced fragments → insert rows
 *      into `referenced_anchors` with ref_count.
 *
 * Complements C3 (which writes outbound edges). This is C4 — inbound.
 *
 * See km-storage.collapsed-file-anchors and docs/design/model/klink.md.
 */

import { readFileSync } from "fs"
import { join } from "path"
import type { Database } from "bun:sqlite"
import { createLogger } from "loggily"

import { extractAnchors } from "./extract-anchors.ts"
import { addReferencedAnchors, removeReferencedAnchors, toReferencedAnchorInsert } from "../db/referenced-anchors.ts"

const log = createLogger("km:storage:resolve-inbound-anchors")

// ============================================================================
// TYPES
// ============================================================================

/** Options for the resolver pass. */
export interface ResolveInboundAnchorsOptions {
  /** Repo root; used to read collapsed file content from disk. */
  repoRoot: string
  /**
   * Optional list of collapsed-file node ids to limit the pass to. When
   * omitted, ALL currently-collapsed files in the DB are considered.
   * Used during incremental updates (only the changed file's anchors
   * need to be re-resolved).
   */
  fileIds?: readonly string[]
}

export interface ResolveInboundAnchorsResult {
  /** Collapsed files whose anchors were (re)scanned. */
  filesScanned: number
  /** Total (file_id, anchor) rows written. */
  anchorsWritten: number
  /** Unique referenced fragments considered (before intersection with actual anchors). */
  referencedFragments: number
}

/** Per-file aggregation: which fragments are referenced, with ref counts. */
interface FileTargetSet {
  /** node_id of the collapsed file */
  fileId: string
  /** relative fs_path (used to read content from disk) */
  fsPath: string
  /** fragment → ref_count */
  fragments: Map<string, number>
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Scan outbound-link inventories, identify which collapsed files have
 * inbound references, run extractAnchors on each, and populate
 * `referenced_anchors`.
 *
 * Idempotent: delete-then-insert per file_id. Safe to re-run.
 *
 * No-op (returns zero counts) when there are no collapsed files in the DB
 * or when no outbound link has a `#fragment`.
 */
export function resolveInboundAnchors(
  db: Database,
  options: ResolveInboundAnchorsOptions,
): ResolveInboundAnchorsResult {
  const { repoRoot } = options

  // Step 1: identify collapsed files (candidates for inbound-anchor rows).
  // A file is "collapsed" if its `data` JSON has `_collapsed: true`.
  // We restrict the candidate set early because the typical vault has
  // many more non-collapsed files than collapsed ones.
  const collapsedFiles = findCollapsedFiles(db, options.fileIds)
  if (collapsedFiles.size === 0) {
    log.debug?.("resolveInboundAnchors: no collapsed files, skipping")
    return { filesScanned: 0, anchorsWritten: 0, referencedFragments: 0 }
  }

  // Step 2: build the target set from outbound-link inventories.
  //
  // Both `links` (parsed-file edges) and `collapsed_file_links` (collapsed
  // file edges) carry `href`. For hrefs with a fragment pointing at a
  // collapsed file, we accumulate (file_id, fragment) → ref_count.
  const targetSet = buildTargetSet(db, collapsedFiles)

  if (targetSet.size === 0) {
    log.debug?.(`resolveInboundAnchors: ${collapsedFiles.size} collapsed files, 0 referenced`)
    // Still delete any stale rows for files in the passed-in fileIds list,
    // so a file losing its last referrer is reflected in the DB.
    if (options.fileIds) {
      for (const fileId of options.fileIds) {
        removeReferencedAnchors(db, fileId)
      }
    }
    return { filesScanned: 0, anchorsWritten: 0, referencedFragments: 0 }
  }

  let referencedFragments = 0
  for (const fts of targetSet.values()) referencedFragments += fts.fragments.size

  // Step 3: scan each referenced collapsed file, intersect with extracted
  // anchors, insert rows.
  let filesScanned = 0
  let anchorsWritten = 0

  db.run("BEGIN IMMEDIATE")
  try {
    // If explicit fileIds were passed, first clear any rows for files that
    // are in the scope but not in targetSet (e.g., file lost its last
    // referrer → all its rows should vanish).
    if (options.fileIds) {
      for (const fileId of options.fileIds) {
        if (!targetSet.has(fileId)) {
          removeReferencedAnchors(db, fileId)
        }
      }
    }

    for (const [fileId, fts] of targetSet) {
      const written = scanAndInsert(db, repoRoot, fts)
      filesScanned++
      anchorsWritten += written
    }
    db.run("COMMIT")
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }

  log.debug?.(
    `resolveInboundAnchors: ${collapsedFiles.size} collapsed files, ` +
      `${targetSet.size} referenced, ${filesScanned} scanned, ${anchorsWritten} anchors written`,
  )

  return { filesScanned, anchorsWritten, referencedFragments }
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Find all collapsed mdfile/txtfile nodes in the DB. When `fileIds` is
 * supplied, restrict to that subset (still filtered by the `_collapsed`
 * marker so non-collapsed ids are ignored).
 *
 * Returns a map from fs_path → fileId for fast lookup during target-set
 * building.
 */
function findCollapsedFiles(
  db: Database,
  fileIds: readonly string[] | undefined,
): Map<string, { fileId: string; fsPath: string }> {
  // The data JSON has `_collapsed: true` set by createStubFileChange when
  // the file matched a collapse-parse pattern. LIKE '%_collapsed%' is the
  // same predicate used in loader.ts for the unparsed-stub re-queue path.
  let sql = "SELECT id, fs_path FROM nodes WHERE fs_path IS NOT NULL AND data LIKE '%_collapsed%'"
  const params: string[] = []
  if (fileIds && fileIds.length > 0) {
    const placeholders = fileIds.map(() => "?").join(",")
    sql += ` AND id IN (${placeholders})`
    params.push(...fileIds)
  }
  const rows = db.prepare(sql).all(...params) as Array<{ id: string; fs_path: string }>

  const byPath = new Map<string, { fileId: string; fsPath: string }>()
  for (const row of rows) {
    byPath.set(row.fs_path, { fileId: row.id, fsPath: row.fs_path })
  }
  return byPath
}

/**
 * Build the target set: for each collapsed file referenced by some inbound
 * link with a fragment, group (file_id, fragment) → ref_count.
 *
 * The fragment is extracted from the `href`. Canonical hrefs are:
 *   km:Path#Fragment       ← wiki / relative links
 *   #Fragment              ← self-ref (doesn't target a file; skipped)
 *   https://...#f          ← external URLs (skipped)
 *
 * For `km:<path>#<fragment>`, we resolve `<path>` to a file node. This is
 * done via basename match against our collapsed-file index (same strategy
 * used by createLinkResolver). Wiki targets are authored by basename
 * (without extension) so `Chat-X` in the href matches the file whose
 * fs_path ends in `chat-x.md` (case-insensitive).
 *
 * Markdown-link hrefs (`./chat-x.md#turn-5`) are also supported: the path
 * portion is matched against fs_path directly (relative paths normalized
 * via basename + case-insensitive).
 */
function buildTargetSet(
  db: Database,
  collapsedFiles: Map<string, { fileId: string; fsPath: string }>,
): Map<string, FileTargetSet> {
  // Build a basename index once.
  const byBasename = new Map<string, { fileId: string; fsPath: string }>()
  for (const entry of collapsedFiles.values()) {
    const basename =
      entry.fsPath
        .split("/")
        .pop()
        ?.replace(/\.(md|txt)$/i, "") ?? ""
    const key = basename.toLowerCase()
    // First match wins (ambiguity is rare for collapse-parse folders, and
    // the link resolver follows the same convention).
    if (!byBasename.has(key)) {
      byBasename.set(key, entry)
    }
  }

  const bySourceId = new Map<string, FileTargetSet>()
  function bump(fileId: string, fsPath: string, fragment: string): void {
    let fts = bySourceId.get(fileId)
    if (!fts) {
      fts = { fileId, fsPath, fragments: new Map() }
      bySourceId.set(fileId, fts)
    }
    fts.fragments.set(fragment, (fts.fragments.get(fragment) ?? 0) + 1)
  }

  // Pull hrefs with a fragment from BOTH tables.
  // Self-ref hrefs (`#Section`) don't target a specific file — skip via a
  // LIKE 'km:%' filter.
  const query = db.prepare(
    "SELECT href FROM links WHERE href LIKE 'km:%#%' " +
      "UNION ALL " +
      "SELECT href FROM collapsed_file_links WHERE href LIKE 'km:%#%'",
  )
  const rows = query.all() as Array<{ href: string }>

  for (const { href } of rows) {
    const parsed = parseKmHref(href)
    if (!parsed) continue
    const { path, fragment } = parsed

    // Resolve path to a collapsed file. Try basename match first (most
    // common for wiki links); fall back to full fs_path match (for md-link
    // relative paths).
    const basename =
      path
        .split("/")
        .pop()
        ?.replace(/\.(md|txt)$/i, "") ?? ""
    const hit =
      byBasename.get(basename.toLowerCase()) ??
      collapsedFiles.get(path) ??
      // Try with .md suffix if the href omitted it
      collapsedFiles.get(`${path}.md`)
    if (!hit) continue // target isn't a collapsed file → skip

    bump(hit.fileId, hit.fsPath, fragment)
  }

  return bySourceId
}

/**
 * Parse a canonical km href of the form `km:<path>#<fragment>`.
 * Returns null for hrefs without a fragment, self-refs, or external URLs.
 */
function parseKmHref(href: string): { path: string; fragment: string } | null {
  if (!href.startsWith("km:")) return null
  const rest = href.slice(3) // after "km:"
  const hashAt = rest.indexOf("#")
  if (hashAt <= 0) return null // no fragment or empty path
  return {
    path: rest.slice(0, hashAt),
    fragment: rest.slice(hashAt + 1),
  }
}

/**
 * Read a collapsed file's content, extract its anchors, intersect with the
 * referenced-fragment set, and insert the matching rows.
 *
 * Returns the number of rows inserted.
 *
 * Errors reading the file are swallowed + logged; the whole two-pass
 * should never abort because one file is unreadable.
 */
function scanAndInsert(db: Database, repoRoot: string, fts: FileTargetSet): number {
  // Always clear existing rows for this file before inserting — delete-
  // then-insert is the write protocol.
  removeReferencedAnchors(db, fts.fileId)

  let content: string
  try {
    content = readFileSync(join(repoRoot, fts.fsPath), "utf-8")
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn?.(`resolveInboundAnchors: could not read ${fts.fsPath}: ${message}`)
    return 0
  }

  const extracted = extractAnchors(content)
  if (extracted.length === 0) return 0

  // Build an anchor-by-text index for fast intersection.
  // Same (anchor) may appear multiple times in the same file when the
  // author duplicated a heading — pick the first occurrence (lowest
  // offset) to match on, consistent with how parsed heading nodes resolve.
  const byAnchor = new Map<string, (typeof extracted)[number]>()
  for (const ex of extracted) {
    if (!byAnchor.has(ex.anchor)) byAnchor.set(ex.anchor, ex)
  }

  const rows: ReturnType<typeof toReferencedAnchorInsert>[] = []
  for (const [fragment, refCount] of fts.fragments) {
    const hit = byAnchor.get(fragment)
    if (!hit) continue // referenced anchor not found in file — skip
    rows.push(toReferencedAnchorInsert(hit, refCount))
  }

  if (rows.length === 0) return 0
  addReferencedAnchors(db, fts.fileId, rows)
  return rows.length
}
