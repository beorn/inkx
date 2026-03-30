/**
 * Operation applier - applies reconciliation operations to the database
 *
 * Shared applier for both sync and async modes. The only difference is
 * whether markdown files have pre-parsed content available.
 */

import { createLogger } from "loggily"
import type { Database } from "bun:sqlite"
import { ulid } from "ulid"
import type { Emitter } from "../emitter.ts"
import { getNode, getChildren } from "../index.ts"
import { findIndexFile } from "@km/core"
import { buildIndexContent, indexFileName } from "../index-file-writer.ts"
import { getFolderIndexConfig } from "../config.ts"
import { toAbsoluteFsPath } from "../path-utils.ts"
import { join } from "path"
import { createLinkResolver } from "../link-resolver.ts"
import { resolveLinksBatch } from "../db-links.ts"
import type { FileSystemOps } from "./writequeue.ts"
import { realFs } from "./writequeue.ts"
import type { ReconcileOp } from "./reconcile.ts"
import type { ParseResult } from "../parse-pool.ts"
import type { ParseSource } from "../pipeline.ts"
import { parseFiles, collect } from "../pipeline.ts"
import type { ParsePoolService } from "../parse-pool.ts"
import { handleCreate, handleUpdate, handleDelete, handleRename, type ReconcileContext } from "./handlers/index.ts"
import { syncIndexFileToFolder } from "./handlers/update-handler.ts"

const log = createLogger("km:storage:watch:reconcile")

/**
 * Options for apply operations
 */
export interface ApplyOptions {
  db: Database
  ops: ReconcileOp[]
  repoRoot: string
  emitter: Emitter
  fs?: FileSystemOps
}

/**
 * Options for async apply with parallel parsing
 */
interface ApplyAsyncOptions extends ApplyOptions {
  parsePool: ParsePoolService
}

/**
 * Apply reconciliation operations synchronously
 *
 * Parses markdown files inline during application.
 *
 * Supports both positional and options-based signatures:
 * - applyReconcileOps(db, ops, repoRoot, emitter, fs?)
 * - applyReconcileOps({ db, ops, repoRoot, emitter, fs? })
 */
export function applyReconcileOps(
  dbOrOptions: Database | ApplyOptions,
  ops?: ReconcileOp[],
  repoRoot?: string,
  emitter?: Emitter,
  fs?: FileSystemOps,
): void {
  // Normalize to options object
  let options: ApplyOptions
  if (typeof dbOrOptions === "object" && "db" in dbOrOptions) {
    options = dbOrOptions
  } else {
    if (!ops || !repoRoot || !emitter) {
      throw new Error("applyReconcileOps: missing required arguments (ops, repoRoot, emitter)")
    }
    options = {
      db: dbOrOptions as Database,
      ops,
      repoRoot,
      emitter,
      fs,
    }
  }

  const { db, ops: reconcileOps, repoRoot: root, emitter: emit, fs: fileOps = realFs } = options

  using span = log.span("apply-ops", { count: reconcileOps.length })

  // Build lookup map once for efficient link resolution
  let resolver: ReturnType<typeof createLinkResolver>
  {
    using resolverSpan = span.span("build-resolver")
    resolver = createLinkResolver(db)
    resolverSpan.spanData.files = resolver.size
  }

  // Context for collecting new files for batch link resolution
  const ctx: ReconcileContext = { newFiles: [], resolver }

  for (const op of reconcileOps) {
    using opSpan = span.span("apply-op", { type: op.type, path: op.path })
    applyOp(db, op, root, emit, fileOps, ctx)
    void opSpan // used via dispose
  }

  // Batch resolve links and sync index files for all new files at once
  finalizeBatchLinks(db, ctx, emit, root, fileOps)
}

