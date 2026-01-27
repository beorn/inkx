/**
 * Reconciliation
 *
 * Compares filesystem state to database state and generates operations
 */

import createDebug from "debug"
import type { Database } from "bun:sqlite"

const debug = createDebug("km:storage:watch:reconcile")
import type { FileSystemOps } from "./writequeue.ts"
import { realFs } from "./writequeue.ts"
import { dirname, basename } from "path"
import { ulid } from "ulid"
import type { KNode } from "@km/core"
import {
  emitNodeCreated,
  emitNodeUpdated,
  emitNodeDeleted,
  type Emitter,
} from "../emitter.ts"
import {
  getNodeByPath,
  getNodesUnderPath,
  getFileWithChildren,
  getNodeContentHash,
} from "../db-queries/core-lookup.ts"
import {
  findFileByName,
  findChildByContent,
} from "../db-queries/wikilink-resolver.ts"
import {
  addLink,
  removeLinksFromSource,
  resolveLinks,
  resolveLinksBatch,
} from "../db-links.ts"
import { createLinkResolver, type LinkResolver } from "../link-resolver.ts"
import {
  processMarkdownFile,
  toResolvedLinks,
  type ProcessedMarkdown,
  type WikilinkRef,
} from "../markdown-processing.ts"
import type { ParsePoolService, ParseResult } from "../parse-pool.ts"
import { parseFiles, collect, type ParseSource } from "../pipeline.ts"
import { scanDirectory } from "./watcher.ts"
import type { PatternMatcher } from "../ignore.ts"

export interface ReconcileOp {
  type: "create" | "update" | "rename" | "delete"
  path: string
  nodeId?: string
  oldPath?: string
  ino?: number
  mtime?: number
}

export interface FsEntry {
  path: string
  ino: number
  mtime: number
  isDirectory: boolean
  /** If true, entry is a symlink (typically skipped during scanning) */
  isSymlink?: boolean
}

export type DirectoryScanner = (
  dirPath: string,
  ignorePatterns?: string[] | PatternMatcher,
) => FsEntry[]

/**
 * Reconcile a directory - compare filesystem to database
 *
 * @param ignorePatterns - Either string[] (legacy) or PatternMatcher (fast, pre-compiled)
 */
export function reconcileDirectory(
  db: Database,
  dirPath: string,
  repoRoot: string,
  ignorePatterns?: string[] | PatternMatcher,
  scanner?: DirectoryScanner,
): ReconcileOp[] {
  const ops: ReconcileOp[] = []

  // Get filesystem state (pass ignore patterns to filter out ignored files)
  const fsEntries = scanner
    ? scanner(dirPath, ignorePatterns)
    : scanDirectory(dirPath, ignorePatterns)

  // Get database state for this directory (using km-storage abstraction)
  const dbNodes = getNodesUnderPath(db, dirPath)

  debug("reconciling", {
    dirPath,
    fsEntries: fsEntries.length,
    dbNodes: dbNodes.length,
  })

  // Index by inode and path for efficient lookup
  const dbByIno = new Map<number, KNode>()
  const dbByPath = new Map<string, KNode>()

  for (const node of dbNodes) {
    if (node.fs_ino) {
      dbByIno.set(node.fs_ino, node)
    }
    if (node.fs_path) {
      dbByPath.set(node.fs_path, node)
    }
  }

  // Process filesystem entries
  for (const entry of fsEntries) {
    const existingByIno = dbByIno.get(entry.ino)
    const existingByPath = dbByPath.get(entry.path)

    if (existingByIno && existingByIno.fs_path !== entry.path) {
      // Renamed (same inode, different path)
      ops.push({
        type: "rename",
        nodeId: existingByIno.id,
        oldPath: existingByIno.fs_path,
        path: entry.path,
        ino: entry.ino,
      })
    } else if (
      existingByPath &&
      existingByPath.fs_ino &&
      existingByPath.fs_ino !== entry.ino
    ) {
      // Atomic write: same path but different inode
      // This happens when editors save via temp file + rename (Vim, VSCode, etc.)
      // Treat as an update but also update the inode
      debug("atomic write detected", {
        path: entry.path,
        oldIno: existingByPath.fs_ino,
        newIno: entry.ino,
      })
      ops.push({
        type: "update",
        nodeId: existingByPath.id,
        path: entry.path,
        ino: entry.ino, // New inode to track
        mtime: entry.mtime,
      })
    } else if (!existingByPath) {
      // New file/folder
      ops.push({
        type: "create",
        path: entry.path,
        ino: entry.ino,
        mtime: entry.mtime,
      })
    } else if (entry.mtime !== existingByPath.fs_mtime && !entry.isDirectory) {
      // Modified (mtime changed - works for both forward and backward time changes)
      // Skip directories - their mtime changes when any file inside changes,
      // which is handled separately. We only care about .md file content changes.
      ops.push({
        type: "update",
        nodeId: existingByPath.id,
        path: entry.path,
        ino: entry.ino, // Also track inode in normal updates for consistency
        mtime: entry.mtime,
      })
    }

    // Remove from dbByPath so we can find deletions
    dbByPath.delete(entry.path)
  }

  // Remaining in dbByPath are deleted
  for (const [path, node] of dbByPath) {
    // Only include if it's directly in this directory
    if (dirname(path) === dirPath) {
      ops.push({
        type: "delete",
        nodeId: node.id,
        path,
      })
    }
  }

  if (ops.length > 0) {
    debug(
      "generated %d ops: %O",
      ops.length,
      ops.map((o) => ({ type: o.type, path: o.path })),
    )
  }

  return ops
}

