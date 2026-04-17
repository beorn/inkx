/**
 * Deferred Parsing
 *
 * km-fast-md.7: Background parsing of stub nodes after initial board render.
 * Stubs are created during discoverOnly mode; these functions fill them in.
 *
 * Entry point: parseDeferredAsync()
 */

// Node.js/Bun global for yielding to event loop
// eslint-disable-next-line promise/prefer-await-to-callbacks -- Type declaration, not actual callback
declare function setImmediate(callback: (value?: unknown) => void): unknown

import { createLogger } from "loggily"
import { Database } from "bun:sqlite"
import { readFileSync } from "fs"
import { createParsePool } from "./parse-pool.ts"
import { runDeferredPipeline } from "./pipeline.ts"
import { parseMarkdownWithLinks, parsePlainTextToNodes } from "@km/markdown"
import { INSERT_NODE_SQL, insertNodeRow } from "../db/insert.ts"
import type { DeferredFile, PendingLink } from "../repo/loader.ts"

const log = createLogger("km:storage:deferred-parsing")

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * km-fast-md.7: Parse deferred files in background after board renders.
 * Updates stub nodes with full content and creates child nodes.
 *
 * km-fast-md.6: Uses worker pool for parallel parsing when available.
 *
 * @param deferredFiles - Files to parse (from LoadResult.deferredFiles)
 * @param shouldAbort - Optional callback that returns true to abort parsing
 * @param options - Optional configuration (useWorkerPool defaults to true)
 * @returns Object with parsed count and pending links for resolution
 */
export async function parseDeferredAsync(
  db: Database,
  deferredFiles: DeferredFile[],
  shouldAbort?: () => boolean,
  options?: { useWorkerPool?: boolean; onProgress?: (completed: number, total: number) => void },
): Promise<{ parsed: number; pendingLinks: PendingLink[] }> {
  const total = deferredFiles.length
  if (total === 0) return { parsed: 0, pendingLinks: [] }

  const useWorkerPool = options?.useWorkerPool ?? true

  if (useWorkerPool && total >= 4) {
    return parseDeferredWithPool(db, deferredFiles, shouldAbort, options?.onProgress)
  }

  return parseDeferredSequential(db, deferredFiles, shouldAbort)
}

/**
 * Parse a single stub file synchronously.
 *
 * Use when targeting a specific file in discoverOnly mode - parse that file
 * eagerly so it has content before the board renders.
 *
 * @param db - Database instance
 * @param nodeId - The stub node ID
 * @param fsPath - Filesystem path to the markdown file
 * @returns true if parsed successfully, false if stub not found or parse failed
 */