/**
 * Apply reconciliation operations with parallel parsing
 *
 * Uses async generator pipeline to parse markdown files in parallel,
 * then applies the results sequentially (DB writes must be serial).
 *
 * This is ~3x faster than applyReconcileOps for bulk operations (10+ files).
 *
 * Supports both positional and options-based signatures:
 * - applyReconcileOpsAsync(db, ops, repoRoot, emitter, parsePool, fs?)
 * - applyReconcileOpsAsync({ db, ops, repoRoot, emitter, parsePool, fs? })
 */
export async function applyReconcileOpsAsync(
  dbOrOptions: Database | ApplyAsyncOptions,
  ops?: ReconcileOp[],
  repoRoot?: string,
  emitter?: Emitter,
  parsePool?: ParsePoolService,
  fs?: FileSystemOps,
): Promise<void> {
  // Normalize to options object
  let options: ApplyAsyncOptions
  if (typeof dbOrOptions === "object" && "db" in dbOrOptions) {
    options = dbOrOptions
  } else {
    if (!ops || !repoRoot || !emitter || !parsePool) {
      throw new Error("applyReconcileOpsAsync: missing required arguments (ops, repoRoot, emitter, parsePool)")
    }
    options = {
      db: dbOrOptions as Database,
      ops,
      repoRoot,
      emitter,
      parsePool,
      fs,
    }
  }

  const { db, ops: reconcileOps, repoRoot: root, emitter: emit, parsePool: pool, fs: fileOps = realFs } = options

  log.debug?.(`applying ${reconcileOps.length} reconcile ops (async)`)
  const start = Date.now()

  // Parse all markdown files in parallel
  const parseResultMap = await parseMarkdownFiles(reconcileOps, pool)

  // Build lookup map once for efficient link resolution
  const resolver = createLinkResolver(db)
  log.debug?.(`resolver ready with ${resolver.size} files`)

  // Context for collecting new files for batch link resolution
  const ctx: ReconcileContext = { newFiles: [], resolver }

  // Apply ops sequentially (DB writes must be serial)
  for (const op of reconcileOps) {
    log.debug?.(`applying op: ${op.type} ${op.path}`)
    const parsed = parseResultMap.get(op.path)
    applyOp(db, op, root, emit, fileOps, ctx, parsed)
  }

  // Batch resolve links and sync index files for all new files at once
  finalizeBatchLinks(db, ctx, emit, root, fileOps)

  log.debug?.(`applied ${reconcileOps.length} ops (async) in ${Date.now() - start}ms`)
}

/**
 * Apply a single reconciliation operation
 */
function applyOp(
  db: Database,
  op: ReconcileOp,
  repoRoot: string,
  emitter: Emitter,
  fs: FileSystemOps,
  ctx: ReconcileContext,
  parsed?: ParseResult,
): void {
  switch (op.type) {
    case "create":
      handleCreate({ db, op, repoRoot, emitter, fs, ctx, parsed })
      break
    case "update":
      handleUpdate({ db, op, repoRoot, emitter, fs, ctx, parsed })
      break
    case "rename":
      handleRename(emitter, op, repoRoot, db, ctx)
      break
    case "delete":
      handleDelete(emitter, op, db, ctx)
      break
  }
}

/**
 * Parse markdown files in parallel using the pipeline
 */