/**
 * Recursively reconcile a directory and all subdirectories
 * Used when FSEvents coalesces multiple file events into a single directory event
 *
 * @param ignorePatterns - Either string[] (legacy) or PatternMatcher (fast, pre-compiled)
 */
export function reconcileDirectoryRecursive(
  db: Database,
  dirPath: string,
  repoRoot: string,
  ignorePatterns?: string[] | PatternMatcher,
  scanner?: DirectoryScanner,
): ReconcileOp[] {
  const ops: ReconcileOp[] = []

  // Reconcile this directory
  ops.push(
    ...reconcileDirectory(db, dirPath, repoRoot, ignorePatterns, scanner),
  )

  // Get subdirectories and recursively reconcile them
  const fsEntries = scanner
    ? scanner(dirPath, ignorePatterns)
    : scanDirectory(dirPath, ignorePatterns)
  for (const entry of fsEntries) {
    if (entry.isDirectory) {
      ops.push(
        ...reconcileDirectoryRecursive(
          db,
          entry.path,
          repoRoot,
          ignorePatterns,
          scanner,
        ),
      )
    }
  }

  return ops
}

/**
 * Context for tracking state during reconciliation.
 * Enables efficient link resolution via lookup maps.
 */
interface ReconcileContext {
  /** Newly created file nodes: {id, name} */
  newFiles: Array<{ id: string; name: string }>
  /** Pre-built lookup map for efficient link resolution */
  resolver: LinkResolver
}

/**
 * Apply reconciliation operations
 */
export function applyReconcileOps(
  db: Database,
  ops: ReconcileOp[],
  repoRoot: string,
  emitter: Emitter,
  fs: FileSystemOps = realFs,
): void {
  debug("applying %d reconcile ops", ops.length)
  const start = Date.now()

  // Build lookup map once for efficient link resolution (avoids O(n²) DB queries)
  const resolver = createLinkResolver(db)
  debug("resolver ready with %d files", resolver.size)

  // Context for collecting new files for batch link resolution
  const ctx: ReconcileContext = { newFiles: [], resolver }

  for (const op of ops) {
    debug("applying op: %s %s", op.type, op.path)
    switch (op.type) {
      case "create":
        handleCreate(db, op, repoRoot, emitter, fs, ctx)
        break
      case "update":
        handleUpdate(db, op, repoRoot, emitter, fs, ctx)
        break
      case "rename":
        handleRename(emitter, op)
        break
      case "delete":
        handleDelete(emitter, op)
        break
    }
  }

  // Batch resolve links for all new files at once (avoids O(n²) per-file resolution)
  if (ctx.newFiles.length > 0) {
    const resolved = resolveLinksBatch(db, ctx.newFiles)
    debug(
      "batch resolved %d links for %d new files",
      resolved,
      ctx.newFiles.length,
    )
  }

  debug("applied %d ops in %dms", ops.length, Date.now() - start)
}

