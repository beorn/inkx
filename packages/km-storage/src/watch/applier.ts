/**
 * Operation applier - applies reconciliation operations to the database
 *
 * Shared applier for both sync and async modes. The only difference is
 * whether markdown files have pre-parsed content available.
 */

import createDebug from "debug"
import type { Database } from "bun:sqlite"
import { ulid } from "ulid"
import type { Emitter } from "../emitter.ts"
import { createLinkResolver } from "../link-resolver.ts"
import { resolveLinksBatch } from "../db-links.ts"
import type { FileSystemOps } from "./writequeue.ts"
import { realFs } from "./writequeue.ts"
import type { ReconcileOp } from "./reconcile.ts"
import type { ParseResult } from "../parse-pool.ts"
import type { ParseSource } from "../pipeline.ts"
import { parseFiles, collect } from "../pipeline.ts"
import type { ParsePoolService } from "../parse-pool.ts"
import {
  handleCreate,
  handleUpdate,
  handleDelete,
  handleRename,
  type ReconcileContext,
} from "./handlers/index.ts"

const debug = createDebug("km:storage:watch:reconcile")

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
export interface ApplyAsyncOptions extends ApplyOptions {
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
      throw new Error(
        "applyReconcileOps: missing required arguments (ops, repoRoot, emitter)",
      )
    }
    options = {
      db: dbOrOptions as Database,
      ops,
      repoRoot,
      emitter,
      fs,
    }
  }

  const {
    db,
    ops: reconcileOps,
    repoRoot: root,
    emitter: emit,
    fs: fileOps = realFs,
  } = options

  debug("applying %d reconcile ops", reconcileOps.length)
  const start = Date.now()

  // Build lookup map once for efficient link resolution
  const resolver = createLinkResolver(db)
  debug("resolver ready with %d files", resolver.size)

  // Context for collecting new files for batch link resolution
  const ctx: ReconcileContext = { newFiles: [], resolver }

  for (const op of reconcileOps) {
    debug("applying op: %s %s", op.type, op.path)
    applyOp(db, op, root, emit, fileOps, ctx)
  }

  // Batch resolve links for all new files at once
  finalizeBatchLinks(db, ctx)

  debug("applied %d ops in %dms", reconcileOps.length, Date.now() - start)
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
      throw new Error(
        "applyReconcileOpsAsync: missing required arguments (ops, repoRoot, emitter, parsePool)",
      )
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

  const {
    db,
    ops: reconcileOps,
    repoRoot: root,
    emitter: emit,
    parsePool: pool,
    fs: fileOps = realFs,
  } = options

  debug("applying %d reconcile ops (async)", reconcileOps.length)
  const start = Date.now()

  // Parse all markdown files in parallel
  const parseResultMap = await parseMarkdownFiles(reconcileOps, pool)

  // Build lookup map once for efficient link resolution
  const resolver = createLinkResolver(db)
  debug("resolver ready with %d files", resolver.size)

  // Context for collecting new files for batch link resolution
  const ctx: ReconcileContext = { newFiles: [], resolver }

  // Apply ops sequentially (DB writes must be serial)
  for (const op of reconcileOps) {
    debug("applying op: %s %s", op.type, op.path)
    const parsed = parseResultMap.get(op.path)
    applyOp(db, op, root, emit, fileOps, ctx, parsed)
  }

  // Batch resolve links for all new files at once
  finalizeBatchLinks(db, ctx)

  debug("applied %d ops (async) in %dms", reconcileOps.length, Date.now() - start)
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
      handleUpdate({ db, op, emitter, fs, ctx, parsed })
      break
    case "rename":
      handleRename(emitter, op)
      break
    case "delete":
      handleDelete(emitter, op)
      break
  }
}

/**
 * Parse markdown files in parallel using the pipeline
 */
async function parseMarkdownFiles(
  ops: ReconcileOp[],
  parsePool: ParsePoolService,
): Promise<Map<string, ParseResult>> {
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

  debug("parallel parsing %d markdown files via pipeline", parseJobs.length)

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

  debug("parsed %d files via pipeline", parsedFiles.length)
  return parseResultMap
}

/**
 * Finalize batch link resolution for all new files
 */
function finalizeBatchLinks(db: Database, ctx: ReconcileContext): void {
  if (ctx.newFiles.length > 0) {
    const resolved = resolveLinksBatch(db, ctx.newFiles)
    debug(
      "batch resolved %d links for %d new files",
      resolved,
      ctx.newFiles.length,
    )
  }
}