async function parseMarkdownFiles(ops: ReconcileOp[], parsePool: ParsePoolService): Promise<Map<string, ParseResult>> {
  // Collect markdown files that need parsing
  const parseJobs: Array<{
    op: ReconcileOp
    nodeId: string
    isCreate: boolean
  }> = []

  for (const op of ops) {
    if (op.path.endsWith(".md")) {
      if (op.type === "create") {
        // Generate ID upfront for creates
        parseJobs.push({ op, nodeId: ulid(), isCreate: true })
      } else if (op.type === "update" && op.nodeId) {
        parseJobs.push({ op, nodeId: op.nodeId, isCreate: false })
      }
    }
  }

  if (parseJobs.length === 0) {
    return new Map()
  }

  log.debug?.(`parallel parsing ${parseJobs.length} markdown files via pipeline`)

  // Build sources for pipeline
  const sources: ParseSource[] = parseJobs.map((job) => ({
    path: job.op.path,
    nodeId: job.nodeId,
    isCreate: job.isCreate,
  }))

  // Use pipeline's parseFiles generator
  const parsedFiles = await collect(parseFiles(sources, parsePool))

  // Convert to ParseResult map
  const parseResultMap = new Map<string, ParseResult>()
  for (const file of parsedFiles) {
    parseResultMap.set(file.path, {
      nodeId: file.nodeId,
      fsPath: file.path,
      nodes: file.nodes as unknown[],
      wikilinks: file.wikilinks as unknown[],
      hash: file.hash,
      ino: file.ino,
      mtime: file.mtime,
      error: file.error,
    })
  }

  log.debug?.(`parsed ${parsedFiles.length} files via pipeline`)
  return parseResultMap
}

/**
 * Finalize batch link resolution and index file sync for all new files
 */
function finalizeBatchLinks(
  db: Database,
  ctx: ReconcileContext,
  emitter: Emitter,
  repoRoot: string,
  fs: FileSystemOps = realFs,
): void {
  if (ctx.newFiles.length > 0) {
    const resolved = resolveLinksBatch(db, ctx.newFiles)
    log.debug?.(`batch resolved ${resolved} links for ${ctx.newFiles.length} new files`)
  }

  // Collect all index files that need post-batch sync (creates + updates)
  const indexFilesToSync = new Set<string>()

  // Index files created this batch — now that all siblings exist
  if (ctx.indexFileCandidates?.length) {
    for (const { nodeId } of ctx.indexFileCandidates) {
      indexFilesToSync.add(nodeId)
    }
  }

  // Index files updated this batch — siblings created later may not have existed during initial sync
  if (ctx.modifiedIndexFiles?.size) {
    for (const nodeId of ctx.modifiedIndexFiles) {
      indexFilesToSync.add(nodeId)
    }
  }

  // Re-sync all collected index files
  for (const nodeId of indexFilesToSync) {
    syncIndexFileToFolder({
      db,
      op: { type: "update", path: "", nodeId } as ReconcileOp,
      repoRoot,
      emitter,
      fs,
      ctx,
    })
  }

  // Re-materialize index files for folders that lost their index file
  // AND refresh index files for folders whose children changed (create/delete/move)
  const allFolderIds = new Set<string>()
  if (ctx.foldersNeedingIndexUpdate?.size) {
    for (const id of ctx.foldersNeedingIndexUpdate) allFolderIds.add(id)
  }
  if (ctx.foldersToRefresh?.size) {
    for (const id of ctx.foldersToRefresh) allFolderIds.add(id)
  }

  if (allFolderIds.size > 0) {
    const config = getFolderIndexConfig(repoRoot)
    if (config.materialization !== "none") {
      const indexConfig = { materialization: config.materialization, naming: config.naming }
      for (const folderId of allFolderIds) {
        const folder = getNode(db, folderId)
        if (!folder?.fstype || folder.fstype !== "folder" || !folder.fs_path) continue

        const content = buildIndexContent(db, folder, indexConfig)
        if (!content) continue

        // Determine where to write: existing index file path or new file
        const children = getChildren(db, folderId)
        const existingIndex = findIndexFile(folder, children)

        if (existingIndex?.fs_path) {
          const absPath = toAbsoluteFsPath(repoRoot, existingIndex.fs_path)
          fs.writeFileSync(absPath, content)
        } else if (config.materialization === "full") {
          // Only "full" mode auto-creates index files
          const filename = indexFileName(folder.name ?? "", config.naming)
          const absPath = toAbsoluteFsPath(repoRoot, join(folder.fs_path, filename))
          fs.writeFileSync(absPath, content)
        }
      }
    }
  }
}