/**
 * Ensure all ancestor folders exist as nodes, creating them if needed.
 * Returns the ID of the immediate parent folder node.
 */
function ensureFolderHierarchy(
  db: Database,
  path: string,
  repoRoot: string,
  emitter: Emitter,
  fs: FileSystemOps = realFs,
): string | null {
  const parentPath = dirname(path)

  // If we're at or above the repo root, no parent
  if (
    parentPath === repoRoot ||
    parentPath === dirname(repoRoot) ||
    parentPath === path
  ) {
    return null
  }

  // Check if parent folder node already exists
  const parentNode = getNodeByPath(db, parentPath)
  if (parentNode) {
    return parentNode.id
  }

  // Recursively ensure grandparent exists first
  const grandparentId = ensureFolderHierarchy(
    db,
    parentPath,
    repoRoot,
    emitter,
    fs,
  )

  // Create the parent folder node
  try {
    const stat = fs.statSync(parentPath)
    const folderId = ulid()
    emitNodeCreated(emitter, "fs-watch", {
      id: folderId,
      type: "folder",
      fs_path: parentPath,
      fs_ino: stat.ino,
      fs_mtime: stat.mtimeMs,
      parent_id: grandparentId,
      content: basename(parentPath),
      data: { name: basename(parentPath) },
    })
    return folderId
  } catch {
    // Parent folder doesn't exist on filesystem
    return null
  }
}

/**
 * Handle new file/folder creation
 */
function handleCreate(
  db: Database,
  op: ReconcileOp,
  repoRoot: string,
  emitter: Emitter,
  fs: FileSystemOps = realFs,
  ctx?: ReconcileContext,
): void {
  const stat = fs.statSync(op.path)

  // Ensure all parent folders exist as nodes
  const parentId = ensureFolderHierarchy(db, op.path, repoRoot, emitter, fs)

  if (stat.isDirectory()) {
    // Create folder node
    emitNodeCreated(emitter, "fs-watch", {
      id: ulid(),
      type: "folder",
      fs_path: op.path,
      fs_ino: op.ino,
      fs_mtime: op.mtime ?? stat.mtimeMs,
      parent_id: parentId,
      content: basename(op.path),
      data: { name: basename(op.path) },
    })
  } else if (op.path.endsWith(".md")) {
    // Parse markdown file using the data layer
    const content = fs.readFileSync(op.path, "utf-8")
    const processed = processMarkdownFile(
      content,
      op.path,
      op.ino,
      op.mtime ?? stat.mtimeMs,
    )

    // Set parent and content_hash for file node
    // km-fast-md.0: Store content_hash so updates can skip parsing if unchanged
    const fileNode = processed.nodes[0]
    if (fileNode) {
      fileNode.parent_id = parentId
      fileNode.content_hash = processed.hash
    }

    // Emit creation events for all nodes
    for (const node of processed.nodes) {
      emitNodeCreated(
        emitter,
        "fs-watch",
        node as unknown as Record<string, unknown>,
      )
    }

    // Store wikilinks - use resolver for efficient lookup (avoids O(n²) DB queries)
    if (ctx?.resolver) {
      // Use data layer transform for batch resolution
      const resolvedLinks = toResolvedLinks(processed, ctx.resolver)
      for (const link of resolvedLinks) {
        addLink(db, link)
      }
    } else {
      // Fallback for single-file creation (no ctx) - use DB queries
      for (const { nodeId, link, relationship } of processed.wikilinks) {
        let targetId: string | null = null
        const targetFileNode = findNodeByName(db, link.target)
        if (targetFileNode) {
          targetId = targetFileNode.id
          if (link.section) {
            const childNode = findChildByContent(
              db,
              targetFileNode.id,
              link.section,
            )
            if (childNode) {
              targetId = childNode.id
            }
          }
        }

        addLink(db, {
          source_id: nodeId,
          target_name: link.target,
          target_id: targetId,
          section: link.section ?? null,
          block_id: link.blockId ?? null,
          alias: link.alias ?? null,
          embedded: link.embedded ?? false,
          relationship: relationship ?? null,
        })
      }
    }

    // Collect new file for batch link resolution and update resolver map
    const fileName = basename(op.path).replace(/\.md$/, "")
    if (fileNode && ctx) {
      ctx.newFiles.push({ id: fileNode.id, name: fileName })
      // Update resolver so subsequent files can link to this one
      ctx.resolver.addFile(fileNode.id, fileName)
    } else if (fileNode) {
      // Fallback for single-file creation (no ctx) - resolve immediately
      resolveLinks(db, fileNode.id, fileName)
    }
  } else {
    // Non-markdown file - create simple file node
    emitNodeCreated(emitter, "fs-watch", {
      id: ulid(),
      type: "file",
      fs_path: op.path,
      fs_ino: op.ino,
      fs_mtime: op.mtime ?? stat.mtimeMs,
      parent_id: parentId,
      name: basename(op.path),
      content: basename(op.path),
      data: { name: basename(op.path) },
    })
  }
}

