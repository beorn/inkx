/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
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
import { emitNodeCreated } from "../emitter.ts"
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

  // Collect metadata back-writes for post-batch emission. When an emitter is
  // provided, updateFileMetadata queues the update here instead of writing
  // directly — so DB + changes.jsonl are paired per row via emitter.commit
  // (op-vocabulary audit G9). An outer SQL txn cannot help: appendFileSync is
  // not part of SQLite and cannot be rolled back, so emitting inside BEGIN
  // IMMEDIATE would leave an orphan journal entry if the batch rolled back.
  const pendingMetadataEmits: Array<{
    nodeId: string
    data: { fs_mtime: number; fs_ino: number; content_hash: string }
  }> = []

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
          updateFileMetadata(file, db, emitter, now, pendingMetadataEmits)
        }
      }
      db.run("COMMIT")
    } catch (error) {
      db.run("ROLLBACK")
      throw error
    }

    // After the batch commits, route queued metadata updates through
    // emitter.commit so DB + journal pair per row. commit() (not apply())
    // because this is FS-origin — the disk moved, we're realigning in-memory
    // state. apply() would fire onApply subscribers and re-project back to FS.
    if (emitter && pendingMetadataEmits.length > 0) {
      for (const update of pendingMetadataEmits) {
        emitter.commit({
          type: "node_updated",
          target: update.nodeId,
          actor: "fs-watch",
          data: update.data,
        })
      }
      pendingMetadataEmits.length = 0
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
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
      })
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
 *
 * When `emitter` is provided, embed_of back-writes route through
 * `emitter.commit()` — DB + journal paired per row (op-vocabulary audit G4).
 * Without emitter, falls back to a direct UPDATE inside the links batch txn
 * (initial repo-load path where journaling is bootstrap-noise).
 */
export async function* applyLinks(
  upstream: AsyncGenerator<ResolvedLink>,
  db: Database,
  signal?: AbortSignal,
  emitter?: Emitter,
): AsyncGenerator<void> {
  // Collect all links
  const links: ResolvedLink[] = []
  const embeddedUpdates: Array<{
    host_id: string
    embed_of: string
    alias: string | null
  }> = []

  for await (const link of upstream) {
    if (signal?.aborted) return
    links.push(link)

    // Track embedded links for node updates (embed_of still lives on nodes)
    if (link.rel === "embed" && link.embedTargetId) {
      embeddedUpdates.push({
        host_id: link.host_id,
        embed_of: link.embedTargetId,
        alias: link.alias,
      })
    }
  }

  if (links.length === 0) return

  log.debug?.(`applyLinks: inserting ${links.length} links`)

  // Batch insert links in a single transaction.
  db.run("BEGIN IMMEDIATE")
  try {
    const insertStmt = db.prepare(`INSERT INTO links (host_id, href, rel) VALUES (?, ?, ?)`)
    for (const link of links) {
      insertStmt.run(link.host_id, link.href, link.rel)
      yield // Progress indication
    }

    // When no emitter is provided, the embed_of back-writes also live in
    // this batch txn — bootstrap/initial-load path, journaling not needed.
    if (embeddedUpdates.length > 0 && !emitter) {
      const now = Date.now()
      const updateStmt = db.prepare(`UPDATE nodes SET embed_of = ?, name = ?, updated_at = ? WHERE id = ?`)
      for (const update of embeddedUpdates) {
        updateStmt.run(update.embed_of, update.alias, now, update.host_id)
      }
    }

    db.run("COMMIT")
    log.debug?.(`applyLinks: committed ${links.length} links`)
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }

  // When an emitter is provided, route the embed_of back-writes outside the
  // links batch transaction so DB + journal pair per row (op-vocabulary
  // audit G4). An outer SQL txn would not help — appendFileSync is not part
  // of SQLite and cannot be rolled back. commit() (not apply()) avoids
  // echoing these derived updates back to the FS projection subscribers.
  if (embeddedUpdates.length > 0 && emitter) {
    for (const update of embeddedUpdates) {
      emitter.commit({
        type: "node_updated",
        target: update.host_id,
        actor: "fs-watch",
        data: { embed_of: update.embed_of, name: update.alias },
      })
    }
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

/**
 * Update file-level metadata for an existing file.
 *
 * When `emitter` is provided, queues the update into `pendingEmits` so the
 * caller can route it through `emitter.commit()` after the batch transaction
 * commits — DB + changes.jsonl paired per row (op-vocabulary audit G9).
 * Using `commit` (not `apply`) avoids firing onApply subscribers — same
 * carve-out as the sibling back-writes in change-handlers.ts.
 *
 * When `emitter` is absent (bootstrap / initial repo-load), falls back to a
 * direct UPDATE inside the batch txn — same carve-out as the embed_of back-
 * writes in applyLinks and the scanner/loader op-surface.
 */
function updateFileMetadata(
  file: ParsedFile,
  db: Database,
  emitter: Emitter | undefined,
  now: number,
  pendingEmits: Array<{
    nodeId: string
    data: { fs_mtime: number; fs_ino: number; content_hash: string }
  }>,
): void {
  if (!file.nodes[0]) return

  if (emitter) {
    // Queue for post-batch emission. The single emitter.commit call will
    // perform the UPDATE via applyChangeWithDb AND append to changes.jsonl.
    pendingEmits.push({
      nodeId: file.nodeId,
      data: {
        fs_mtime: file.mtime,
        fs_ino: file.ino,
        content_hash: file.hash,
      },
    })
    return
  }

  // Bootstrap / initial-load fallback: no emitter, write directly inside the
  // current batch transaction. Journaling is not meaningful here because the
  // repo is being loaded from scratch.
  db.run(`UPDATE nodes SET fs_mtime = ?, fs_ino = ?, content_hash = ?, updated_at = ? WHERE id = ?`, [
    file.mtime,
    file.ino,
    file.hash,
    now,
    file.nodeId,
  ])
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

  // Apply links - wrap array as async generator. Pass emitter so embed_of
  // back-writes route through emitter.commit (DB + journal paired).
  const linkGen = applyLinks(toAsyncGenerator(pendingLinks), db, signal, options.emitter)
  await runPipeline(linkGen)

  const parsedCount = stubInfo.size
  log.debug?.(`runDeferredPipeline: ${parsedCount} parsed, ${pendingLinks.length} links`)

  return { parsed: parsedCount, pendingLinks }
}
