/**
 * Create handler - handles new file/folder creation
 *
 * Unified handler that works with both:
 * - Filesystem parsing (reads and parses file)
 * - Pre-parsed content (from parallel parsing pipeline)
 */

import { basename, dirname } from "path"
import { toRelativeFsPath } from "../../path-utils.ts"
import { ulid } from "ulid"
import type { Database } from "bun:sqlite"
import { generatePathBasedId } from "../../id-utils.ts"
import type { KNode } from "@km/core"
import { emitNodeCreated, emitNodeUpdated, type Emitter } from "../../emitter.ts"
import { getNodeByPath } from "../../db-queries/core-lookup.ts"
import { addLink } from "../../db-links.ts"
import type { LinkResolver } from "../../link-resolver.ts"
import {
  processMarkdownFile,
  toResolvedLinks,
  type ProcessedMarkdown,
  type WikilinkRef,
} from "../../markdown-processing.ts"
import { parsePlainTextToNodes } from "@km/markdown"
import type { FileSystemOps } from "../writequeue.ts"
import type { ReconcileOp } from "../reconcile.ts"
import { handleUpdate } from "./update-handler.ts"
import type { ParseResult } from "../../parse-pool.ts"

/**
 * Context for tracking state during reconciliation.
 * Enables efficient link resolution via lookup maps.
 */
export interface ReconcileContext {
  /** Newly created file nodes: {id, name} */
  newFiles: Array<{ id: string; name: string }>
  /** Pre-built lookup map for efficient link resolution */
  resolver: LinkResolver
  /** Index file candidates created this batch — synced after all files exist */
  indexFileCandidates?: Array<{ nodeId: string; parentId: string }>
  /** Index files modified (created or updated) this batch — re-synced after all ops */
  modifiedIndexFiles?: Set<string>
  /** Folder IDs that need index file refresh (child added/removed/moved) */
  foldersToRefresh?: Set<string>
  /** Folder IDs whose index files were deleted — need re-materialization */
  foldersNeedingIndexUpdate?: Set<string>
}

/**
 * Options for create handler
 */
export interface CreateHandlerOptions {
  db: Database
  op: ReconcileOp
  repoRoot: string
  emitter: Emitter
  fs: FileSystemOps
  ctx: ReconcileContext
  /** Pre-parsed content (optional - if not provided, will parse from filesystem) */
  parsed?: ParseResult
}

/**
 * Handle new file/folder creation
 *
 * Unified handler that works with both filesystem parsing and pre-parsed content.
 */
export function handleCreate(options: CreateHandlerOptions): void {
  const { db, op, repoRoot, emitter, fs, parsed, ctx } = options

  // Guard against duplicate creates for the same file.
  // The fs-watcher can fire duplicate events for the same file (~200ms apart),
  // each generating a fresh ULID. If a node with this fs_path already exists,
  // treat as update instead of creating a duplicate entry.
  const relPath = toRelativeFsPath(repoRoot, op.path)
  const existingNode = getNodeByPath(db, relPath)
  if (existingNode) {
    // Redirect to update handler with the existing node's ID
    handleUpdate({ ...options, op: { ...op, type: "update" as const, nodeId: existingNode.id } })
    return
  }

  // Ensure all parent folders exist as nodes (and add them to resolver for linking)
  const parentId = ensureFolderHierarchy(db, op.path, repoRoot, emitter, fs, ctx.resolver)

  // Get stats - either from parsed result or filesystem
  const stat = parsed ? null : fs.statSync(op.path)

  if (stat?.isDirectory()) {
    // Create folder node - use path-based ID for consistency with discovery.ts
    const folderRelPath = toRelativeFsPath(repoRoot, op.path)
    const folderId = getFolderNodeId(db, repoRoot, op.path, folderRelPath)
    const folderName = basename(op.path)
    emitNodeCreated(emitter, "fs-watch", {
      id: folderId,
      type: "h",
      item: true,
      fstype: "folder",
      fs_path: folderRelPath,
      fs_ino: op.ino,
      fs_mtime: op.mtime ?? stat.mtimeMs,
      parent_id: parentId,
      name: folderName, // Folder name for link resolution (e.g., "inbox" for [[inbox]])
      content: folderName,
      data: {},
    })
    // Add folder to resolver so subsequent files can link to it (e.g., ![[inbox]])
    options.ctx.resolver.addFile(folderId, folderName)

    // Mark parent folder for index refresh (new subfolder needs to appear in materialized index)
    if (parentId) {
      ctx.foldersToRefresh ??= new Set()
      ctx.foldersToRefresh.add(parentId)
    }
    return
  }

  if (op.path.endsWith(".md")) {
    handleMarkdownCreate(options, parentId, stat)
  } else if (op.path.endsWith(".txt")) {
    handleTxtCreate(options, parentId, stat)
  } else if (stat) {
    // Non-parseable file - create simple file node
    emitNodeCreated(emitter, "fs-watch", {
      id: ulid(),
      type: "h",
      item: true,
      fstype: "file",
      fs_path: toRelativeFsPath(repoRoot, op.path),
      fs_ino: op.ino,
      fs_mtime: op.mtime ?? stat.mtimeMs,
      parent_id: parentId,
      name: basename(op.path),
      content: basename(op.path),
      data: { name: basename(op.path) },
    })

    // Mark parent folder for index refresh (new file needs to appear in materialized index)
    if (parentId) {
      ctx.foldersToRefresh ??= new Set()
      ctx.foldersToRefresh.add(parentId)
    }
  }
}