// Use km-storage's findFileByName for link resolution (aliased as findNodeByName for local use)
const findNodeByName = findFileByName

/**
 * Apply reconciliation operations with parallel parsing.
 *
 * Uses async generator pipeline to parse markdown files in parallel,
 * then applies the results sequentially (DB writes must be serial).
 *
 * This is ~3x faster than applyReconcileOps for bulk operations (10+ files).
 */
export async function applyReconcileOpsAsync(
  db: Database,
  ops: ReconcileOp[],
  repoRoot: string,
  emitter: Emitter,
  parsePool: ParsePoolService,
  fs: FileSystemOps = realFs,
): Promise<void> {
  debug("applying %d reconcile ops (async)", ops.length)
  const start = Date.now()

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

  // Parse all markdown files in parallel using pipeline
  const parseResultMap = new Map<string, ParseResult>()
  if (parseJobs.length > 0) {
    debug("parallel parsing %d markdown files via pipeline", parseJobs.length)

    // Build sources for pipeline
    const sources: ParseSource[] = parseJobs.map((job) => ({
      path: job.op.path,
      nodeId: job.nodeId,
      isCreate: job.isCreate,
    }))

    // Use pipeline's parseFiles generator
    const parsedFiles = await collect(parseFiles(sources, parsePool))

    // Convert to ParseResult map for backward compatibility with apply logic
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
  }

  // Build lookup map once for efficient link resolution (avoids O(n²) DB queries)
  const resolver = createLinkResolver(db)
  debug("resolver ready with %d files", resolver.size)

  // Context for collecting new files for batch link resolution
  const ctx: ReconcileContext = { newFiles: [], resolver }

  // Map from generated IDs to parse jobs (for creates)
  const createJobMap = new Map<string, { op: ReconcileOp; nodeId: string }>()
  for (const job of parseJobs) {
    if (job.isCreate) {
      createJobMap.set(job.op.path, { op: job.op, nodeId: job.nodeId })
    }
  }

  // Apply ops sequentially (DB writes must be serial)
  for (const op of ops) {
    debug("applying op: %s %s", op.type, op.path)
    switch (op.type) {
      case "create": {
        const parseResult = parseResultMap.get(op.path)
        const createJob = createJobMap.get(op.path)
        if (parseResult && createJob) {
          // Use pre-parsed result for markdown files
          handleCreateWithParsed(
            db,
            op,
            parseResult,
            repoRoot,
            emitter,
            fs,
            ctx,
          )
        } else {
          // Non-markdown files or parse failures - use sync path
          handleCreate(db, op, repoRoot, emitter, fs, ctx)
        }
        break
      }
      case "update": {
        const parseResult = parseResultMap.get(op.path)
        if (parseResult && op.path.endsWith(".md")) {
          // Use pre-parsed result for markdown files
          handleUpdateWithParsed(db, op, parseResult, emitter, ctx)
        } else {
          // Non-markdown files or parse failures - use sync path
          handleUpdate(db, op, repoRoot, emitter, fs, ctx)
        }
        break
      }
      case "rename":
        handleRename(emitter, op)
        break
      case "delete":
        handleDelete(emitter, op)
        break
    }
  }

  // Batch resolve links for all new files at once (avoids O(n²) per-file resolution)
  if (ctx.newFiles.length > 0) {
    const resolved = resolveLinksBatch(db, ctx.newFiles)
    debug(
      "batch resolved %d links for %d new files",
      resolved,
      ctx.newFiles.length,
    )
  }

  debug("applied %d ops (async) in %dms", ops.length, Date.now() - start)
}

