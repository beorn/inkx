/**
 * Composable Async Generator Pipeline
 *
 * Unified pipeline for loading and syncing markdown files.
 * Replaces duplicated code in repo-loader.ts and reconcile.ts.
 *
 * Architecture:
 *   Sources (file paths)
 *       ↓
 *   parseFiles()      ← Streaming: yields as workers complete
 *       ↓
 *   applyNodes()      ← Buffering: exhausts upstream, then yields
 *       ↓
 *   pipelineResolveLinks()    ← Buffering: needs all nodes first
 *       ↓
 *   applyLinks()      ← Buffering: batch INSERT
 *
 * Each stage is an async generator. Stages that need buffering
 * exhaust their upstream generator before proceeding.
 *
 * Usage:
 *   const parsed = parseFiles(sources, pool)
 *   const applied = applyNodes(parsed, db, { emitter })
 *   const resolved = pipelineResolveLinks(applied, db)
 *   const done = applyLinks(resolved, db)
 *   await runPipeline(done)
 */

import { createLogger } from "loggily"
import type { Database } from "bun:sqlite"
import { basename } from "path"
import type { KNode } from "@km/core"
import type { ParsePoolService } from "./parse-pool.ts"
import type { Emitter } from "../emitter.ts"
import { emitNodeCreated, emitNodeUpdated } from "../emitter.ts"
import { createLinkResolver } from "./link-resolver.ts"
import { resolveWikilink, type WikilinkRef, type ResolvedLink } from "./processing.ts"
import { INSERT_NODE_PLAIN_SQL, insertNodeRow } from "../db/insert.ts"

const log = createLogger("km:storage:pipeline")

// ============================================================================
// TYPES
// ============================================================================

/** Input source for parsing */
export interface ParseSource {
  path: string
  nodeId: string
  isCreate: boolean
}

/** Stage 1 output: parsed file ready for application */
export interface ParsedFile {
  path: string
  nodeId: string
  nodes: KNode[]
  wikilinks: WikilinkRef[]
  hash: string
  ino: number
  mtime: number
  isCreate: boolean
  error?: string
}

/** Stage 2 output: applied node with wikilinks for resolution */
export interface AppliedFile {
  nodeId: string
  name: string
  path: string
  wikilinks: WikilinkRef[]
}

/** Pipeline options shared across stages */
export interface PipelineOptions {
  signal?: AbortSignal
  emitter?: Emitter
  repoRoot?: string
  /** For creates: pre-computed parent info from stub lookup */
  stubInfo?: Map<string, { parent_id: string | null; parent_idx: number; fs_path: string | null }>
  /** For updates: map of old ID -> new ID for node matching */
  idMap?: Map<string, string>
  /** Called after each batch commit with (completedFiles, totalFiles) */
  onProgress?: (completed: number, total: number) => void
}

// ============================================================================
// STAGE 1: parseFiles - Streaming
// ============================================================================

/**
 * Parse markdown files using worker pool.
 * Streams results as workers complete (not in order, but fast).
 */
export async function* parseFiles(
  sources: ParseSource[],
  parsePool: ParsePoolService,
  signal?: AbortSignal,
): AsyncGenerator<ParsedFile> {
  if (sources.length === 0) return

  log.debug?.(`parseFiles: starting ${sources.length} files`)

  // Build lookup for isCreate flag
  const sourceMap = new Map<string, ParseSource>()
  for (const source of sources) {
    sourceMap.set(source.path, source)
  }

  // Stream results from worker pool
  const files = sources.map((s) => ({ nodeId: s.nodeId, fsPath: s.path }))
  for await (const result of parsePool.stream(files, signal)) {
    if (signal?.aborted) return

    const source = sourceMap.get(result.fsPath)
    if (!source) continue

    if (result.error) {
      // F9: Log parse errors at WARN so users can see which files failed.
      // The file's stub node persists but won't be populated — better than
      // creating a corrupt stub that looks valid.
      log.warn?.(`parseFiles: parse error for ${result.fsPath}: ${result.error}`)
      continue
    }

    yield {
      path: result.fsPath,
      nodeId: result.nodeId,
      nodes: result.nodes as KNode[],
      wikilinks: result.wikilinks as WikilinkRef[],
      hash: result.hash,
      ino: result.ino,
      mtime: result.mtime,
      isCreate: source.isCreate,
    }
  }

  log.debug?.("parseFiles: completed")
}