/**
 * Handle markdown file creation
 */
function handleMarkdownCreate(
  options: CreateHandlerOptions,
  parentId: string | null,
  stat: ReturnType<FileSystemOps["statSync"]> | null,
): void {
  const { db, op, repoRoot, emitter, fs, ctx, parsed } = options

  // Get nodes and wikilinks - either from parsed result or parse from filesystem
  let nodes: KNode[]
  let wikilinks: WikilinkRef[]
  let hash: string
  let ino: number | undefined
  let mtime: number

  if (parsed) {
    // Use pre-parsed result
    nodes = parsed.nodes as KNode[]
    wikilinks = parsed.wikilinks as WikilinkRef[]
    hash = parsed.hash
    ino = parsed.ino
    mtime = parsed.mtime
  } else {
    // Parse from filesystem
    const content = fs.readFileSync(op.path, "utf-8")
    const fileStat = stat ?? fs.statSync(op.path)
    const processed = processMarkdownFile(content, op.path, op.ino, op.mtime ?? fileStat.mtimeMs)
    nodes = processed.nodes
    wikilinks = processed.wikilinks
    hash = processed.hash
    ino = op.ino
    mtime = op.mtime ?? fileStat.mtimeMs
  }

  // Set parent and content_hash for file node
  const fileNode = nodes[0]
  if (fileNode) {
    fileNode.parent_id = parentId
    fileNode.content_hash = hash
    // Ensure fs metadata is set — store relative path
    fileNode.fs_path = toRelativeFsPath(repoRoot, op.path)
    if (ino !== undefined) fileNode.fs_ino = ino
    fileNode.fs_mtime = mtime
  }

  // Emit creation events for all nodes
  for (const node of nodes) {
    emitNodeCreated(emitter, "fs-watch", node as unknown as Record<string, unknown>)
  }

  // Store wikilinks - use resolver for efficient lookup
  if (!ctx.resolver) {
    throw new Error("handleCreate called without resolver context")
  }
  const processed: ProcessedMarkdown = {
    path: op.path,
    hash,
    nodes,
    wikilinks,
    warnings: [],
  }
  const resolvedLinks = toResolvedLinks(processed, ctx.resolver)
  for (const link of resolvedLinks) {
    addLink(db, link)

    // Emit embed_source update so the in-memory store stays in sync.
    // addLink sets embed_source on the DB node directly (no events),
    // but the node was already emitted via emitNodeCreated with embed_source: null.
    if (link.embedded && link.target_id) {
      emitNodeUpdated(emitter, "fs-watch", link.source_id, {
        embed_source: link.target_id,
        name: link.alias,
      })
    }
  }

  // Collect new file for batch link resolution and update resolver map
  const fileName = basename(op.path).replace(/\.md$/, "")
  if (fileNode) {
    ctx.newFiles.push({ id: fileNode.id, name: fileName })
    // Update resolver so subsequent files can link to this one
    ctx.resolver.addFile(fileNode.id, fileName)

    // Mark for post-batch index file sync (can't sync during creation because siblings may not exist yet)
    if (parentId) {
      ctx.indexFileCandidates ??= []
      ctx.indexFileCandidates.push({ nodeId: fileNode.id, parentId })

      // Mark parent folder for index refresh (new child needs to appear in materialized index)
      ctx.foldersToRefresh ??= new Set()
      ctx.foldersToRefresh.add(parentId)
    }
  }
}