/**
 * Handle new markdown file creation with pre-parsed content.
 */
function handleCreateWithParsed(
  db: Database,
  op: ReconcileOp,
  parsed: ParseResult,
  repoRoot: string,
  emitter: Emitter,
  fs: FileSystemOps = realFs,
  ctx?: ReconcileContext,
): void {
  // Ensure all parent folders exist as nodes
  const parentId = ensureFolderHierarchy(db, op.path, repoRoot, emitter, fs)

  // Convert ParseResult to ProcessedMarkdown-like structure
  const nodes = parsed.nodes as KNode[]
  const wikilinks = parsed.wikilinks as WikilinkRef[]

  // Set parent and content_hash for file node
  const fileNode = nodes[0]
  if (fileNode) {
    fileNode.parent_id = parentId
    fileNode.content_hash = parsed.hash
    // Ensure fs metadata is set (worker already computed these)
    fileNode.fs_path = op.path
    fileNode.fs_ino = parsed.ino
    fileNode.fs_mtime = parsed.mtime
  }

  // Emit creation events for all nodes
  for (const node of nodes) {
    emitNodeCreated(
      emitter,
      "fs-watch",
      node as unknown as Record<string, unknown>,
    )
  }

  // Store wikilinks - use resolver for efficient lookup
  if (ctx?.resolver) {
    const processed: ProcessedMarkdown = {
      path: op.path,
      hash: parsed.hash,
      nodes,
      wikilinks,
      warnings: [],
    }
    const resolvedLinks = toResolvedLinks(processed, ctx.resolver)
    for (const link of resolvedLinks) {
      addLink(db, link)
    }
  } else {
    // Fallback - use DB queries for target resolution
    for (const { nodeId, link, relationship } of wikilinks) {
      let targetId: string | null = null
      const targetFileNode = findNodeByName(db, link.target)
      if (targetFileNode) {
        targetId = targetFileNode.id
        if (link.section) {
          const childNode = findChildByContent(
            db,
            targetFileNode.id,
            link.section,
          )
          if (childNode) {
            targetId = childNode.id
          }
        }
      }

      addLink(db, {
        source_id: nodeId,
        target_name: link.target,
        target_id: targetId,
        section: link.section ?? null,
        block_id: link.blockId ?? null,
        alias: link.alias ?? null,
        embedded: link.embedded ?? false,
        relationship: relationship ?? null,
      })
    }
  }

  // Collect new file for batch link resolution and update resolver map
  const fileName = basename(op.path).replace(/\.md$/, "")
  if (fileNode && ctx) {
    ctx.newFiles.push({ id: fileNode.id, name: fileName })
    // Update resolver so subsequent files can link to this one
    ctx.resolver.addFile(fileNode.id, fileName)
  } else if (fileNode) {
    // Fallback for single-file creation (no ctx) - resolve immediately
    resolveLinks(db, fileNode.id, fileName)
  }
}

/**
 * Handle markdown file update with pre-parsed content.
 */