// oxlint-disable-next-line complexity/complexity -- Stub-to-full parse with INSERT — shares insertNodeRow helper
export function parseStubFile(db: Database, nodeId: string, fsPath: string, relativePath?: string): boolean {
  log.debug?.(`parseStubFile: parsing ${fsPath}`)

  try {
    const content = readFileSync(fsPath, "utf-8")
    const isTxt = fsPath.endsWith(".txt")
    // Use relative path for the parser so fs_path in nodes is relative to repo root
    const parserPath = relativePath ?? fsPath
    const { nodes } = isTxt ? parsePlainTextToNodes(content, parserPath) : parseMarkdownWithLinks(content, parserPath)

    const stubRow = db.prepare("SELECT parent_id, parent_idx, parsed FROM nodes WHERE id = ?").get(nodeId) as {
      parent_id: string | null
      parent_idx: number
      parsed: number
    } | null

    if (!stubRow) {
      log.debug?.(`parseStubFile: stub ${nodeId} not found`)
      return false
    }

    // Skip if already parsed — prevents double-parse duplicates and metadata loss.
    // The `parsed` flag catches title-only files (no children) that the old
    // childCount > 0 guard missed.
    if (stubRow.parsed) {
      log.debug?.(`parseStubFile: ${nodeId} already parsed, skipping`)
      return true
    }

    db.run("BEGIN IMMEDIATE")

    try {
      // Re-check under transaction (another thread may have parsed between our check and BEGIN)
      const childCount = (
        db.prepare("SELECT count(*) as cnt FROM nodes WHERE parent_id = ?").get(nodeId) as { cnt: number }
      ).cnt
      if (childCount > 0) {
        // Children exist (from prior parse or events) — mark parsed and skip
        db.prepare("UPDATE nodes SET parsed = 1 WHERE id = ?").run(nodeId)
        db.run("COMMIT")
        return true
      }
      db.prepare("DELETE FROM nodes WHERE id = ?").run(nodeId)

      const fileNode = nodes[0]
      const originalFileId = fileNode?.id
      if (
        fileNode?.type === "h" &&
        fileNode.item &&
        (fileNode.fstype === "file" || fileNode.fstype === "mdfile" || fileNode.fstype === "txtfile")
      ) {
        fileNode.id = nodeId
        fileNode.parent_id = stubRow.parent_id
        fileNode.parent_idx = stubRow.parent_idx

        // Update child nodes to point to the preserved file node ID
        for (const node of nodes) {
          if (node.parent_id === originalFileId) {
            node.parent_id = nodeId
          }
        }
      }

      const insertStmt = db.prepare(INSERT_NODE_SQL)

      const now = Date.now()
      for (const node of nodes) {
        insertNodeRow(insertStmt, node, now)
      }

      // Mark the file node as parsed
      db.prepare("UPDATE nodes SET parsed = 1 WHERE id = ?").run(nodeId)

      db.run("COMMIT")
      log.debug?.(`parseStubFile: success, ${nodes.length} nodes`)
      return true
    } catch (error) {
      db.run("ROLLBACK")
      throw error
    }
  } catch (err) {
    // F10: Log at WARN so per-file parse errors are visible during normal operation
    log.warn?.(`parseStubFile: error parsing ${fsPath}: ${String(err)}`)
    return false
  }
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Delete all descendants of a node (recursive subtree, not the node itself).
 * Used before re-parsing a file to prevent duplicate children when changes.jsonl
 * or a prior parse already created children under the same parent.
 */
export function deleteSubtreeChildren(db: Database, nodeId: string): void {
  db.prepare(
    `DELETE FROM nodes WHERE id IN (
      WITH RECURSIVE sub(id) AS (
        SELECT id FROM nodes WHERE parent_id = ?1
        UNION ALL
        SELECT n.id FROM nodes n JOIN sub s ON n.parent_id = s.id
      ) SELECT id FROM sub
    )`,
  ).run(nodeId)
}

/**
 * km-fast-md.6: Parse files in parallel using worker pool.
 */
async function parseDeferredWithPool(
  db: Database,
  deferredFiles: DeferredFile[],
  _shouldAbort?: () => boolean,
  onProgress?: (completed: number, total: number) => void,
): Promise<{ parsed: number; pendingLinks: PendingLink[] }> {
  const total = deferredFiles.length
  log.debug?.(`parseDeferredWithPool: starting ${total} files with pipeline`)

  await using pool = createParsePool()
  await pool.start()

  const result = await runDeferredPipeline(db, deferredFiles, pool, { onProgress })

  // Links have already been written to the DB by runDeferredPipeline's
  // applyLinks stage. The v4 schema carries only (host_id, href, rel), so
  // there's nothing to re-derive into PendingLink shape here — return an
  // empty list and let callers rely on the persisted rows.
  log.debug?.(`parseDeferredWithPool: completed, ${result.parsed} parsed, ${result.pendingLinks.length} links applied`)

  return { parsed: result.parsed, pendingLinks: [] }
}

/**
 * Parse a single deferred file: read markdown, replace stub with full nodes.
 * Returns the wikilinks found, or null if the stub was not found.
 */
function parseOneFile(
  db: Database,
  insertStmt: ReturnType<Database["prepare"]>,
  deleteStmt: ReturnType<Database["prepare"]>,
  deferredFile: DeferredFile,
): PendingLink[] | null {
  const { nodeId, fsPath } = deferredFile
  const content = readFileSync(fsPath, "utf-8")
  const isTxt = fsPath.endsWith(".txt")
  const { nodes, wikilinks } = isTxt ? parsePlainTextToNodes(content, fsPath) : parseMarkdownWithLinks(content, fsPath)

  const stubRow = db.prepare("SELECT parent_id, parent_idx, fs_path, parsed FROM nodes WHERE id = ?").get(nodeId) as {
    parent_id: string | null
    parent_idx: number
    fs_path: string | null
    parsed: number
  } | null

  if (!stubRow) {
    log.debug?.(`parseDeferredSequential: stub ${nodeId} not found, skipping`)
    return null
  }

  // Skip if already parsed — prevents double-parse duplicates and metadata loss
  if (stubRow.parsed) return null

  // Also skip if children exist (from events or prior parse that didn't set flag)
  const childCount = (
    db.prepare("SELECT count(*) as cnt FROM nodes WHERE parent_id = ?").get(nodeId) as { cnt: number }
  ).cnt
  if (childCount > 0) {
    // Mark parsed for future checks, then skip
    db.prepare("UPDATE nodes SET parsed = 1 WHERE id = ?").run(nodeId)
    return null
  }

  deleteStmt.run(nodeId)

  const fileNode = nodes[0]
  if (
    fileNode?.type === "h" &&
    fileNode.item &&
    (fileNode.fstype === "file" || fileNode.fstype === "mdfile" || fileNode.fstype === "txtfile")
  ) {
    const originalFileId = fileNode.id
    fileNode.id = nodeId
    fileNode.parent_id = stubRow.parent_id
    fileNode.parent_idx = stubRow.parent_idx
    // Preserve relative fs_path from the stub (parser sets absolute path)
    if (stubRow.fs_path) {
      fileNode.fs_path = stubRow.fs_path
    }
    // Update child nodes to point to the preserved file node ID
    for (const node of nodes) {
      if (node.parent_id === originalFileId) {
        node.parent_id = nodeId
      }
    }
  }

  const now = Date.now()
  for (const node of nodes) {
    insertNodeRow(insertStmt, node, now)
  }

  // Mark the file node as parsed
  db.prepare("UPDATE nodes SET parsed = 1 WHERE id = ?").run(nodeId)

  return wikilinks
}

/**
 * Sequential parsing (original implementation, used for small file counts).
 */
async function parseDeferredSequential(
  db: Database,
  deferredFiles: DeferredFile[],
  shouldAbort?: () => boolean,
): Promise<{ parsed: number; pendingLinks: PendingLink[] }> {
  const total = deferredFiles.length
  log.debug?.(`parseDeferredSequential: starting ${total} files`)
  const pendingLinks: PendingLink[] = []
  const BATCH_SIZE = 10
  let parsed = 0

  db.run("BEGIN IMMEDIATE")

  try {
    const deleteStmt = db.prepare("DELETE FROM nodes WHERE id = ?")
    const insertStmt = db.prepare(INSERT_NODE_SQL)

    for (const [i, deferredFile] of deferredFiles.entries()) {
      try {
        const links = parseOneFile(db, insertStmt, deleteStmt, deferredFile)
        if (links === null) continue

        for (const wikilink of links) {
          pendingLinks.push(wikilink)
        }
        parsed++
      } catch (err) {
        // F10: Log at WARN so per-file parse errors are visible during normal operation
        log.warn?.(`parseDeferredSequential: error parsing ${deferredFile.fsPath}: ${String(err)}`)
      }

      if (i % BATCH_SIZE === 0) {
        await new Promise((resolve) => {
          setImmediate(resolve)
        })
        if (shouldAbort?.()) {
          log.debug?.(`parseDeferredSequential: aborted at ${i}/${total}`)
          break
        }
      }
    }

    db.run("COMMIT")
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }

  log.debug?.(`parseDeferredSequential: completed, ${parsed} parsed, ${pendingLinks.length} links`)

  return { parsed, pendingLinks }
}
