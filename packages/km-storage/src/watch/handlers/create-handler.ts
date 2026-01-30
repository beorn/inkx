/**
 * Create handler - handles new file/folder creation
 *
 * Unified handler that works with both:
 * - Filesystem parsing (reads and parses file)
 * - Pre-parsed content (from parallel parsing pipeline)
 */

import { basename, dirname } from "path"
import { ulid } from "ulid"
import type { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import { emitNodeCreated, type Emitter } from "../../emitter.ts"
import { getNodeByPath } from "../../db-queries/core-lookup.ts"
import { addLink } from "../../db-links.ts"
import type { LinkResolver } from "../../link-resolver.ts"
import {
  processMarkdownFile,
  toResolvedLinks,
  type ProcessedMarkdown,
  type WikilinkRef,
} from "../../markdown-processing.ts"
import type { FileSystemOps } from "../writequeue.ts"
import type { ReconcileOp } from "../reconcile.ts"
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
  const { db, op, repoRoot, emitter, fs, parsed } = options

  // Ensure all parent folders exist as nodes
  const parentId = ensureFolderHierarchy(db, op.path, repoRoot, emitter, fs)

  // Get stats - either from parsed result or filesystem
  const stat = parsed ? null : fs.statSync(op.path)

  if (stat?.isDirectory()) {
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
    return
  }

  if (op.path.endsWith(".md")) {
    handleMarkdownCreate(options, parentId, stat)
  } else if (stat) {
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

/**
 * Handle markdown file creation
 */
function handleMarkdownCreate(
  options: CreateHandlerOptions,
  parentId: string | null,
  stat: ReturnType<FileSystemOps["statSync"]> | null,
): void {
  const { db, op, emitter, fs, ctx, parsed } = options

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
    const processed = processMarkdownFile(
      content,
      op.path,
      op.ino,
      op.mtime ?? fileStat.mtimeMs,
    )
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
    // Ensure fs metadata is set
    fileNode.fs_path = op.path
    if (ino !== undefined) fileNode.fs_ino = ino
    fileNode.fs_mtime = mtime
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
  }

  // Collect new file for batch link resolution and update resolver map
  const fileName = basename(op.path).replace(/\.md$/, "")
  if (fileNode) {
    ctx.newFiles.push({ id: fileNode.id, name: fileName })
    // Update resolver so subsequent files can link to this one
    ctx.resolver.addFile(fileNode.id, fileName)
  }
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
  fs: FileSystemOps,
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