function handleUpdateWithParsed(
  db: Database,
  op: ReconcileOp,
  parsed: ParseResult,
  emitter: Emitter,
  ctx?: ReconcileContext,
): void {
  if (!op.nodeId) {
    return
  }

  // Use km-storage abstraction to get content hash
  const existingHash = getNodeContentHash(db, op.nodeId)

  // Skip if content hasn't actually changed
  if (existingHash === parsed.hash) {
    return
  }

  // Get existing nodes for this file using km-storage abstraction
  const existingNodes = getFileWithChildren(db, op.path)
  const newNodes = parsed.nodes as KNode[]

  debug(
    "handleUpdateWithParsed: existing nodes count=%d, new nodes count=%d",
    existingNodes.length,
    newNodes.length,
  )

  // Diff and emit changes
  const { changes, idMap } = diffNodes(existingNodes, newNodes)

  for (const change of changes) {
    switch (change.type) {
      case "created":
        if (change.node) {
          emitNodeCreated(
            emitter,
            "fs-watch",
            change.node as unknown as Record<string, unknown>,
          )
        }
        break
      case "updated":
        if (change.nodeId && change.changes) {
          emitNodeUpdated(emitter, "fs-watch", change.nodeId, change.changes)
        }
        break
      case "deleted":
        if (change.nodeId) emitNodeDeleted(emitter, "fs-watch", change.nodeId)
        break
    }
  }

  // Always update the file node's fs_mtime, fs_ino, and content_hash
  const updates: Record<string, unknown> = {
    fs_mtime: parsed.mtime,
    content_hash: parsed.hash,
  }
  if (parsed.ino) {
    updates.fs_ino = parsed.ino
  }
  emitNodeUpdated(emitter, "fs-watch", op.nodeId, updates)

  // Update wikilinks: remove old links from EXISTING nodes
  for (const node of existingNodes) {
    removeLinksFromSource(db, node.id)
  }

  // Add new links with source ID remapping (new parser IDs → existing DB IDs)
  const wikilinks = parsed.wikilinks as WikilinkRef[]
  if (ctx?.resolver) {
    const processed: ProcessedMarkdown = {
      path: op.path,
      hash: parsed.hash,
      nodes: newNodes,
      wikilinks,
      warnings: [],
    }
    const resolvedLinks = toResolvedLinks(processed, ctx.resolver)
    for (const link of resolvedLinks) {
      addLink(db, {
        ...link,
        source_id: idMap.get(link.source_id) ?? link.source_id,
      })
    }
  } else {
    // Fallback - use DB queries for target resolution
    for (const { nodeId, link, relationship } of wikilinks) {
      const mappedSourceId = idMap.get(nodeId) ?? nodeId

      let targetId: string | null = null
      const fileNode = findNodeByName(db, link.target)
      if (fileNode) {
        targetId = fileNode.id
        if (link.section) {
          const childNode = findChildByContent(db, fileNode.id, link.section)
          if (childNode) {
            targetId = childNode.id
          }
        }
      }

      addLink(db, {
        source_id: mappedSourceId,
        target_name: link.target,
        target_id: targetId,
        section: link.section ?? null,
        block_id: link.blockId ?? null,
        alias: link.alias ?? null,
        embedded: link.embedded ?? false,
        relationship: relationship ?? null,
      })
    }
  }
}

/**
 * Handle file modification
 */