/**
 * Handle plain text file creation
 */
function handleTxtCreate(
  options: CreateHandlerOptions,
  parentId: string | null,
  stat: ReturnType<FileSystemOps["statSync"]> | null,
): void {
  const { op, repoRoot, emitter, fs, ctx } = options

  const content = fs.readFileSync(op.path, "utf-8")
  const fileStat = stat ?? fs.statSync(op.path)
  const { nodes } = parsePlainTextToNodes(content, op.path, op.ino, op.mtime ?? fileStat.mtimeMs)

  const fileNode = nodes[0]
  if (fileNode) {
    fileNode.parent_id = parentId
    fileNode.fs_path = toRelativeFsPath(repoRoot, op.path)
    if (op.ino !== undefined) fileNode.fs_ino = op.ino
    fileNode.fs_mtime = op.mtime ?? fileStat.mtimeMs
  }

  for (const node of nodes) {
    emitNodeCreated(emitter, "fs-watch", node as unknown as Record<string, unknown>)
  }

  // Update resolver map
  const fileName = basename(op.path).replace(/\.txt$/, "")
  if (fileNode) {
    ctx.newFiles.push({ id: fileNode.id, name: fileName })
    ctx.resolver.addFile(fileNode.id, fileName)

    // Mark parent folder for index refresh (new file needs to appear in materialized index)
    if (parentId) {
      ctx.foldersToRefresh ??= new Set()
      ctx.foldersToRefresh.add(parentId)
    }
  }
}

/**
 * Generate a folder node ID, handling the case where a folder was renamed away
 * and a new folder was created at the same path. The path-based ID would collide
 * with the old (renamed) node, so we fall back to ULID.
 */
function getFolderNodeId(db: Database, repoRoot: string, absPath: string, relPath: string): string {
  const pathId = generatePathBasedId(repoRoot, absPath)
  // Check if the path-based ID is already used by a DIFFERENT node (renamed away)
  const existing = db.prepare("SELECT fs_path FROM nodes WHERE id = ?").get(pathId) as { fs_path: string } | null
  if (existing && existing.fs_path !== relPath) {
    // ID collision: old folder was renamed away, use ULID for new folder
    return ulid()
  }
  return pathId
}

/**
 * Ensure all ancestor folders exist as nodes, creating them if needed.
 * Returns the ID of the immediate parent folder node.
 * Adds created folders to the resolver for link resolution.
 */
function ensureFolderHierarchy(
  db: Database,
  path: string,
  repoRoot: string,
  emitter: Emitter,
  fs: FileSystemOps,
  resolver: LinkResolver,
): string | null {
  const parentPath = dirname(path)

  // At repo root → parent is the root node "."
  if (parentPath === repoRoot) {
    return "."
  }

  // Above the repo root or at filesystem root → no parent
  if (parentPath === dirname(repoRoot) || parentPath === path) {
    return null
  }

  // Check if parent folder node already exists (DB stores relative paths)
  const parentNode = getNodeByPath(db, toRelativeFsPath(repoRoot, parentPath))
  if (parentNode) {
    return parentNode.id
  }

  // Recursively ensure grandparent exists first
  const grandparentId = ensureFolderHierarchy(db, parentPath, repoRoot, emitter, fs, resolver)

  // Create the parent folder node - use path-based ID for consistency with discovery.ts
  try {
    const stat = fs.statSync(parentPath)
    const relPath = toRelativeFsPath(repoRoot, parentPath)
    const folderId = getFolderNodeId(db, repoRoot, parentPath, relPath)
    const folderName = basename(parentPath)
    emitNodeCreated(emitter, "fs-watch", {
      id: folderId,
      type: "h",
      item: true,
      fstype: "folder",
      fs_path: relPath,
      fs_ino: stat.ino,
      fs_mtime: stat.mtimeMs,
      parent_id: grandparentId,
      name: folderName, // Folder name for link resolution
      content: folderName,
      data: {},
    })
    // Add folder to resolver so files can link to it (e.g., ![[inbox]])
    resolver.addFile(folderId, folderName)
    return folderId
  } catch {
    // Parent folder doesn't exist on filesystem
    return null
  }
}