// ============================================================================
// STAGE 2: applyNodes - Buffering
// ============================================================================

/**
 * Apply parsed nodes to database.
 * Exhausts upstream, then applies in batched transactions to avoid blocking
 * the event loop. Each batch commits independently and yields to the event
 * loop between batches so the UI stays responsive during background parsing.
 */
export async function* applyNodes(
  upstream: AsyncGenerator<ParsedFile>,
  db: Database,
  options: PipelineOptions = {},
): AsyncGenerator<AppliedFile> {
  const { signal, emitter, stubInfo, onProgress } = options

  // Collect all parsed files (exhaust upstream)
  const files: ParsedFile[] = []
  for await (const file of upstream) {
    if (signal?.aborted) return
    files.push(file)
  }

  if (files.length === 0) return

  log.debug?.(`applyNodes: applying ${files.length} files`)

  // Prepare statements
  const deleteStmt = db.prepare("DELETE FROM nodes WHERE id = ?")
  const insertStmt = db.prepare(INSERT_NODE_PLAIN_SQL)

  const now = Date.now()

  // Apply in batched transactions — commit every BATCH_SIZE files to avoid
  // holding BEGIN IMMEDIATE for too long (which blocks the event loop and
  // freezes the UI during background parsing of deferred stubs).
  const BATCH_SIZE = 5
  let batchStart = 0

  while (batchStart < files.length) {
    if (signal?.aborted) return

    const batchEnd = Math.min(batchStart + BATCH_SIZE, files.length)

    db.run("BEGIN IMMEDIATE")
    try {
      for (let i = batchStart; i < batchEnd; i++) {
        const file = files[i]!
        if (file.error) continue

        if (file.isCreate) {
          insertFileNodes(file, insertStmt, deleteStmt, db, stubInfo, emitter, now)
        } else {
          updateFileMetadata(file, db, emitter, now)
        }
      }
      db.run("COMMIT")
    } catch (error) {
      db.run("ROLLBACK")
      throw error
    }

    // Yield applied files for next stage
    for (let i = batchStart; i < batchEnd; i++) {
      const file = files[i]!
      if (file.error) continue
      const name = basename(file.path).replace(/\.md$/, "")
      yield {
        nodeId: file.nodeId,
        name,
        path: file.path,
        wikilinks: file.wikilinks,
      }
    }

    batchStart = batchEnd

    // Report progress and yield to event loop between batches
    if (onProgress) onProgress(batchStart, files.length)
    if (batchStart < files.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  log.debug?.(`applyNodes: committed ${files.length} files in ${Math.ceil(files.length / BATCH_SIZE)} batches`)
}

// ============================================================================
// STAGE 3: pipelineResolveLinks - Buffering
// ============================================================================

/**
 * Resolve wikilinks using LinkResolver.
 * Exhausts upstream (building resolver), then yields resolved links.
 */
export async function* pipelineResolveLinks(
  upstream: AsyncGenerator<AppliedFile>,
  db: Database,
  signal?: AbortSignal,
): AsyncGenerator<ResolvedLink> {
  // Build resolver from existing files and collect pending links
  const resolver = createLinkResolver(db)
  const pendingLinks: Array<{ file: AppliedFile; link: WikilinkRef }> = []

  // Exhaust upstream: register files AND collect their links
  for await (const file of upstream) {
    if (signal?.aborted) return

    // Add file to resolver (so subsequent files can link to it)
    resolver.addFile(file.nodeId, file.name)

    // Collect links for resolution
    for (const link of file.wikilinks) {
      pendingLinks.push({ file, link })
    }
  }

  log.debug?.(`pipelineResolveLinks: resolving ${pendingLinks.length} links`)

  // Now all files exist - resolve and yield links
  for (const { link } of pendingLinks) {
    if (signal?.aborted) return

    yield resolveWikilink(link, resolver)
  }

  log.debug?.("pipelineResolveLinks: completed")
}

// ============================================================================
// STAGE 4: applyLinks - Buffering
// ============================================================================

/**
 * Batch insert resolved links into database.
 * Exhausts upstream, then inserts in single transaction.
 */
export async function* applyLinks(
  upstream: AsyncGenerator<ResolvedLink>,
  db: Database,
  signal?: AbortSignal,
): AsyncGenerator<void> {
  // Collect all links
  const links: ResolvedLink[] = []
  const embeddedUpdates: Array<{
    host_id: string
    target_id: string
    alias: string | null
  }> = []

  for await (const link of upstream) {
    if (signal?.aborted) return
    links.push(link)

    // Track embedded links for node updates (embed_of still lives on nodes)
    if (link.rel === "embed" && link.embedTargetId) {
      embeddedUpdates.push({
        host_id: link.host_id,
        target_id: link.embedTargetId,
        alias: link.alias,
      })
    }
  }

  if (links.length === 0) return

  log.debug?.(`applyLinks: inserting ${links.length} links`)

  // Batch insert in single transaction
  db.run("BEGIN IMMEDIATE")
  try {
    const insertStmt = db.prepare(`INSERT INTO links (host_id, href, rel) VALUES (?, ?, ?)`)
    for (const link of links) {
      insertStmt.run(link.host_id, link.href, link.rel)
      yield // Progress indication
    }

    // Batch UPDATE for embedded links (update source node's embed_of)
    if (embeddedUpdates.length > 0) {
      const now = Date.now()
      const updateStmt = db.prepare(`UPDATE nodes SET embed_of = ?, name = ?, updated_at = ? WHERE id = ?`)
      for (const update of embeddedUpdates) {
        updateStmt.run(update.target_id, update.alias, now, update.host_id)
      }
    }

    db.run("COMMIT")
    log.debug?.(`applyLinks: committed ${links.length} links`)
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Run a pipeline to completion.
 * Returns the count of items processed.
 */
export async function runPipeline<T>(pipeline: AsyncGenerator<T>, onProgress?: (item: T) => void): Promise<number> {
  let count = 0
  for await (const item of pipeline) {
    onProgress?.(item)
    count++
  }
  return count
}

/**
 * Collect all items from a generator into an array.
 */
export async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of gen) {
    items.push(item)
  }
  return items
}

/**
 * Convert an array to an async generator.
 * Note: async function* is required for AsyncGenerator return type,
 * even though no await is needed.
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function* toAsyncGenerator<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item
  }
}

// ============================================================================
// APPLY HELPERS
// ============================================================================

/** Insert nodes for a newly created file, handling stub replacement. */
function insertFileNodes(
  file: ParsedFile,
  insertStmt: ReturnType<Database["prepare"]>,
  deleteStmt: ReturnType<Database["prepare"]>,
  db: Database,
  stubInfo: Map<string, { parent_id: string | null; parent_idx: number; fs_path: string | null }> | undefined,
  emitter: Emitter | undefined,
  now: number,
): void {
  // Get stub info if available (for deferred parsing)
  const stub = stubInfo?.get(file.nodeId)

  // Patch file node to match stub: preserve ID, parent info, and relative fs_path.
  // Re-parent children so they reference the stub ID (not the parser-generated ID).
  const fileNode = file.nodes[0]
  if (fileNode && stub) {
    const originalFileId = fileNode.id
    fileNode.id = file.nodeId
    fileNode.parent_id = stub.parent_id
    fileNode.parent_idx = stub.parent_idx
    if (stub.fs_path) {
      fileNode.fs_path = stub.fs_path
    }
    for (const node of file.nodes) {
      if (node.parent_id === originalFileId) {
        node.parent_id = file.nodeId
      }
    }
  }

  // Skip if already parsed — prevents double-parse duplicates and metadata loss.
  // Check both `parsed` flag (catches title-only files) and childCount (legacy guard).
  if (stub) {
    const parsedRow = db.prepare("SELECT parsed FROM nodes WHERE id = ?").get(file.nodeId) as { parsed: number } | null
    if (parsedRow?.parsed) return // Already parsed, skip

    const childCount = (
      db.prepare("SELECT count(*) as cnt FROM nodes WHERE parent_id = ?").get(file.nodeId) as { cnt: number }
    ).cnt
    if (childCount > 0) {
      // Mark parsed for future checks, then skip
      db.prepare("UPDATE nodes SET parsed = 1 WHERE id = ?").run(file.nodeId)
      return
    }
    deleteStmt.run(file.nodeId)
  }

  // Insert all nodes
  for (const node of file.nodes) {
    insertNodeRow(insertStmt, node, now)

    // Emit change if emitter provided (syncing path)
    if (emitter) {
      emitNodeCreated(emitter, "fs-watch", node as unknown as Record<string, unknown>)
    }
  }

  // Mark the file node as parsed
  if (stub) {
    db.prepare("UPDATE nodes SET parsed = 1 WHERE id = ?").run(file.nodeId)
  }
}

/** Update file-level metadata for an existing file. */
function updateFileMetadata(file: ParsedFile, db: Database, emitter: Emitter | undefined, now: number): void {
  if (!file.nodes[0]) return

  const updates: Record<string, unknown> = {
    fs_mtime: file.mtime,
    fs_ino: file.ino,
    content_hash: file.hash,
  }

  db.run(`UPDATE nodes SET fs_mtime = ?, fs_ino = ?, content_hash = ?, updated_at = ? WHERE id = ?`, [
    file.mtime,
    file.ino,
    file.hash,
    now,
    file.nodeId,
  ])

  // Emit update change if emitter provided
  if (emitter) {
    emitNodeUpdated(emitter, "fs-watch", file.nodeId, updates)
  }
}

// ============================================================================
// COMPOSED PIPELINES
// ============================================================================

/**
 * Run the full deferred parsing pipeline.
 * Used by repo-loader for background parsing after initial load.
 *
 * @param db - Database instance
 * @param deferredFiles - Files to parse
 * @param pool - Parse worker pool
 * @param options - Pipeline options
 * @returns Parsed count and pending links
 */
export async function runDeferredPipeline(
  db: Database,
  deferredFiles: Array<{ nodeId: string; fsPath: string }>,
  pool: ParsePoolService,
  options: PipelineOptions = {},
): Promise<{ parsed: number; pendingLinks: ResolvedLink[] }> {
  const { signal } = options

  // Build stub info from existing nodes
  const stubInfo = new Map<string, { parent_id: string | null; parent_idx: number; fs_path: string | null }>()
  for (const { nodeId } of deferredFiles) {
    const row = db.prepare("SELECT parent_id, parent_idx, fs_path FROM nodes WHERE id = ?").get(nodeId) as {
      parent_id: string | null
      parent_idx: number
      fs_path: string | null
    } | null
    if (row) {
      stubInfo.set(nodeId, row)
    }
  }

  // Build sources
  const sources: ParseSource[] = deferredFiles.map((f) => ({
    path: f.fsPath,
    nodeId: f.nodeId,
    isCreate: true,
  }))

  // Compose pipeline: parse → apply → resolve
  const parsed = parseFiles(sources, pool, signal)
  const applied = applyNodes(parsed, db, { ...options, stubInfo })
  const resolved = pipelineResolveLinks(applied, db, signal)

  // Collect resolved links (don't apply yet - let caller decide)
  const pendingLinks = await collect(resolved)

  // Apply links - wrap array as async generator
  const linkGen = applyLinks(toAsyncGenerator(pendingLinks), db, signal)
  await runPipeline(linkGen)

  const parsedCount = stubInfo.size
  log.debug?.(`runDeferredPipeline: ${parsedCount} parsed, ${pendingLinks.length} links`)

  return { parsed: parsedCount, pendingLinks }
}