function handleUpdate(
  db: Database,
  op: ReconcileOp,
  _repoRoot: string,
  emitter: Emitter,
  fs: FileSystemOps = realFs,
  ctx?: ReconcileContext,
): void {
  if (!op.nodeId) {
    return
  }

  // For non-.md files, just update mtime/ino tracking
  if (!op.path.endsWith(".md")) {
    const updates: Record<string, unknown> = { fs_mtime: op.mtime }
    if (op.ino !== undefined) {
      updates.fs_ino = op.ino
    }
    emitNodeUpdated(emitter, "fs-watch", op.nodeId, updates)
    return
  }

  const content = fs.readFileSync(op.path, "utf-8")
  const stat = fs.statSync(op.path)
  const newMtime = op.mtime ?? stat.mtimeMs

  // Parse using the data layer
  const processed = processMarkdownFile(content, op.path, stat.ino, newMtime)

  // Use km-storage abstraction to get content hash
  const existingHash = getNodeContentHash(db, op.nodeId)

  // Skip if content hasn't actually changed
  if (existingHash === processed.hash) {
    return
  }

  // Get existing nodes for this file using km-storage abstraction
  const existingNodes = getFileWithChildren(db, op.path)
  debug(
    "handleUpdate: existing nodes count=%d, ids=%O",
    existingNodes.length,
    existingNodes.map((n) => ({
      id: n.id,
      type: n.type,
      parent_idx: n.parent_idx,
    })),
  )

  debug(
    "handleUpdate: new nodes count=%d, ids=%O",
    processed.nodes.length,
    processed.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      parent_idx: n.parent_idx,
    })),
  )

  // Diff and emit changes
  const { changes, idMap } = diffNodes(existingNodes, processed.nodes)
  debug(
    "handleUpdate: changes=%O",
    changes.map((c) => ({ type: c.type, nodeId: c.nodeId, node: c.node?.id })),
  )
  debug("handleUpdate: idMap (new→existing)=%O", Object.fromEntries(idMap))

  for (const change of changes) {
    switch (change.type) {
      case "created":
        if (change.node) {
          emitNodeCreated(
            emitter,
            "fs-watch",
            change.node as unknown as Record<string, unknown>,
          )
        }
        break
      case "updated":
        if (change.nodeId && change.changes) {
          emitNodeUpdated(emitter, "fs-watch", change.nodeId, change.changes)
        }
        break
      case "deleted":
        if (change.nodeId) emitNodeDeleted(emitter, "fs-watch", change.nodeId)
        break
    }
  }

  // Always update the file node's fs_mtime, fs_ino, and content_hash to track the last synced state
  // km-fast-md.0: Store content_hash so subsequent updates can skip parsing if unchanged
  if (op.nodeId) {
    const updates: Record<string, unknown> = {
      fs_mtime: newMtime,
      content_hash: processed.hash,
    }
    // Update fs_ino if it changed (atomic write detection)
    if (op.ino !== undefined) {
      updates.fs_ino = op.ino
    }
    emitNodeUpdated(emitter, "fs-watch", op.nodeId, updates)
  }

  // Update wikilinks: remove old links from EXISTING nodes (not new ones)
  // Note: processed.nodes have brand new IDs, so we need to use existingNodes for removal
  debug(
    "handleUpdate: removing links from existing nodes: %O",
    existingNodes.map((n) => n.id),
  )
  for (const node of existingNodes) {
    removeLinksFromSource(db, node.id)
  }

  // Add new links with source ID remapping (new parser IDs → existing DB IDs)
  if (ctx?.resolver) {
    // Use data layer transform for batch resolution, then remap source IDs
    const resolvedLinks = toResolvedLinks(processed, ctx.resolver)
    for (const link of resolvedLinks) {
      addLink(db, {
        ...link,
        source_id: idMap.get(link.source_id) ?? link.source_id,
      })
    }
  } else {
    // Fallback - use DB queries for target resolution
    for (const { nodeId, link, relationship } of processed.wikilinks) {
      const mappedSourceId = idMap.get(nodeId) ?? nodeId

      let targetId: string | null = null
      const fileNode = findNodeByName(db, link.target)
      if (fileNode) {
        targetId = fileNode.id
        if (link.section) {
          const childNode = findChildByContent(db, fileNode.id, link.section)
          if (childNode) {
            targetId = childNode.id
          }
        }
      }

      addLink(db, {
        source_id: mappedSourceId,
        target_name: link.target,
        target_id: targetId,
        section: link.section ?? null,
        block_id: link.blockId ?? null,
        alias: link.alias ?? null,
        embedded: link.embedded ?? false,
        relationship: relationship ?? null,
      })
    }
  }
}

/**
 * Handle file/folder rename
 */
function handleRename(emitter: Emitter, op: ReconcileOp): void {
  if (!op.nodeId) return

  emitNodeUpdated(emitter, "fs-watch", op.nodeId, {
    fs_path: op.path,
  })
}

/**
 * Handle file/folder deletion
 */
function handleDelete(emitter: Emitter, op: ReconcileOp): void {
  if (!op.nodeId) return

  emitNodeDeleted(emitter, "fs-watch", op.nodeId)
}

/**
 * Diff existing nodes against new nodes
 */
interface NodeChange {
  type: "created" | "updated" | "deleted"
  nodeId?: string
  node?: KNode
  changes?: Record<string, unknown>
}

/**
 * Match nodes by structural position (parent_id + parent_idx + type).
 * This is more stable than md_pos which shifts when content changes.
 */
function makeStructuralKey(node: KNode): string {
  return `${node.parent_id ?? "root"}:${node.parent_idx ?? 0}:${node.type}`
}

interface DiffResult {
  changes: NodeChange[]
  idMap: Map<string, string> // new ID → existing ID
}

function diffNodes(existing: KNode[], newNodes: KNode[]): DiffResult {
  const changes: NodeChange[] = []

  // Index existing by structural key (parent + index + type)
  const existingByKey = new Map<string, KNode>()
  for (const node of existing) {
    const key = makeStructuralKey(node)
    existingByKey.set(key, node)
  }

  // Map from new node IDs to existing node IDs (for parent_id remapping)
  const idMap = new Map<string, string>()

  // First pass: match file nodes by type (always root)
  const existingFile = existing.find((n) => n.type === "file")
  const newFile = newNodes.find((n) => n.type === "file")
  if (existingFile && newFile) {
    idMap.set(newFile.id, existingFile.id)
  }

  // Process non-file nodes with remapped parent IDs
  for (const node of newNodes) {
    if (node.type === "file") continue

    // Remap parent_id for key lookup
    const remappedParentId = node.parent_id
      ? (idMap.get(node.parent_id) ?? node.parent_id)
      : null
    const key = `${remappedParentId ?? "root"}:${node.parent_idx ?? 0}:${node.type}`

    const existingNode = existingByKey.get(key)

    if (!existingNode) {
      // New node - need to remap its parent_id to existing parent
      const nodeToCreate = { ...node }
      if (nodeToCreate.parent_id && idMap.has(nodeToCreate.parent_id)) {
        const mappedId = idMap.get(nodeToCreate.parent_id)
        if (mappedId) {
          nodeToCreate.parent_id = mappedId
        }
      }
      changes.push({
        type: "created",
        node: nodeToCreate,
      })
    } else {
      // Map new ID to existing ID for child nodes
      idMap.set(node.id, existingNode.id)

      // Check for changes
      const nodeChanges: Record<string, unknown> = {}

      if (node.content !== existingNode.content) {
        nodeChanges.content = node.content
      }
      if (node.task_status !== existingNode.task_status) {
        nodeChanges.task_status = node.task_status
      }
      if (node.task_mark !== existingNode.task_mark) {
        nodeChanges.task_mark = node.task_mark
      }
      // Compare data field for mentions, tags, projects changes
      const newData = JSON.stringify(node.data ?? {})
      const existingData = JSON.stringify(existingNode.data ?? {})
      if (newData !== existingData) {
        nodeChanges.data = node.data
      }
      // Update md_pos since it may have shifted
      if (node.md_pos !== existingNode.md_pos) {
        nodeChanges.md_pos = node.md_pos
      }

      if (Object.keys(nodeChanges).length > 0) {
        changes.push({
          type: "updated",
          nodeId: existingNode.id,
          changes: nodeChanges,
        })
      }

      existingByKey.delete(key)
    }
  }

  // Handle file node updates
  if (existingFile && newFile) {
    const nodeChanges: Record<string, unknown> = {}
    if (newFile.content !== existingFile.content) {
      nodeChanges.content = newFile.content
    }
    if (newFile.title !== existingFile.title) {
      nodeChanges.title = newFile.title
    }
    const newData = JSON.stringify(newFile.data ?? {})
    const existingData = JSON.stringify(existingFile.data ?? {})
    if (newData !== existingData) {
      nodeChanges.data = newFile.data
    }
    if (Object.keys(nodeChanges).length > 0) {
      changes.push({
        type: "updated",
        nodeId: existingFile.id,
        changes: nodeChanges,
      })
    }
    // Remove file from remaining check
    const fileKey = makeStructuralKey(existingFile)
    existingByKey.delete(fileKey)
  }

  // Remaining existing nodes were deleted
  for (const [, node] of existingByKey) {
    // Don't delete file nodes
    if (node.type === "file") continue
    changes.push({
      type: "deleted",
      nodeId: node.id,
    })
  }

  return { changes, idMap }
}

/**
 * Get parent node ID from filesystem path
 */
export function getParentNodeId(db: Database, fsPath: string): string | null {
  const parentPath = dirname(fsPath)
  const parentNode = getNodeByPath(db, parentPath)
  return parentNode?.id ?? null
}
